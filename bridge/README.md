# Telemetry Bridge (Le Mans Ultimate / rF2) — later phase

**Not built yet.** Deferred until we validate the game exposes the fields we need.

## Plan

LMU + rF2 share the same engine. Telemetry comes from the **rF2 Shared Memory Map
Plugin** (DLL dropped in the game's `Plugins/` folder, enabled in config). A Python
reader (`pyRfactor2SharedMemory`) reads shared memory and pushes to Supabase.

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
| Damage               | `mDentSeverity[8]` / `mDetached` / aero   | partial — confirm |
| Penalties            | `mNumPenalties`                           | confirm |
| Tire wear            | `mWear` per tire                          | confirm |
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
