# Telemetry Bridge (Le Mans Ultimate)

Reads Le Mans Ultimate's shared memory and feeds the pit wall. The reader is
written and its field **names are validated against the shared-memory struct**
(see below); the **values** still want a quick eyeball against the running game —
that's what `--print` is for.

## How it actually works

Le Mans Ultimate exposes its **own built-in shared memory** (mapped file
`LMU_Data`) — *not* the classic rF2 "Iron Wolf" Shared Memory Map Plugin, and we
do **not** drop a DLL in `Plugins/`. We read it with **TinyPedal's
`pyLMUSharedMemory`**, which is vendored in this folder (`pyLMUSharedMemory/`).

> Older notes (and HANDOFF.md) mention `pyRfactor2SharedMemory` + an rF2 DLL
> plugin. That is **stale** — ignore it. The code imports `pyLMUSharedMemory`.

Requirements: Windows game PC, LMU running, and the game's shared-memory output
enabled. No Python package install needed for the reader itself (pure ctypes +
mmap); `requirements.txt` is only for optional extras.

## Run

```bash
# 1. VALIDATE FIRST — drive the car and watch the fields update (no account needed):
python3 pitwall_bridge.py --print

# 2. Test the whole chain WITHOUT the game (synthetic race -> Supabase -> board):
python3 pitwall_bridge.py --demo --supabase
#    Open the board on another device; it should show our #38 BMW M4 LMGT3,
#    Francisco driving, rivals moving. Proves Supabase URL/key/passcode + network.

# 3. Push LIVE telemetry on race day:
set SUPA_URL=https://xxxx.supabase.co     # (export on Linux/mac)
set SUPA_ANON=eyJ...anon-public-key...
set SUPA_PASSCODE=your-shared-word         # must match race_secret.passcode
python3 pitwall_bridge.py --print --supabase   # --print lets you watch what's sent
```

The bridge is built to survive a 6-hour run: one bad frame (pause, menu, glitch)
is caught and skipped, not fatal. If Supabase pushes start failing the console
shouts `supabase push FAILING — board is NOT updating`; when they recover it
prints `push recovered`. A healthy run is quiet apart from a ~30s heartbeat.

### Windows launchers (double-click)

- **`validate-bridge.bat`** — runs `--print` only. No account, no secrets. Use
  first: drive the car, confirm fields update.
- **`start-bridge.bat`** — feeds the live pit wall via Supabase. Holds the write
  passcode, so it's **git-ignored**. Copy the filled one to the game PC, or make
  it from `start-bridge.example.bat`.

See **WINDOWS-SETUP.md** for the full game-PC setup.

## Field validation status

**Struct names + access paths: VALIDATED** (2026-11-12) against the vendored
`pyLMUSharedMemory/lmu_data.py`. Every field `read_state()` reads exists on the
right struct (`LMUVehicleTelemetry`, `LMUVehicleScoring`, `LMUScoringInfo`,
`LMUWheel`), so the read will not crash on a missing attribute. What `--print`
still confirms is that the game *populates* them and the **values/units** are
right. Two to watch specifically:

| Field | What to check on `--print` | Note |
|---|---|---|
| `mWear` (tyre) | worn% should **rise** from ~0 as tyres age | struct = "fraction of maximum" (1.0 = fresh); bridge inverts to worn fraction |
| `mBrakeTemp` | sane brake temps | struct doc says Celsius; bridge assumes Kelvin (−273.15) per observed data. Low impact — not used in strategy |

## Field map (dashboard field → shared-memory source)

| Dashboard field | Source | Struct |
|---|---|---|
| Fuel (liters)        | `mFuel`                                   | telemetry |
| Fuel capacity        | `mFuelCapacity`                           | telemetry |
| Virtual Energy       | `mVirtualEnergy`                          | telemetry |
| State of charge      | `mStateOfCharge`                          | telemetry |
| Last / best lap      | `mLastLapTime` / `mBestLapTime`           | scoring |
| Laps done            | `mTotalLaps` (fallback `mLapNumber`)      | scoring/telemetry |
| Driver               | `mDriverName`                             | scoring |
| Pit detection        | `mInPits`                                 | scoring |
| Position             | `mPlace`                                  | scoring |
| Gap ahead            | `mTimeBehindNext`                         | scoring |
| Gap behind           | derived from the car one place back       | — |
| Penalties            | `mNumPenalties`                           | scoring |
| Rival field          | iterate `vehScoringInfo` (name/class/gap/fuel%) | scoring |
| Tyre wear/temp/press | `mWear` / `mTemperature` / `mPressure` per wheel | wheel |
| Flat / detached      | `mFlat` / `mDetached` per wheel; `mDetached` (parts) | wheel/telemetry |
| Damage (body)        | `mDentSeverity` (8 locations, 0/1/2)      | telemetry |
| Last impact          | `mLastImpactMagnitude` / `mLastImpactET`  | telemetry |
| Flag                 | `mGamePhase` (6=FCY, 7=red, 8=checkered)  | scoring-info |
| Weather now          | `mRaining` / `mAvgPathWetness`            | scoring-info |
| Track / air temp     | `mTrackTemp` / `mAmbientTemp`             | scoring-info |
| Session remaining    | `mSessionTimeRemaining` (fallback end−cur ET) | scoring-info |

Anything the game leaves null is sent as `null` → the dashboard blanks it (never
faked) and the operator enters it manually if needed.

> **VE, not liters.** LMU LMGT3 (our class) is governed by **Virtual Energy**,
> not the fuel tank — the stint ends when VE hits 0% (~24 laps at Monza), long
> before the 120 L tank runs dry. Strategy plans on `max_stint_laps`; `mVirtualEnergy`
> shows the live %. (An earlier note claiming "GT3 uses liters not VE" was wrong.)

## App-derived (no telemetry needed)
Last pit lap, stint time, laps on current tyre set, driver totals, fuel/lap
rolling, delta-to-plan — all computed by the dashboard from the stream above.

## Driver-swap continuity

The car is shared between PCs. Full telemetry exists only on the PC that
currently controls the car. Fix: run the bridge on **every driver's PC**; each
publishes while it holds control. Supabase keeps the last active writer →
continuous data across swaps. Lap times / flags come from scoring on any PC.
