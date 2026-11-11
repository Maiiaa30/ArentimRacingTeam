# Race Strategy — Arentim Racing Team · 6h Monza · BMW M4 LMGT3

> Default plan for discussion. Not final — team to review and agree.
> Status: **DEFAULT (provisional)** as of 2026-11-11. Owner likes it; pending team sign-off.

## The car & race (facts we're planning around)
- **Car:** BMW M4 LMGT3 (#38), ~99% confirmed.
- **Track:** Monza. **Duration:** 6 hours. **Drivers:** 4.
- **Tyres:** 20 (= 5 sets of 4).
- **Driver rules:** Francisco Coelho **must start**. Rui Garcia & Helder Marques
  **cannot start**. Diogo Rodrigues free. All four treated equally (fun + first
  6h finish; position is secondary, nobody's seat time cut).
- **Weather:** TBD, forecast dry/cloudy, cool, no rain expected. Plan dry; wet
  plan held in reserve (2 tyre sets kept back... see below).

## The one fact that drives everything
**LMU LMGT3 is governed by Virtual Energy (VE), not the fuel tank.** The 120 L
class tank holds far more than one stint needs — you are forced to pit when VE
hits 0%, which at Monza is **~24 laps**. Going over 100% VE in a stint = **100s
stop-go penalty**. So ~7 refuel stops over 6h are unavoidable. This is physics,
not a strategy choice.

## DEFAULT PLAN — "Endurance / fewer-swaps"
Chosen because the owner wants long stints and few driver changes.

- **8 stints** (VE forces a fuel splash every ~24 laps)
- **7 pit stops** (every stint boundary — can't avoid, VE)
- **3 driver changes** (driver swaps only every *second* stop)
- **4 tyre sets used, 1 reserve** (tyres changed only on the 3 swaps + start)
- **~188 laps**, finish ~5:57

### Rotation (driver blocks)
Each driver runs a continuous **~90-min block = 2 fuel stints (~48 laps)**, just
splashing fuel in the middle without getting out.

| Block | Driver | Stints | Laps | Notes |
|-------|--------|--------|------|-------|
| 1 | **Francisco** | 1–2 | ~48 | STARTS (cold tyres, race-start chaos) |
| 2 | **Rui** | 3–4 | ~48 | calm middle |
| 3 | **Helder** | 5–6 | ~48 | calm middle |
| 4 | **Diogo** | 7–8 | ~44 | takes the FLAG (traffic finish) |

- Experienced drivers (Francisco, Diogo) bookend the two riskiest phases
  (start + finish); the newer pair get the calm middle.
- Seat time ≈ equal: Francisco 92m · Rui 92m · Helder 92m · Diogo 83m
  (Diogo's block is the short time-remainder).
- Tyres: MED throughout. Monza = low deg; BMW M4 wear "balanced/improved"
  (outer-rear worst). Each set double-stints 48 laps (< ~70 life) comfortably.

## Alternatives considered (for the team chat)

### A. Equal-swap ("classic")
Same 8 stints but swap driver **every** stop. Each driver 2 separate ~45-min
stints spread across the race. More wheel time variety, but **7 driver changes**
(more swap risk/time). Rejected in favour of fewer swaps — easy to switch back.

### B. Fewest-stops (lift & coast)
Aggressive VE-saving (lift-and-coast, fuel mix) can stretch a stint ~1 lap. Over
6h that saves maybe **1 stop**, but costs lap time every lap and adds driver
workload. Not worth it for a fun run. Available as a one-click variant if wanted.

### C. Fuel-max (ignore equal seat time)
6 long stints, uneven driver split (2/2/1/1). Fewest stops of the dry options,
but someone sits out — rejected (everyone wants to drive).

## To confirm on race day (turns assumptions into real numbers)
All current numbers are **baselines**; the live bridge reads real telemetry and
the plan self-corrects. Before the race, do one **10+ lap** practice run and read
off the in-game **MFD fuel page**:
1. **Fuel (L/lap)** and **VE (%/lap)** → sets true stint length (the ~24 anchor).
2. **Lap time** race pace (we assumed 1:52 / 112s).
3. **Pit loss** (pit-lane delta + full service) — we assumed 60s.
4. **Tyre drop-off** over a long run — watch outer-rear. If it falls off before
   ~48 laps, switch to single-stint tyres (needs more sets — we only have 5, so
   that means fewer stints or accepting the drop).
5. **Pit-stop rules** — any mandatory stops / min drive time per driver in the
   event rules? Not accounted for yet.

Set the real values in the dashboard **Setup** panel; the live plan updates. The
"Default strat" view stays fixed as the agreed baseline to compare against.

## How this maps to the config
`web/js/config.js`:
- `max_stint_laps: 24` — the VE pit window (the real stint limiter).
- `driver_sequence` — the block rotation above (each driver listed twice in a row).
- `avg_lap_s 112`, `fuel_per_lap 2.8`, `tank_cap 120`, `pit_loss_s 60` — Monza
  BMW M4 baselines.
- `tire_reserve_sets: 1` — hold 1 set back for wet/damage.
