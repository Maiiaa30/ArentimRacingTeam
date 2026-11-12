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
    // before it — avoids a degenerate extra "stint"/stop at the flag. But never
    // merge past the VE window: a 23+5 merge = 28 laps = 100s stop-go penalty.
    // If the merge would bust the cap, keep the short tail stint (a cheap splash).
    const TAIL_MIN = 6;
    if (stints.length > 1) {
      const last = stints[stints.length - 1];
      const prev = stints[stints.length - 2];
      const cap = cfg.max_stint_laps || Infinity;
      if (last.target_laps < TAIL_MIN && prev.target_laps + last.target_laps <= cap) {
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

    // VE governance (LMGT3 / Hypercar): these cars run to a Virtual Energy
    // allowance, not the tank. When the game feeds live VE% the stint ends at
    // VE=0 (~24 laps at Monza), long before the 120 L tank is dry — so the pit
    // window is the MORE RESTRICTIVE of fuel and VE. Without live VE we fall back
    // to fuel only (or the plan's max_stint_laps cap, applied below).
    // prefer the live measured VE drain (state.ve_per_lap_live, %/lap) over the
    // static config estimate — the pit window then tracks the real car on the day.
    let energyLapsLeft = null;
    const vePerLap = (state.ve_per_lap_live && state.ve_per_lap_live > 0) ? state.ve_per_lap_live : cfg.ve_per_lap;
    if (cfg.energy_mode === "ve" && state.virtual_energy != null && vePerLap > 0) {
      energyLapsLeft = (state.virtual_energy * 100) / vePerLap;  // fraction -> %
    }
    // if no live VE but the plan caps the stint (VE window), respect that cap too
    let capLapsLeft = null;
    if (energyLapsLeft == null && cfg.max_stint_laps && state.laps_on_tires != null) {
      capLapsLeft = cfg.max_stint_laps - state.laps_on_tires;
    }
    const bindingLapsLeft = Math.min(
      fuelLapsLeft,
      energyLapsLeft != null ? energyLapsLeft : Infinity,
      capLapsLeft != null ? capLapsLeft : Infinity
    );
    const pitInLaps = Math.max(0, Math.floor(bindingLapsLeft - cfg.fuel_margin_laps));
    const veLimited = energyLapsLeft != null && energyLapsLeft < fuelLapsLeft;

    // pit WINDOW (not a single lap): the ideal stop plus a band either side, so
    // the operator can flex around traffic/safety. early = pit sooner (waste a
    // little energy), late = stretch toward the limit (eats the safety margin).
    const early = cfg.pit_window_early != null ? cfg.pit_window_early : 2;
    const late  = cfg.pit_window_late  != null ? cfg.pit_window_late  : 2;
    const idealPitLap = (state.laps_done || 0) + pitInLaps;
    const pitWindow = {
      ideal: idealPitLap,
      early: Math.max((state.laps_done || 0), idealPitLap - early),
      late:  idealPitLap + late,
      early_in: Math.max(0, pitInLaps - early),   // countdown form
      late_in:  pitInLaps + late
    };

    const lapsLeft = plan.total_laps - state.laps_done;
    const remStops = state.remaining_stops != null ? state.remaining_stops : Math.max(0, plan.stops);
    const fuelNeeded = lapsLeft * fpl;
    const fuelAvail = state.fuel_now + remStops * cfg.tank_cap;
    return {
      fuel_laps_left: +fuelLapsLeft.toFixed(1),
      energy_laps_left: energyLapsLeft != null ? +energyLapsLeft.toFixed(1) : null,
      pit_in_laps: pitInLaps,
      pit_window: pitWindow,            // {ideal,early,late} absolute laps + *_in countdown
      ve_limited: veLimited,            // true = VE forces the stop before fuel does
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

  // ---- Strategy Brain: offline optimizer ----
  // From the CURRENT live state, build several rest-of-race plans, score each on
  // real goals, and return them ranked best-first with a plain-language reason.
  // No external model: deterministic, instant, works with no internet.
  //
  //   feasibility gate (hard): makes the finish on fuel, tyres within budget, no
  //     stint past the VE window (max_stint_laps) -> else 100s stop-go risk.
  //   objective: MOST laps in the race (fewer stops = more racing), then fewest
  //     tyre sets used, then lowest risk.
  function optimize(cfg, weather, currentState, lockedStints, liveState) {
    liveState = liveState || {};
    const veCap = cfg.max_stint_laps || 0;
    const budgetSets = Math.floor((cfg.tire_budget || 0) / tiresPerChange(cfg));

    // candidate rest-of-race plans. Only levers with a REAL effect in this
    // VE-capped model: tyre rationing (reserve sets) and pit timing (stint cap).
    // Compound/fuel carry no pace delta here, so a "push/soft" line would only
    // burn more tyres for nothing — deliberately left out.
    const reserve = cfg.tire_reserve_sets || 0;
    const shortCap = veCap ? Math.max(10, veCap - 4) : 0;   // noticeably earlier stops
    const cands = [
      { key: "hold",      label: "Hold the plan",       verb: "Keep current plan",          ov: {} },
      { key: "savetyre",  label: "Save a tyre set",     verb: "Double-stint — ration tyres", ov: { tire_reserve_sets: reserve + 1 } },
      { key: "minstops",  label: "Minimum stops",       verb: "Stretch tyres, fewest stops", ov: { tire_reserve_sets: Math.max(0, reserve - 1) } },
      { key: "vesafe",    label: "Pit 1 lap earlier",   verb: "Pit early — VE safety margin", ov: veCap ? { max_stint_laps: veCap - 1 } : {} },
      { key: "freshtyres",label: "Fresher tyres",       verb: "Shorter stints, always-fresh rubber", ov: shortCap ? { max_stint_laps: shortCap } : {} },
    ];

    const scored = [];
    const seen = {};
    const atLap = currentState.laps_done || 0;
    for (const c of cands) {
      const c2 = Object.assign({}, cfg, c.ov);
      const plan = regenerate(c2, weather, currentState, lockedStints);
      // signature to drop duplicate plans (same stop laps + tyre actions)
      const sig = plan.stints.map(s => s.in_lap + s.tire_action[0]).join(",");
      if (seen[sig]) continue; seen[sig] = 1;

      const future = plan.stints.filter(s => s.in_lap >= atLap);
      const stopsLeft = plan.stints.filter(s => s.in_lap > atLap).length; // pit stops still to come
      const worstStint = future.reduce((m, s) => Math.max(m, s.target_laps), 0);
      const veOver = veCap ? worstStint > veCap : false;
      const overBudget = plan.tires_used > (cfg.tire_budget || Infinity);

      // fuel make-finish (tank-limited safety net; VE is the real cap above)
      let makeFinish = true;
      if (liveState.fuel_now != null) {
        const m = liveMetrics(cfg,
          { fuel_now: liveState.fuel_now, laps_done: atLap,
            elapsed_s: currentState.elapsed_s || 0, remaining_stops: plan.stops },
          plan, weather);
        makeFinish = m.make_finish;
      }
      const feasible = makeFinish && !overBudget && !veOver;
      scored.push({
        key: c.key, label: c.label, verb: c.verb, plan, ov: c.ov,
        laps: plan.total_laps, stops: stopsLeft,
        tires_used: plan.tires_used, sets_used: Math.ceil(plan.tires_used / tiresPerChange(cfg)),
        feasible, veOver, overBudget, makeFinish,
        finish_s: plan.finish_time_s,
      });
    }

    // rank: feasible first, then most laps, then fewest sets, then earlier finish
    scored.sort((a, b) =>
      (b.feasible - a.feasible) ||
      (b.laps - a.laps) ||
      (a.sets_used - b.sets_used) ||
      (a.finish_s - b.finish_s));

    const best = scored[0];
    const hold = scored.find(s => s.key === "hold") || best;
    scored.forEach(s => { s.reason = _optimReason(s, hold); });
    // runner-ups: feasible, meaningfully different from best, up to 2
    const alternatives = scored.filter(s =>
      s.key !== best.key && s.feasible &&
      (s.stops !== best.stops || s.sets_used !== best.sets_used || s.laps !== best.laps)
    ).slice(0, 2);
    return { best, alternatives, ranked: scored, hold };
  }

  // one tight line: what it does + how it differs from holding + the hard facts.
  function _optimReason(cand, hold) {
    if (!cand) return "";
    if (!cand.feasible) {
      const why = cand.overBudget ? "over tyre budget"
        : cand.veOver ? "over the energy window"
        : "fuel short of the flag";
      return "No clean line — closest shown (" + why + ")";
    }
    const parts = [cand.key === "hold" ? "Already optimal" : cand.verb];
    if (cand.key !== "hold") {
      const dl = cand.laps - hold.laps, ds = cand.sets_used - hold.sets_used;
      if (dl > 0) parts.push("+" + dl + "L");
      else if (dl < 0) parts.push(dl + "L");
      if (ds < 0) parts.push(Math.abs(ds) + " fewer set" + (ds === -1 ? "" : "s"));
      else if (ds > 0) parts.push("+" + ds + " set" + (ds === 1 ? "" : "s"));
    }
    parts.push(cand.stops + " stop" + (cand.stops === 1 ? "" : "s"));
    parts.push(cand.sets_used + " sets ✓");
    return parts.join(" · ");
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

  return { generatePlan, liveMetrics, regenerate, whatIf, optimize, conditionAt, lapsPerTank,
           estTotalLaps, damageSummary, repairDecision };
})();

if (typeof module !== "undefined") module.exports = Engine;
if (typeof window !== "undefined") window.Engine = Engine;
