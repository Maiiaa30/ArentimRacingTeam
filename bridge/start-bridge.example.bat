@echo off
REM Arentim Racing Team - Pit Wall bridge launcher (TEMPLATE)
REM Copy to start-bridge.bat and fill in your values (that copy is gitignored).
cd /d "%~dp0"
set SUPA_URL=https://YOUR-PROJECT.supabase.co
set SUPA_ANON=YOUR-ANON-PUBLIC-KEY
set SUPA_PASSCODE=your-shared-word
python pitwall_bridge.py --supabase --print
pause
