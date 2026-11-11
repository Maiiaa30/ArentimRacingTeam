#!/usr/bin/env python3
"""
Arentim Racing Team — Pit Wall telemetry bridge (Le Mans Ultimate / rF2).

Reads the rF2/LMU shared memory and feeds the pit-wall dashboard. Three modes:

  --print     Read shared memory and PRINT the mapped fields to the console.
              Use this FIRST to confirm the game exposes what we need (fuel,
              laps, driver, damage, weather) while you drive. No account needed.

  --demo      Generate a synthetic race (no game required) and push it. Use this
              to test the whole bridge -> Supabase -> dashboard chain before race day.

  --supabase  Push live state to Supabase (needs SUPA_URL / SUPA_ANON / SUPA_PASSCODE
              env vars, and db/schema.sql run once). Combine with --print to do both.

Examples:
    python3 pitwall_bridge.py --print
    python3 pitwall_bridge.py --demo --supabase
    SUPA_URL=https://x.supabase.co SUPA_ANON=eyJ... SUPA_PASSCODE=word \
        python3 pitwall_bridge.py --supabase

The shared-memory field names below follow pyRfactor2SharedMemory / the rF2 plugin.
Anything the game does NOT expose stays None and is entered manually in the dashboard.
See README.md for the field-validation checklist.
"""
import argparse
import json
import os
import sys
import time
import urllib.request

POLL_HZ = 2  # updates per second


# ---------------------------------------------------------------------------
# Shared-memory reader (real game)
# ---------------------------------------------------------------------------
def open_shared_memory():
    """Return an rF2 shared-memory reader, or None if unavailable."""
    try:
        # pip install pyRfactor2SharedMemory  (Windows, game running)
        from pyRfactor2SharedMemory.sharedMemoryAPI import SimInfoAPI
        info = SimInfoAPI()
        return info
    except Exception as e:
        print(f"[bridge] shared memory not available: {e}", file=sys.stderr)
        return None


def read_state(info):
    """Map rF2 shared memory -> the dashboard's state dict.

    Field sources are best-effort; names vary slightly across plugin versions, so
    each is guarded. A None value means 'not exposed' -> manual entry in the UI.
    """
    tele = info.playersVehicleTelemetry()
    scor = info.playersVehicleScoring()

    def g(obj, name, default=None):
        try:
            return getattr(obj, name)
        except Exception:
            return default

    fuel = g(tele, "mFuel")
    last_lap = g(scor, "mLastLapTime")
    best_lap = g(scor, "mBestLapTime")
    total_laps = g(tele, "mLapNumber", g(scor, "mTotalLaps"))
    place = g(scor, "mPlace")
    in_pits = g(scor, "mInPits")

    # damage: rF2 exposes per-region dent severity; LMU surfaces Aero/Body/Susp/Tyres %.
    # We pass through what we can read; refine once validated against the game.
    dents = g(tele, "mDentSeverity", None)

    # wheels (FL,FR,RL,RR): wear + brake temp + tyre temp + pressure
    wheels = []
    try:
        for w in tele.mWheels[:4]:
            wheels.append({
                "wear": g(w, "mWear"),
                "brakeTemp": g(w, "mBrakeTemp"),
                "temp": g(w, "mTemperature", [None])[0] if g(w, "mTemperature") else None,
                "press": g(w, "mPressure"),
                "flat": bool(g(w, "mFlat", 0)),
                "detached": bool(g(w, "mDetached", 0)),
            })
    except Exception:
        wheels = []

    return {
        "fuel_now": fuel,
        "last_lap_s": None if not last_lap or last_lap < 0 else last_lap,
        "best_lap_s": None if not best_lap or best_lap < 0 else best_lap,
        "laps_done": total_laps,
        "position": place,
        "in_pits": bool(in_pits) if in_pits is not None else None,
        "current_driver": (g(scor, "mDriverName") or b"").decode("utf-8", "ignore")
                           if isinstance(g(scor, "mDriverName"), (bytes, bytearray))
                           else g(scor, "mDriverName"),
        "wheels": wheels or None,
        "_dents": list(dents) if dents is not None else None,
        "updated_at": _now_iso(),
    }


# ---------------------------------------------------------------------------
# Demo generator (no game)
# ---------------------------------------------------------------------------
def demo_state(tick):
    import math
    lap = tick // 4
    wet = (tick % 240) > 150
    return {
        "fuel_now": max(2.0, 75 - (tick % 96) * 3.1),
        "avg_lap_live": 95.0 * (1.12 if wet else 1.0),
        "last_lap_s": round(95.0 * (1.12 if wet else 1.0) + math.sin(tick) * 0.8, 3),
        "best_lap_s": 94.18,
        "laps_done": lap,
        "stint_lap": (tick % 96) // 4,
        "elapsed_s": tick * 24,
        "weather_now": "wet" if wet else "dry",
        "current_driver": ["D1", "D2", "D3", "D4"][(lap // 23) % 4],
        "position": 3 + (tick % 5 == 0),
        "gap_ahead_s": 3.2, "gap_behind_s": 5.8,
        "tire_wear_pct": min(100, (tick % 96)), "laps_on_tires": (tick % 96) // 4,
        "aero_pct": 0, "body_pct": 0, "susp_pct": 0, "tyres_pct": min(100, tick % 60),
        "repair_s": 0, "penalties": 0,
        "updated_at": _now_iso(),
    }


# ---------------------------------------------------------------------------
# Supabase push (REST -> push_state RPC; no supabase-py needed)
# ---------------------------------------------------------------------------
def push_supabase(state):
    url = os.environ.get("SUPA_URL")
    anon = os.environ.get("SUPA_ANON")
    passcode = os.environ.get("SUPA_PASSCODE", "")
    if not url or not anon:
        print("[bridge] --supabase needs SUPA_URL and SUPA_ANON env vars", file=sys.stderr)
        return False
    endpoint = url.rstrip("/") + "/rest/v1/rpc/push_state"
    body = json.dumps({"p_passcode": passcode, "p_data": state}).encode("utf-8")
    req = urllib.request.Request(endpoint, data=body, method="POST")
    req.add_header("Content-Type", "application/json")
    req.add_header("apikey", anon)
    req.add_header("Authorization", "Bearer " + anon)
    try:
        with urllib.request.urlopen(req, timeout=5) as r:
            return 200 <= r.status < 300
    except Exception as e:
        print(f"[bridge] supabase push failed: {e}", file=sys.stderr)
        return False


def _now_iso():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


# ---------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser(description="Pit Wall telemetry bridge (LMU/rF2)")
    ap.add_argument("--print", dest="do_print", action="store_true",
                    help="print mapped fields (validate the game exposes them)")
    ap.add_argument("--demo", action="store_true", help="synthetic race, no game needed")
    ap.add_argument("--supabase", action="store_true", help="push to Supabase")
    ap.add_argument("--hz", type=float, default=POLL_HZ, help="updates per second")
    args = ap.parse_args()

    if not (args.do_print or args.demo or args.supabase):
        ap.print_help()
        return

    info = None
    if not args.demo:
        info = open_shared_memory()
        if info is None and not args.supabase:
            print("[bridge] no game + not demo mode -> nothing to read. "
                  "Use --demo to test without the game.", file=sys.stderr)
            return

    period = 1.0 / max(0.5, args.hz)
    tick = 0
    print(f"[bridge] start — print={args.do_print} demo={args.demo} supabase={args.supabase}")
    try:
        while True:
            state = demo_state(tick) if args.demo else read_state(info)
            if args.do_print:
                print(json.dumps(state, indent=2, default=str))
            if args.supabase:
                ok = push_supabase(state)
                if args.do_print:
                    print(f"[bridge] supabase push: {'ok' if ok else 'FAILED'}")
            tick += 1
            time.sleep(period)
    except KeyboardInterrupt:
        print("\n[bridge] stopped")


if __name__ == "__main__":
    main()
