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
  js/config.js  default race config (+ access passcode)
  js/gate.js    soft shared-passcode lock
  js/supabase.js PitDB — live sync (localStorage now, Supabase when configured)
  supabase.local.example.js  template for your Supabase keys (copy → supabase.local.js)
db/schema.sql   Supabase tables + gated write RPC
bridge/         LMU telemetry bridge (Python, added later — see bridge/README.md)
docs/PLAN.md    full plan + strategy math
```

## Features

- **Strategy engine** — fuel + tyre limited stint fill, driver rotation, weather overlay,
  tyre rationing, target-driven (fewest stops / fastest / safest).
- **Live tracker** — fuel-laps-left, pit-in-N, make-finish, swap alarm (BOX banner + horn).
- **Event engine** — Rain / Forced Pit / Pace Change lock past stints, regenerate the rest.
- **What-if sandbox** + **Fuel save** calculators.
- **Damage panel** — LMU Aero/Body/Susp/Tyres % + repair estimate, auto repair-or-stay call.
- **Lap log** — one row per lap, fastest highlighted, **CSV export** for post-race review.
- **Sim feeder** — manual inject + **Auto-play** (rehearse 6h in minutes) + scenarios.
- **Live-link status chip** — live / stale / backend at a glance.

## Run (dev)

Static — serve `web/` with any static server, open two tabs:

```bash
cd web && python3 -m http.server 8080
# dashboard:  http://localhost:8080/index.html
# sim feeder: http://localhost:8080/sim.html
```

The sim feeder drives the dashboard live (same browser, via localStorage). Hit
**Auto ▶** on the feeder to rehearse a whole race; watch the pit wall adapt.

## Cross-device sync (optional — Supabase)

For the real race across different PCs/phones:

1. Create a Supabase project. Run [`db/schema.sql`](db/schema.sql) in its SQL editor.
2. Set your write passcode: `update race_secret set passcode = 'word' where id = 1;`
3. `cp web/supabase.local.example.js web/supabase.local.js` and fill in url / anonKey / passcode.

That file is gitignored — keys never get committed. Without it the app uses localStorage.

## Access lock (optional)

Set `access_passcode` in `js/config.js` to require a shared word on load. It's a
convenience lock (the value is in client JS) — for real access control put the site
behind host auth (Netlify password / Cloudflare Access) once you pick hosting.

## Status

Phases 1–5 (engine, dashboard, sim feeder, events, what-if, sync, lap log) run **with no
game**. Telemetry bridge (phase 6+) comes after validating the LMU shared-memory fields.
Config values (`avg_lap_s`, `fuel_per_lap`, `tank_cap`, `pit_loss_s`, tyre life) are
placeholders — set them from practice data.
