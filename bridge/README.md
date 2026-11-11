# Telemetry Bridge (Le Mans Ultimate / rF2) — later phase

**Not built yet.** Deferred until we validate the game exposes the fields we need.

## Plan

LMU + rF2 share the same engine. Telemetry comes from the **rF2 Shared Memory Map
Plugin** (DLL dropped in the game's `Plugins/` folder, enabled in config). A Python
reader (`pyRfactor2SharedMemory`) reads shared memory and pushes to Supabase.

## Validate FIRST (before trusting it)

Run a reader locally and confirm you can SEE these fields update while driving:

- `mFuel` — current fuel (liters)         ← critical
- `mLastLapTime`, `mTotalLaps`            ← lap pace + count
- `mDriverName`, `mControl`               ← driver + swap detection
- `mInPits`, `mPitState`                  ← pit detection
- rain / track wetness fields             ← weather now
- weather forecast / timeline             ← UNCONFIRMED LMU exposes this

If a field is missing, it falls back to manual entry in the dashboard / sim panel.

## Driver-swap continuity

Shared car swaps between PCs. Full fuel telemetry exists only on the PC that currently
controls the car. Fix: run the bridge on **every driver's PC**; each publishes only when
it holds control (`mControl` = local player). Supabase keeps the last active writer →
continuous data across swaps. Lap times / flags come from scoring on any PC.
