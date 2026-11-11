// Strategy engine — pure functions, no deps, no DOM.
// Three jobs: generate a plan, compute live metrics, regenerate the remainder.
// All times seconds, fuel liters, distance laps.

const Engine = (() => {

  // ---- helpers ----
  const tiresPerChange = (cfg) => cfg.tire_count_mode === "set" ? 4 : 1;

  function conditionAt(weather, elapsed_s) {
    let cur = weather[0] || { condition: "dry", wetness: 0 };
    for (const seg of weather) if (seg.start_s <= elapsed_s) cur = seg;
    return cur;
  }

  function lapFuelAt(cfg, cond) {
    return cond.condition === "wet" ? cfg.fuel_per_lap * cfg.wet_fuel_factor : cfg.fuel_per_lap;
  }
  function lapTimeAt(cfg, cond) {
    return cond.condition === "wet" ? cfg.avg_lap_s * cfg.wet_lap_factor : cfg.avg_lap_s;
  }

  function lapsPerTank(cfg, cond) {
    return Math.max(1, Math.floor(cfg.tank_cap / lapFuelAt(cfg, cond)) - cfg.fuel_margin_laps);
  }

  // Rough total race laps (time-based race; last lap crosses the flag).
  function estTotalLaps(cfg, weather) {
    // Time-based race: count laps that actually fit in the duration after both
    // pit-stop time AND the slower wet pace. Estimate stops from fuel range,
    // subtract their time, then walk the weather timeline lap by lap.
    const dryCond = { condition: "dry", wetness: 0 };
    let stintLaps = Math.max(1, lapsPerTank(cfg, dryCond));
    // Short-fuel cap (equal-stint strategy) means more, shorter stints = more stops.
    if (cfg.max_stint_laps) stintLaps = Math.min(stintLaps, cfg.max_stint_laps);
    const rawLaps = cfg.duration_s / cfg.avg_lap_s;
    const estStops = Math.max(0, Math.ceil(rawLaps / stintLaps) - 1);
    const racing_s = Math.max(0, cfg.duration_s - estStops * cfg.pit_loss_s);
    let laps = 0, t = 0;
    while (laps < 100000) {
      const cond = conditionAt(weather, t);
      const lap_s = (cond.condition === "wet" || cond.wetness > 0)
        ? cfg.avg_lap_s * cfg.wet_lap_factor : cfg.avg_lap_s;
      if (t + lap_s > racing_s) break;
      t += lap_s; laps++;
    }
    return Math.max(1, laps);
  }

  // ---- layer 1: generate full plan ----
  // start = { lap: 0, elapsed_s: 0, fuel_now: tank, tires_used: 0, driver_idx: 0 }
  function generatePlan(cfg, weather, start) {
    start = start || { lap: 0, elapsed_s: 0, fuel_now: cfg.tank_cap, tires_used: 0, driver_idx: 0 };
    const totalLaps = estTotalLaps(cfg, weather);
    const perChange = tiresPerChange(cfg);
    const budgetLeft = () => cfg.tire_budget - usedTires;

    let stints = [];
    let lap = start.lap;
    let elapsed = start.elapsed_s;
    let usedTires = start.tires_used;
    let driver = start.driver_idx;
    let prevCompound = null;
    let lapsOnSet = 0;           // laps run on the current tyre set
    let idx = 0;

    while (lap < totalLaps) {
      const cond = conditionAt(weather, elapsed);
      const maxFuelLaps = lapsPerTank(cfg, cond);

      // choose compound: wet if raining, else target-driven
      let compound;
      if (cond.condition === "wet") compound = "wet";
      else if (cfg.optimize_target === "fastest") compound = "soft";
      else if (cfg.optimize_target === "safest") compound = "hard";
      else compound = "med"; // fewest_stops

      const tireLaps = cfg.tire_life_laps[compound] || maxFuelLaps;

      // stint length limited by fuel, tires, race end — and an optional short-fuel
      // cap (equal-stint plan: pit early so every driver gets the same seat time).
      let stintLen = Math.min(maxFuelLaps, tireLaps, totalLaps - lap);
      if (cfg.max_stint_laps) stintLen = Math.min(stintLen, cfg.max_stint_laps);

      // tire action: reuse (double-stint) if same compound still has life & budget tight
      let tireAction = "new";
      if (idx > 0) {
        // keep a reserve set (wets / damage) out of the dry allocation
        const reserve = cfg.tire_reserve_sets || 0;
        const budgetSetsLeft = Math.floor(budgetLeft() / perChange) - reserve;
        const stintsLeftEst = Math.ceil((totalLaps - lap) / maxFuelLaps);
        const mustRation = budgetSetsLeft < stintsLeftEst;
        const setHasLife = (lapsOnSet + stintLen) <= tireLaps;   // don't over-run a set
        if (mustRation && prevCompound === compound && setHasLife) tireAction = "stay";
      }
      if (tireAction === "new") { usedTires += perChange; lapsOnSet = stintLen; }
      else { lapsOnSet += stintLen; }

      const stintTime = stintLen * lapTimeAt(cfg, cond);
      // explicit rotation if given (driver_sequence), else plain round-robin.
      const seq = (cfg.driver_sequence && cfg.driver_sequence.length) ? cfg.driver_sequence : null;
      const driverName = seq ? seq[driver % seq.length] : cfg.driver_names[driver % cfg.n_drivers];
      stints.push({
        idx,
        status: "future",
        driver: driverName,
        in_lap: lap,
        in_time_s: elapsed,
        tire_compound: compound,
        tire_action: tireAction,
        fuel_load: Math.min(cfg.tank_cap, stintLen * lapFuelAt(cfg, cond) + cfg.fuel_margin_laps * lapFuelAt(cfg, cond)),
        target_laps: stintLen
      });

      lap += stintLen;
      elapsed += stintTime + (lap < totalLaps ? cfg.pit_loss_s : 0);
      driver++;
      prevCompound = compound;
      idx++;
      if (idx > 200) break; // safety
    }

    // Fold a tiny final stint (time-based remainder, e.g. 1 lap) into the one
    // before it — avoids a degenerate extra "stint"/stop at the flag.
    const TAIL_MIN = 6;
    if (stints.length > 1) {
      const last = stints[stints.length - 1];
      if (last.target_laps < TAIL_MIN) {
        const prev = stints[stints.length - 2];
        prev.target_laps += last.target_laps;
        if (last.tire_action === "new") usedTires -= perChange;
        stints.pop();
      }
    }

    return {
      stints,
      total_laps: totalLaps,
      stops: Math.max(0, stints.length - 1),
      tires_used: usedTires,
      tires_over_budget: usedTires > cfg.tire_budget,
      finish_time_s: elapsed
    };
  }

  // ---- layer 2: live metrics ----
  // state = { fuel_now, laps_done, stint_lap, avg_lap_live, elapsed_s, remaining_stops }
  function liveMetrics(cfg, state, plan, weather) {
    const cond = conditionAt(weather, state.elapsed_s);
    const fpl = lapFuelAt(cfg, cond);
    const fuelLapsLeft = state.fuel_now / fpl;
    const pitInLaps = Math.max(0, Math.floor(fuelLapsLeft - cfg.fuel_margin_laps));
    const lapsLeft = plan.total_laps - state.laps_done;
    const remStops = state.remaining_stops != null ? state.remaining_stops : Math.max(0, plan.stops);
    const fuelNeeded = lapsLeft * fpl;
    const fuelAvail = state.fuel_now + remStops * cfg.tank_cap;
    return {
      fuel_laps_left: +fuelLapsLeft.toFixed(1),
      pit_in_laps: pitInLaps,
      laps_left: lapsLeft,
      make_finish: fuelAvail >= fuelNeeded,
      fuel_deficit: +(fuelNeeded - fuelAvail).toFixed(1), // >0 = short
      weather_now: cond.condition
    };
  }

  // ---- layer 3: regenerate remainder ----
  // lock done/active stints, rebuild the rest from current real state.
  function regenerate(cfg, weather, currentState, lockedStints) {
    const tail = generatePlan(cfg, weather, {
      lap: currentState.laps_done,
      elapsed_s: currentState.elapsed_s,
      fuel_now: currentState.fuel_now,
      tires_used: currentState.tires_used,
      driver_idx: currentState.driver_idx
    });
    // reindex tail after locked stints
    const base = (lockedStints || []).length;
    tail.stints.forEach((s, i) => { s.idx = base + i; });
    return {
      stints: [...(lockedStints || []), ...tail.stints],
      total_laps: tail.total_laps,
      stops: Math.max(0, (lockedStints || []).length + tail.stints.length - 1),
      tires_used: currentState.tires_used + tail.tires_used,
      tires_over_budget: (currentState.tires_used + tail.tires_used) > cfg.tire_budget,
      finish_time_s: tail.finish_time_s
    };
  }

  // ---- what-if: non-destructive scenario ----
  function whatIf(cfg, weather, currentState, lockedStints, overrides) {
    const c2 = Object.assign({}, cfg, overrides.config || {});
    const w2 = overrides.weather || weather;
    const s2 = Object.assign({}, currentState, overrides.state || {});
    return regenerate(c2, w2, s2, lockedStints);
  }

  // ---- damage: summary + repair decision (LMU categories) ----
  // dmg = { aero_pct, body_pct, susp_pct, tyres_pct, repair_s (LMU estimate),
  //         wheels:[{wear,brakeTemp,temp,press,flat,detached} x4] }
  function damageSummary(cfg, dmg) {
    const cats = { aero:dmg.aero_pct||0, body:dmg.body_pct||0, susp:dmg.susp_pct||0, tyres:dmg.tyres_pct||0 };
    const worst = Math.max(cats.aero, cats.body, cats.susp, cats.tyres);
    const wheels = dmg.wheels || [];
    const flats = wheels.filter(w => w.flat || w.detached).length;
    const mandatory = flats > 0 || cats.susp >= (cfg.damage?.susp_critical ?? 25);
    const severe = worst >= (cfg.damage?.severe_pct ?? 20);
    return { cats, worst, flats, mandatory, severe };
  }

  // Auto-recommend repair. penalty_s = MEASURED lap-time loss (avg_after - baseline), per lap.
  // opts = { pitting_anyway:bool, repair_time_s:num }  (repair time comes from LMU: dmg.repair_s)
  function repairDecision(cfg, dmg, penalty_s, lapsRemaining, opts) {
    opts = opts || {};
    const sum = damageSummary(cfg, dmg);
    const repairT = opts.repair_time_s != null ? opts.repair_time_s
                   : (dmg.repair_s != null ? dmg.repair_s : (cfg.damage?.repair_fallback_s ?? 30));
    const stayOutCost = Math.max(0, (penalty_s || 0) * (lapsRemaining || 0));
    const repairCost = opts.pitting_anyway ? repairT : (cfg.pit_loss_s + repairT);
    let rec;
    if (sum.mandatory) rec = "REPAIR_NOW";
    else if (sum.severe) rec = "REPAIR";
    else rec = repairCost < stayOutCost ? "REPAIR" : "STAY_OUT";
    return {
      recommendation: rec,
      mandatory: sum.mandatory,
      penalty_per_lap_s: +(penalty_s || 0).toFixed(2),
      stay_out_cost_s: +stayOutCost.toFixed(1),
      repair_time_s: repairT,
      repair_cost_s: +repairCost.toFixed(1),
      saves_s: +(stayOutCost - repairCost).toFixed(1)
    };
  }

  return { generatePlan, liveMetrics, regenerate, whatIf, conditionAt, lapsPerTank,
           estTotalLaps, damageSummary, repairDecision };
})();

if (typeof module !== "undefined") module.exports = Engine;
if (typeof window !== "undefined") window.Engine = Engine;
