# Pit Wall — Full Plan

## Locked facts
- Sim: **Le Mans Ultimate** (rF2 engine).
- Race: **6 hours**, one shared car, **4 drivers**, free swaps (no drive-time rules).
- Tires: **20-tire budget**, wets come out of the same 20. Counting mode (set vs individual)
  TBD — configurable (`tire_count_mode`), confirm in-game.
- Weather: **pulled from game timeline** + live wetness; manual fallback. We do NOT predict.
- Data in: **auto from telemetry** (fuel, lap, driver, pits, weather) — validate fields first.
- SC/FCY: not in game → **dropped**. One manual "Caution/Incident" instead.
- Optimize target: **operator picks** per race — fewest_stops / fastest / safest.

## Concept — 3 layers + sandbox
1. **Planner** — generate full stint/pit/tire/driver plan from inputs.
2. **Live tracker** — real data vs plan: pit-in-N, fuel delta, make-finish, swap countdown.
3. **Event engine** — Rain / Forced Pit / Pace Change → lock past, regenerate remainder.
4. **What-if** — non-destructive scenario test alongside live plan.

## Architecture
```
REAL (later):  LMU PC → rF2 shared-mem plugin → Python bridge → Supabase
DEV (now):     sim.html feeder → (Supabase) → dashboard
BOTH:          Supabase (Postgres + realtime) → dashboard (static SPA, your domain)
                                             ← operator events write back
```
- Frontend: static SPA, your domain. Realtime via Supabase JS.
- Backend: Supabase (free tier), no server to run.
- Bridge: Python (pyRfactor2SharedMemory + supabase-py), later phase.

## Data model (Supabase)
- `race_config` — duration, pace, fuel, tank, drivers, tire_budget, tire_count_mode,
  tire_life, pit_loss, wet factors, optimize_target.
- `race_state` — elapsed, laps_done, fuel_now, last/avg/best lap, current_driver, stint_lap,
  stint_time_s, tires_used, tire_wear_pct, laps_on_tires, last_pit_lap, position,
  gap_ahead_s, gap_behind_s, damage_pct, penalties, weather_now, flag, active_pc, updated_at.
- Car class: GT3 (fuel liters). Hypercar support kept via `energy_mode:"ve"` + `ve_*` config.
  See `bridge/README.md` for the telemetry→field map and what needs validation.
- `weather_timeline` — [{start_s, condition, wetness}].
- `plan_stints` — idx, status, driver, in_lap, in_time, compound, action(new|stay), fuel, laps.
- `lap_log` — lap_no, lap_s, fuel_at_lap, driver, weather, ts.
- `events` — type, ts, payload, note.

## Strategy math — see `web/js/engine.js` (working implementation)
- `generatePlan` — fuel-limited + tire-limited stint fill, driver round-robin, weather overlay,
  tire rationing (double-stint when budget < stints needed), target-driven compound choice.
- `liveMetrics` — fuel_laps_left, pit_in_laps, make_finish, fuel_deficit.
- `regenerate` — lock done stints, rebuild remainder from current real state.
- `whatIf` — clone + hypothetical, run regenerate, no commit.

## Damage model (deep)
UI: top-view car, 8 body zones colored from `mDentSeverity` (0/1/2 → green/amber/red),
4 wheels at corners (wear %, flat/detached, brake-temp tint); details below.

- **Zone map:** `mDentSeverity[8]` indices → body location is NOT in the header. Convention
  in `config.damage.zone_labels` (front, f-right, right, r-right, rear, r-left, left, f-left).
  VALIDATE by hitting known corners; cross-check with `mLastImpactPos`.
- **Body % (derived):** `sum(dent)/16 × 100`. No raw aero %.
- **Lap penalty = MEASURED, not guessed:** `Δt = avg_lap_after_incident − baseline_avg`.
- **Repair times:** from LMU engineer menu if shared memory exposes them; else
  `config.damage.repair_body_s / repair_all_s` (validate). HUD "red damage" = mandatory flag.
- **Auto-recommend** (engine `repairDecision`):
  - mandatory REPAIR_NOW if flat / detached wheel
  - severe → REPAIR (escalation/DNF risk)
  - else REPAIR if `repair_cost < Δt × laps_remaining`
  - `repair_cost` = repair_time if pitting anyway, else `pit_loss + repair_time`
- **Feeds:** Forced Pit event carries repair_time → race regenerates; Δt → make-finish recompute.
- Engine: `damageSummary()` + `repairDecision()` (pure, tested with fake data).

## Build phases
1. Schema + dashboard shell ✅ (scaffold)
2. Strategy engine ✅ (pure JS)  ← refine math vs real practice data
3. Dashboard ↔ realtime (Supabase) + sim feeder writes live
4. Sim feeder polish — rehearse full race
5. Event engine + what-if sandbox (wire buttons)
6. Real LMU Python bridge + **validate fields**
7. Multi-PC driver-swap continuity
8. Polish — alarms (box/swap horn), weather strip, export

Phases 1–5 need no game.

## Risks to validate
- **LMU shared memory fields** — fuel + wetness + forecast exposed? (biggest unknown)
- **Tire counting mode** in LMU (set vs per-tire).
- **Driver-swap telemetry continuity** across PCs.
- **Dry↔wet crossover lap** timing — model simply first.

## Open / TODO
- Real values: avg_lap_s, fuel_per_lap, tank_cap, pit_loss_s, wet_lap_factor, tire_life — from practice.
- Hosting target for the domain (Netlify / Vercel / Cloudflare / own box).
- Supabase project + keys (kept in gitignored `web/supabase.local.js`).
