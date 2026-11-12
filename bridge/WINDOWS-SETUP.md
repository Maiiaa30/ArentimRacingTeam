# Bridge setup on a Windows game PC (≈5 min)

The telemetry bridge runs on each driver's **Windows** PC (where Le Mans Ultimate
runs). WSL/Linux can't read the game's shared memory — this is the Windows side.
Do this once per PC.

## 1. Prerequisites

- **Le Mans Ultimate** installed.
- **LMU shared memory enabled.** LMU ships its own shared-memory interface (no
  external DLL). If `--print` reads all-null/errors, enable it: edit
  `Le Mans Ultimate\UserData\player\CustomPluginVariables.JSON`, set the shared
  memory entry `"Enabled": 1`, then restart the game.
- **Python 3** for Windows — https://python.org (tick "Add Python to PATH" in the installer).

Check Python in a Command Prompt / PowerShell:
```
python --version
```

## 2. Get the code

```
git clone https://github.com/Maiiaa30/ArentimRacingTeam.git
cd ArentimRacingTeam\bridge
```

> That's it — nothing to pip install. The telemetry reader
> (`pyLMUSharedMemory`) is **vendored into the repo** (the `bridge\pyLMUSharedMemory\`
> folder), so one clone has everything. LMU uses its *own* built-in shared
> memory, not the old rF2 plugin. `--demo` / `--print` need no extra setup.

## 3. Validate FIRST (no account needed)

Start a practice session, get in the car, then:
```
python pitwall_bridge.py --print
```
Drive a lap. The window prints the telemetry it reads (fuel, laps, driver, …).
**Send that output back** so the field mapping gets confirmed against LMU. Anything
that stays `null` isn't exposed by the game and is entered manually in the dashboard.

## 4. Feed the live pit wall

Make a `.env` from the template (keeps the passcode out of git — `.env` is gitignored):
```
copy .env.example .env
notepad .env
```
Fill the two blanks (ask the team owner — URL is already filled in):
```
SUPA_URL=https://cuinegzqahegrxaodosa.supabase.co
SUPA_ANON=<anon public key>
SUPA_PASSCODE=<shared write passcode>
```
Save. The bridge loads `.env` automatically. Test the pipe once **without the
game** first — this proves your keys + network before race day:
```
python pitwall_bridge.py --demo --supabase
```
Open the pit wall on another device; it should show a synthetic race (our #38
BMW M4 LMGT3). If it moves, the Supabase side is good. Then for the real run:
```
python pitwall_bridge.py --print --supabase
```
(`--print` lets you watch the data; or double-click `start-bridge.bat`).
Telemetry flows game → Supabase → the pit wall on every device. If pushes fail
the window prints `supabase push FAILING — board is NOT updating`. Close to stop.

## Driver-swap note

In a shared-car race, run the bridge on **every driver's PC**. Each one only sends
while it controls the car, so data stays continuous across swaps. Same `start-bridge.bat`
on each PC.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `python` not found | Reinstall Python with "Add to PATH", reopen the terminal |
| `--print` shows all `null` / errors on shared memory | Plugin not enabled, or game not in a session |
| `supabase push FAILING` | Check the 3 values in `.env`/the .bat; confirm internet |
| `bad passcode` | `SUPA_PASSCODE` must match the team's write passcode exactly |
| Pit wall not moving | Open its URL fresh; check the status chip says `live · cloud` |
