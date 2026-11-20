# Race Strategy — Arentim Racing Team · 6h Monza · BMW M4 LMGT3

> Default plan for discussion. Not final — team to review and agree.
> Status: **DEFAULT (provisional)** — reworked 2026-11-20 to MAX-SWAP after a
> real race-conditions practice run. Owner wants more driver changes without
> losing pit time; pending team sign-off.

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
**LMU LMGT3 is governed by Virtual Energy (VE), not the fuel tank.** You are
forced to pit when VE hits 0%, which at Monza we **measured at ~25 laps** (VE
drain ~4.0 %/lap). Going over 100% VE in a stint = **100s stop-go penalty**. So
**7 refuel stops over 6h are unavoidable** — this is physics, not a strategy
choice. Fuel and VE now line up: the ~84 L we carry burns at **3.35 L/lap →
~25 laps**, the same window as VE, so neither one is the lone limiter.

## The insight behind this rework — swaps are FREE on a forced stop
The 7 VE stops happen whether we change driver or not; the car is already
stationary for the refuel. So we put a **driver swap on EVERY one of those forced
stops** — the swap runs concurrent with the refuel and costs **~0 extra
green-flag time**. We lose pit time only if we add an *extra* stop just to swap,
which we never do. Result: **same 7 stops as a fewer-swaps plan, but 7 swaps
instead of 3** — more wheel-time variety at no time cost.
(Caveat: confirm the LMU swap animation isn't longer than the refuel; if it is,
the overflow is the only cost — still tiny.)

## DEFAULT PLAN — "Max-swap / zero-extra-pit-time"
Chosen because the owner wants more driver changes without losing pit time.

- **8 stints** (VE forces a refuel every ~24 laps — cap held at 24, 1-lap margin)
- **7 pit stops** (every stint boundary — can't avoid, VE)
- **7 driver changes** (swap on *every* stop — free, see above)
- **4 tyre sets used, 1 reserve** (tyres only double-stinted — deg is tiny, see below)
- **~190 laps** (measured pace 111.6s), finish ~5:58

### Rotation (each driver TWO ~24-lap turns)
`Francisco · Rui · Diogo · Helder · Rui · Francisco · Helder · Diogo`

| Stint | Driver | Laps | Notes |
|-------|--------|------|-------|
| 1 | **Francisco** | ~24 | STARTS (cold tyres, race-start chaos) |
| 2 | **Rui** | ~24 | |
| 3 | **Diogo** | ~24 | |
| 4 | **Helder** | ~24 | |
| 5 | **Rui** | ~24 | |
| 6 | **Francisco** | ~24 | |
| 7 | **Helder** | ~24 | |
| 8 | **Diogo** | ~22 | takes the FLAG (traffic finish) |

- Experienced drivers (Francisco, Diogo) bookend start + finish; Rui/Helder
  never start and are spread through the calmer middle.
- **No back-to-back same driver** → a swap every stop.
- Seat time equal: each driver **two ~45-min turns ≈ ~90 min total**, every
  single turn ~45 min — well under the 80-min *consecutive* cap.
- Tyres: MED throughout. **Measured deg ~0.8 %/lap** (left/rear heaviest) — a set
  loses only ~38% over a double-stint (48 laps), so rubber is never the limiter.
  Change tyres every *second* stop (4 sets), not every stop — saves a little
  service time where the swap+refuel is the long pole.

## Alternatives considered (for the team chat)

### A. Endurance / fewer-swaps (the old default)
Same 8 stints, but swap driver only every *second* stop (**3 changes**). Each
driver runs a continuous ~90-min block (2 fuel stints ≈ 48 laps), splashing fuel
mid-block without getting out. Fewer swaps = marginally less swap risk, but the
pit-time saving is **~0** (the stops happen anyway) — so the only real difference
is less wheel-time variety. One-line revert: restore the paired `driver_sequence`.

### B. Fewest-stops (lift & coast)
Aggressive VE-saving (lift-and-coast, fuel mix) can stretch a stint ~1 lap. Over
6h that saves maybe **1 stop**, but costs lap time every lap and adds driver
workload. Not worth it for a fun run. Available as a one-click variant if wanted.

### C. Fuel-max (ignore equal seat time)
6 long stints, uneven driver split (2/2/1/1). Fewest stops of the dry options,
but someone sits out — rejected (everyone wants to drive).

## Measured vs still-to-confirm
A **race-conditions practice run (12 clean laps, 2026-11-20)** nailed down most
numbers. The live bridge keeps reading real telemetry and the plan self-corrects.
Status of each input:
1. ✅ **Fuel 3.35 L/lap** and **VE ~4.0 %/lap** (→ ~25-lap window, cap at 24).
   The board also measures both live and shows them in the fuel tile.
2. ✅ **Lap time ~111.6s** avg (best 1:50.5); held at 112 for traffic/mixed drivers.
3. ⚠️ **Pit loss — STILL UNMEASURED.** Both capture attempts failed (timing
   missed the pit entry; the one stop was a full-service stop, not a clean
   drive-through). Config holds the **60s estimate**. **MEASURE BEFORE THE RACE:**
   one out-lap + one flying lap + a clean **drive-through** (no service) — the
   green-lap vs pit-lap delta is the pit-lane loss.
4. ✅ **Tyre drop-off ~0.8 %/lap**, left/rear heaviest, no cliff over 12 laps —
   comfortably double-stints 48 laps. Watch it holds over a true long run.
5. **Pit-stop rules** — any mandatory stops / min or **max** drive time per
   driver in the event rules? The board now tracks continuous seat time per
   driver and warns at `driver_max_consecutive_min` (default 80m) — set it to the
   event's real limit, or `driver_max_total_min` if there's a total cap.

Set the real values in the dashboard **Setup** panel; the live plan updates. The
"Default strat" view stays fixed as the agreed baseline to compare against.

## How this maps to the config
`web/js/config.js`:
- `max_stint_laps: 24` — the VE pit window (the real stint limiter). The live
  "Pit in" count is the more-restrictive of fuel and VE, driven by the measured
  VE %/lap when the game feeds live VE — so it tracks the real car, not the tank.
- `ve_per_lap: 4.0` — MEASURED VE drain (%/lap); the board overrides it with the
  live rate once a couple of laps are logged.
- `driver_sequence` — the max-swap rotation above (no two adjacent the same = a
  swap every stop). To revert to fewer-swaps, pair each name (two in a row).
- `avg_lap_s 112`, `fuel_per_lap 3.35`, `tank_cap 84` — MEASURED. `pit_loss_s 60`
  — still an ESTIMATE (measure the drive-through before the race).
- `tire_reserve_sets: 1` — hold 1 set back for wet/damage.
- `pit_window_early/late: 2` — the ±laps band drawn around the ideal stop lap.
- `driver_max_consecutive_min: 80`, `driver_max_total_min: null` — seat-time reg
  the Status "Seat time" row + driver-modal table warn against.
- `incident_cost: {contact_s:4, offtrack_s:1}` — turns contact/off counts into the
  "time lost" seconds per driver.
- `ref_track_temp_c: 30`, `psi_per_degC: 0.1` — baseline the cold-pressure hint
  adjusts from as track temp drifts.
- `tyre_temp_window: {low:75, high:105}` — °C surface band the wheel-grid temp
  colours against (blue below / green in / red above).
- `tyre_pit_worn: 0.85` — worn fraction the dynamic "laps of life left" estimate
  projects the measured wear rate to (85% worn = box).

## Live engineer-call layer (reads only — no plan change)
On top of the plan, the board surfaces the calls a race engineer makes off the
data: **SAVE/PUSH/ON-TARGET** to the next stop, **undercut/overcut** on a stop-now,
**stint-pace deg**, **FCY/SC cheap-stop** prompt, **pace target** vs live average,
**to-flag** VE/fuel margin, **seat-time** regulation, **incident time-lost**, and a
**track-temp + cold-psi** hint. All are derived from live telemetry; none change the
plan — they tell the operator what to do with it. Full operator guide in
[RACE-DAY.md](RACE-DAY.md) → *Live engineer calls*.
