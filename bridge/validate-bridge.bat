@echo off
REM Arentim Racing Team - VALIDATE telemetry (no account, no secrets).
REM Drive the car and check the printed fields update. Paste the output back.
cd /d "%~dp0"
python pitwall_bridge.py --print
pause
