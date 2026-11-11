# Telemetry Bridge (Le Mans Ultimate / rF2)

Reads the game's shared memory and feeds the pit wall. The reader is written
(`pitwall_bridge.py`); the **field mapping still needs validating against the running
game** — that's what `--print` is for.

## Plan

LMU + rF2 share the same engine. Telemetry comes from the **rF2 Shared Memory Map
Plugin** (DLL dropped in the game's `Plugins/` folder, enabled in config). A Python
reader (`pyRfactor2SharedMemory`) reads shared memory and pushes to Supabase.

## Run

```bash
pip install -r requirements.txt           # pyRfactor2SharedMemory (Windows + game)

# 1. VALIDATE FIRST — drive the car and watch the fields update (no account needed):
python3 pitwall_bridge.py --print

# 2. Test the whole chain without the game (synthetic race):
python3 pitwall_bridge.py --demo --print

# 3. Push live telemetry to the dashboard via Supabase:
set SUPA_URL=https://xxxx.supabase.co     # (export on Linux/mac)
set SUPA_ANON=eyJ...anon-public-key...
set SUPA_PASSCODE=your-shared-word         # must match race_secret.passcode
python3 pitwall_bridge.py --supabase       # add --print to watch what's sent
```

### Windows launchers (double-click)

- **`validate-bridge.bat`** — runs `--print` only. No account, no secrets. Use first:
  drive the car, confirm fields update, paste the output back to tune the mapping.
- **`start-bridge.bat`** — feeds the live pit wall via Supabase. Holds the write
  passcode, so it's **git-ignored** (not in the repo). Copy the filled one to the game
  PC, or make it from `start-bridge.example.bat` and fill in your values.

`--print` is the field-validation step: run it while driving and confirm `fuel_now`,
`laps_done`, `last_lap_s`, `current_driver`, wheels, etc. actually populate. Anything
that stays `null` isn't exposed by the game → enter it manually in the dashboard /
sim feeder. Report back what `--print` shows and the mapping gets tuned to match.

## Field map — validate FIRST (confirm each updates while driving)

| Dashboard field | Shared-memory source (rF2/LMU) | Status |
|---|---|---|
| Fuel (liters)        | `mFuel`                                   | critical — confirm |
| Last lap / best lap  | `mLastLapTime` / `mBestLapTime`           | should exist |
| Laps done            | `mTotalLaps`                              | should exist |
| Driver + swap        | `mDriverName` / `mControl`                | should exist |
| Pit detection        | `mInPits` / `mPitState`                   | should exist |
| Position             | `mPlace` (overall + in-class)             | should exist |
| Gap ahead / behind   | `mTimeBehindNext` / leader deltas         | confirm |
| Damage (Aero/Body/Susp/Tyres %) | LMU engineer categories        | confirm — LMU reports these 4 % |
| Repair time (s)      | LMU estimated repair time                 | confirm — game shows it directly |
| Penalties            | `mNumPenalties`                           | confirm |
| Tire wear / brake / temp / press | `mWear` / `mBrakeTemp` / `mTemperature` / `mPressure` per tire | confirm |
| Weather now          | rain / track wetness fields               | confirm |
| Weather forecast     | timeline / forecast                       | UNCONFIRMED in LMU |
| Virtual Energy (VE)  | `mVirtualEnergy` (Hypercar only)          | confirm — CrewChief reads it, so likely present |

GT3 (our race) uses fuel liters, not VE. Any missing field → manual entry in the
dashboard / sim feeder.

## App-derived (no telemetry needed)
Last pit lap, stint time, laps on current tire set, driver totals, fuel/lap rolling,
delta-to-plan — all computed by the dashboard from the stream above.

## Driver-swap continuity

Shared car swaps between PCs. Full fuel telemetry exists only on the PC that currently
controls the car. Fix: run the bridge on **every driver's PC**; each publishes only when
it holds control (`mControl` = local player). Supabase keeps the last active writer →
continuous data across swaps. Lap times / flags come from scoring on any PC.
