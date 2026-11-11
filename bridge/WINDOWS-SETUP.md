# Bridge setup on a Windows game PC (≈5 min)

The telemetry bridge runs on each driver's **Windows** PC (where Le Mans Ultimate
runs). WSL/Linux can't read the game's shared memory — this is the Windows side.
Do this once per PC.

## 1. Prerequisites

- **Le Mans Ultimate** installed.
- **rF2 Shared Memory Map Plugin** enabled (the DLL in the game's `Plugins\` folder,
  turned on in the game's plugin config). Without it there's no telemetry to read.
- **Python 3** for Windows — https://python.org (tick "Add Python to PATH" in the installer).

Check Python in a Command Prompt / PowerShell:
```
python --version
```

## 2. Get the code

```
git clone https://github.com/Maiiaa30/ArentimRacingTeam.git
cd ArentimRacingTeam\bridge
pip install -r requirements.txt
```

## 3. Validate FIRST (no account needed)

Start a practice session, get in the car, then:
```
python pitwall_bridge.py --print
```
Drive a lap. The window prints the telemetry it reads (fuel, laps, driver, …).
**Send that output back** so the field mapping gets confirmed against LMU. Anything
that stays `null` isn't exposed by the game and is entered manually in the dashboard.

## 4. Feed the live pit wall

Make the launcher from the template (keeps the passcode out of git):
```
copy start-bridge.example.bat start-bridge.bat
notepad start-bridge.bat
```
Fill in the three values (ask the team owner for them):
```
set SUPA_URL=https://cuinegzqahegrxaodosa.supabase.co
set SUPA_ANON=<anon public key>
set SUPA_PASSCODE=<shared write passcode>
```
Save. Then just **double-click `start-bridge.bat`** (or run it) whenever you drive.
Telemetry flows game → Supabase → the pit wall on every device. Close the window to stop.

## Driver-swap note

In a shared-car race, run the bridge on **every driver's PC**. Each one only sends
while it controls the car, so data stays continuous across swaps. Same `start-bridge.bat`
on each PC.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `python` not found | Reinstall Python with "Add to PATH", reopen the terminal |
| `--print` shows all `null` / errors on shared memory | Plugin not enabled, or game not in a session |
| `supabase push: FAILED` | Check the 3 values in the .bat; confirm internet |
| `bad passcode` | `SUPA_PASSCODE` must match the team's write passcode exactly |
| Pit wall not moving | Open its URL fresh; check the status chip says `live · cloud` |
