#!/usr/bin/env bash
# TEMPLATE - copy to start-bridge.sh and fill in (that copy is gitignored).
cd "$(dirname "$0")"
export SUPA_URL=https://YOUR-PROJECT.supabase.co
export SUPA_ANON=YOUR-ANON-PUBLIC-KEY
export SUPA_PASSCODE=your-shared-word
MODE="--supabase --print"
[ "$1" = "demo" ] && MODE="--demo --supabase --print"
python3 pitwall_bridge.py $MODE
