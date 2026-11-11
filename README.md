# Arentim Racing Team — Pit Wall

Endurance sim-racing strategy dashboard. Built for a **6-hour Le Mans Ultimate** race,
one shared car, 4 drivers, 20-tire budget.

Not a telemetry viewer — a **strategy brain**. Generates a full race plan, tracks real
game data live, and re-adapts the remaining race when rain hits, a pit is forced, or pace
changes.

## Layers

1. **Planner** — generate full stint/pit/tire/driver plan from race inputs.
2. **Live tracker** — real fuel/lap/driver vs plan → pit-in-N, fuel delta, make-finish.
3. **Event engine** — Rain / Forced Pit / Pace Change → lock past, regenerate remainder.
4. **What-if sandbox** — test a scenario without committing.

See [`docs/PLAN.md`](docs/PLAN.md) for the full design.

## Structure

```
web/            static dashboard (your domain)
  index.html    pit-wall dashboard
  sim.html      dev feeder — inject fake data, rehearse the race (no game needed)
  js/engine.js  strategy engine (pure JS, no deps)
  js/config.js  default race config
  js/supabase.js realtime client (wired later)
bridge/         LMU telemetry bridge (Python, added later — see bridge/README.md)
docs/PLAN.md    full plan + strategy math
```

## Status

Scaffold. Phases 1–5 (engine, dashboard, sim panel, events, what-if) need **no game**.
Telemetry bridge (phase 6+) comes after the game-field validation.

## Run (dev)

Static — serve `web/` with any static server:

```bash
cd web && python3 -m http.server 8080
# dashboard: http://localhost:8080/index.html
# sim feeder: http://localhost:8080/sim.html
```
