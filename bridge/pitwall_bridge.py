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

The shared-memory field names below follow LMU's built-in interface via pyLMUSharedMemory.
Anything the game does NOT expose stays None and is entered manually in the dashboard.
See README.md for the field-validation checklist.
"""
import argparse
import json
import os
import re
import sys
import time
import urllib.request

POLL_HZ = 2  # updates per second


# ---------------------------------------------------------------------------
# Shared-memory reader (real game)
# ---------------------------------------------------------------------------
def open_shared_memory():
    """Return an LMU shared-memory reader (lmu_data.SimInfo), or None if unavailable.

    Le Mans Ultimate exposes its OWN built-in shared memory (file "LMU_Data"), not
    the classic rF2 Iron Wolf plugin buffers. We read it via TinyPedal's
    pyLMUSharedMemory. Clone it next to this file on the Windows game PC:
        git clone https://github.com/TinyPedal/pyLMUSharedMemory.git
    """
    try:
        from pyLMUSharedMemory import lmu_data
        info = lmu_data.SimInfo()
        # touch the buffer so a dead/zero mapping fails here, not mid-read
        _ = info.LMUData.scoring.scoringInfo.mNumVehicles
        return info
    except Exception as e:
        print(f"[bridge] shared memory not available: {e}", file=sys.stderr)
        print("[bridge] need pyLMUSharedMemory cloned beside this file, LMU running, "
              "and the game's shared-memory plugin enabled.", file=sys.stderr)
        return None


def _norm_class(c):
    """LMU class text -> a key the dashboard's CLASS_META knows (Hypercar/LMP2/LMGT3)."""
    if not c:
        return "GT3"
    k = c.strip().lower()
    if k.startswith("hyper") or k in ("lmh", "lmdh"):
        return "Hypercar"
    if "lmp2" in k:
        return "LMP2"
    if "gt3" in k or k == "lmgt3":
        return "LMGT3"
    return c.strip()


def _parse_veh(raw):
    """LMU mVehicleName -> (clean_name, manuf, team, num).

    'Cadillac Hertz Team Jota 2026 #12:LM'
      -> ('Cadillac Hertz Team Jota 2026 #12', 'Cadillac', 'Hertz Team Jota', '12')
    """
    raw = (raw or "").split(":")[0].strip()        # drop trailing class tag ":LM"
    if not raw:
        return ("", "", "", None)
    m = re.search(r"#(\w+)", raw)
    num = m.group(1) if m else None
    base = re.sub(r"\s*#\w+", "", raw).strip()      # drop the car number
    toks = base.split()
    manuf = toks[0] if toks else ""
    rest = base[len(manuf):].strip()
    team = re.sub(r"\s*\b(?:19|20)\d{2}\b", "", rest).strip() or rest  # drop year
    return (raw, manuf, team, num)


def read_state(info):
    """Map LMU shared memory -> the dashboard's state dict (unchanged output shape).

    Field names come from pyLMUSharedMemory (S397 SharedMemoryInterface header).
    Still best-effort until validated against a live --print; a None value means
    'not exposed' -> manual entry in the UI. All name/char fields come back as bytes.
    """
    D = info.LMUData
    pidx = D.telemetry.playerVehicleIdx          # telemetry array index of player
    tele = D.telemetry.telemInfo[pidx]           # LMUVehicleTelemetry (player)
    si = D.scoring.scoringInfo                   # LMUScoringInfo (session)

    def g(obj, name, default=None):
        try:
            v = getattr(obj, name)
            return v if v is not None else default
        except Exception:
            return default

    def dec(x):
        if isinstance(x, (bytes, bytearray)):
            return x.decode("utf-8", "ignore").split("\x00", 1)[0].strip()
        return x


    # scoring array order != telemetry order -> find the player's scoring row by flag.
    n = int(g(si, "mNumVehicles", 0) or 0)
    vehicles = D.scoring.vehScoringInfo
    sidx = pidx
    try:
        for i in range(max(0, min(n, len(vehicles)))):
            if vehicles[i].mIsPlayer:
                sidx = i
                break
    except Exception:
        pass
    scor = vehicles[sidx]                         # LMUVehicleScoring (player)

    fuel = g(tele, "mFuel")                        # liters
    last_lap = g(scor, "mLastLapTime")
    best_lap = g(scor, "mBestLapTime")
    total_laps = g(scor, "mTotalLaps", g(tele, "mLapNumber"))
    place = g(scor, "mPlace")
    in_pits = g(scor, "mInPits")

    # damage: LMU exposes 8-location dent severity (0=none,1=some,2=more) + detach flags.
    dents = g(tele, "mDentSeverity", None)

    # wheels FL,FR,RL,RR: wear(0..1 fraction), brake temp(C), tyre temp(K->C), pressure(kPa)
    wheels = []
    try:
        for w in tele.mWheels[:4]:
            temps = g(w, "mTemperature")
            tcen = None
            if temps:
                k = temps[1] if len(temps) > 1 else temps[0]   # center sample, Kelvin
                tcen = round(k - 273.15, 1) if k else None
            mwear = g(w, "mWear")                 # LMU: life REMAINING (1.0 fresh -> 0 dead)
            bt = g(w, "mBrakeTemp")               # LMU reports Kelvin despite the "Celsius" doc
            wheels.append({
                # dashboard wants WORN fraction (0 fresh -> 1 dead), so invert
                "wear": None if mwear is None else round(max(0.0, 1.0 - mwear), 4),
                "brakeTemp": None if bt is None else round(bt - 273.15, 1),  # K -> C
                "temp": tcen,                      # Celsius (center sample)
                "press": g(w, "mPressure"),        # kPa
                "flat": bool(g(w, "mFlat", 0)),
                "detached": bool(g(w, "mDetached", 0)),
            })
    except Exception:
        wheels = []

    track_temp = g(si, "mTrackTemp")               # Celsius
    air_temp = g(si, "mAmbientTemp")               # Celsius

    # session clock: LMU gives remaining directly; fall back to end - current.
    session_remaining = g(si, "mSessionTimeRemaining")
    if not session_remaining or session_remaining <= 0:
        cur_et = g(si, "mCurrentET")
        end_et = g(si, "mEndET")
        session_remaining = (end_et - cur_et) if (cur_et is not None and end_et and end_et > 0) else None

    # flag from mGamePhase (rF2/LMU GamePhase enum):
    #   0 garage, 1 warmup, 2 gridwalk, 3 formation, 4 countdown,
    #   5 GREEN (racing), 6 full-course yellow, 7 red/stopped, 8 checkered/over.
    # Local sector yellows (mSectorFlag) only matter once we're actually green.
    flag = "green"
    phase = g(si, "mGamePhase")
    sflags = g(si, "mSectorFlag")
    # Trust ONLY mGamePhase for the flag (local sector-yellow bits proved unreliable
    # and flagged green racing as yellow). 6 = full-course yellow, 7 = red/stopped,
    # 8 = checkered/over; everything else (0-5 = garage..green) shows green.
    if phase == 8:
        flag = "checkered"
    elif phase == 7:
        flag = "red"
    elif phase == 6:
        flag = "fcy"
    else:
        flag = "green"

    # weather snapshot (dashboard reads weather_now)
    raining = g(si, "mRaining")                    # 0..1 severity
    wetness = g(si, "mAvgPathWetness")             # 0..1 avg path wetness
    weather_now = "wet" if ((raining and raining > 0.05) or (wetness and wetness > 0.25)) else "dry"

    # sector splits for our last lap (cumulative -> per-sector)
    ls1 = g(scor, "mLastSector1")
    ls2 = g(scor, "mLastSector2")
    sectors = None
    if ls1 and ls1 > 0 and ls2 and ls2 > 0 and last_lap and last_lap > 0:
        sectors = {"s1": round(ls1, 3), "s2": round(ls2 - ls1, 3), "s3": round(last_lap - ls2, 3)}

    # rival field: iterate every scored vehicle
    rivals = []
    try:
        my_id = g(scor, "mID")
        for i in range(max(0, min(n, len(vehicles)))):
            v = vehicles[i]
            driver = dec(g(v, "mDriverName") or b"")
            raw_car = dec(g(v, "mVehicleName") or b"")    # "Cadillac Hertz Team Jota 2026 #12:LM"
            cls = _norm_class(dec(g(v, "mVehicleClass") or b""))
            name, manuf, team, num = _parse_veh(raw_car)
            if not team:
                team = dec(g(v, "mPitGroup") or b"")      # fallback: pit group
            vll = g(v, "mLastLapTime")
            vbl = g(v, "mBestLapTime")
            rivals.append({
                "pos": g(v, "mPlace"),
                "name": name or driver,
                "num": num,
                "manuf": manuf,
                "model": name,
                "team": team or name,
                "driver": driver,
                "cls": cls,
                "gap_s": g(v, "mTimeBehindLeader"),
                "last_lap_s": None if not vll or vll < 0 else round(vll, 3),
                "best_lap_s": None if not vbl or vbl < 0 else round(vbl, 3),
                "laps": g(v, "mTotalLaps"),
                "in_pits": bool(g(v, "mInPits", 0)),
                "is_us": (g(v, "mID") == my_id) if my_id is not None else False,
            })
    except Exception:
        rivals = []

    # --- damage, derived ONLY from real LMU signals (no invented category %) ---
    # LMU exposes: 8-location dent severity (0=none,1=some,2=more), per-part/-wheel
    # detach, and per-wheel flat. It does NOT expose Aero/Body/Susp/Tyre % directly,
    # so anything we can't measure is sent as null -> dashboard shows "—", not a guess.
    dent_list = list(dents) if dents is not None else None
    body_pct = round(sum(int(d) for d in dent_list) / (len(dent_list) * 2) * 100) if dent_list else None
    any_flat = any(w.get("flat") for w in wheels) if wheels else False
    any_wheel_off = any(w.get("detached") for w in wheels) if wheels else False
    parts_off = bool(g(tele, "mDetached"))        # any non-wheel part detached
    susp_pct = 100 if any_wheel_off else 0
    tyres_pct = 100 if (any_flat or any_wheel_off) else 0

    # last impact (real): magnitude + how long ago (session seconds)
    imag = g(tele, "mLastImpactMagnitude")
    iet = g(tele, "mLastImpactET")
    et = g(tele, "mElapsedTime")
    last_impact_mag = round(imag, 1) if imag else None
    last_impact_ago_s = round(et - iet, 1) if (iet and iet > 0 and et) else None

    # gap to car ahead (real). gap behind isn't directly on our own row in LMU.
    gap_ahead = g(scor, "mTimeBehindNext")
    gap_ahead = round(gap_ahead, 3) if (gap_ahead and gap_ahead > 0) else None

    return {
        "fuel_now": fuel,
        "fuel_capacity": g(tele, "mFuelCapacity"),
        "last_lap_s": None if not last_lap or last_lap < 0 else last_lap,
        "best_lap_s": None if not best_lap or best_lap < 0 else best_lap,
        "laps_done": total_laps,
        "elapsed_s": g(si, "mCurrentET"),           # real session elapsed (for weather/regen)
        "position": place,
        "cls_position": place,
        "gap_ahead_s": gap_ahead,
        "gap_behind_s": None,                        # LMU: not exposed for our own car
        "penalties": g(scor, "mNumPenalties"),
        "scheduled_stops": g(tele, "mScheduledStops"),
        "in_pits": bool(in_pits) if in_pits is not None else None,
        "current_driver": dec(g(scor, "mDriverName")),
        "wheels": wheels or None,
        "flag": flag,
        "weather_now": weather_now,
        "track_temp": track_temp,
        "air_temp": air_temp,
        "session_remaining_s": session_remaining,
        "sectors": sectors,
        "rivals": rivals or None,
        # damage: real-derived where possible, null where LMU can't measure it
        "aero_pct": None,                            # LMU can't isolate aero damage
        "body_pct": body_pct,                        # from dent severity (real)
        "susp_pct": susp_pct,                        # 100 if a wheel is detached
        "tyres_pct": tyres_pct,                      # 100 if a wheel is flat/detached
        "repair_s": None,                            # LMU repair estimate not in this buffer
        "parts_detached": parts_off,
        "last_impact_mag": last_impact_mag,
        "last_impact_ago_s": last_impact_ago_s,
        # fields LMU doesn't feed -> null so the dashboard blanks them (never fake):
        "avg_lap_live": None,                        # derived on dashboard from lap history
        "stint_time_s": None,
        "lap_delta_s": None,                         # dashboard derives last - best
        "last_pit_lap": None,                        # dashboard derives from pit transitions
        "laps_on_tires": None,
        "tire_wear_pct": None,                       # dashboard derives from wheels
        "_dents": dent_list,
        "_game_phase": phase,                        # diagnostic: raw mGamePhase
        "_sector_flags": list(sflags) if sflags else None,
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
        # real-telemetry fields (demo values)
        "flag": "fcy" if (tick % 180) > 170 else ("yellow" if (tick % 90) > 85 else "green"),
        "in_pits": (tick % 96) in (0, 1),
        "session_remaining_s": max(0, 21600 - tick * 24),
        "track_temp": round(30 - (6 if wet else 0) + math.sin(tick / 40) * 2, 1),
        "air_temp": round(20 - (3 if wet else 0) + math.sin(tick / 60), 1),
        "sectors": {
            "s1": round((95.0 * (1.12 if wet else 1.0)) * 0.32, 3),
            "s2": round((95.0 * (1.12 if wet else 1.0)) * 0.40, 3),
            "s3": round((95.0 * (1.12 if wet else 1.0)) * 0.28, 3),
        },
        "rivals": [
            {"pos": p, "num": num, "manuf": mf, "model": mdl, "team": tm, "driver": dr,
             "name": "#" + num + " " + mf, "cls": cl,
             "gap_s": 0 if num == "30" else round(p * 3.5, 1),
             "last_lap_s": round((95.0 - (8 if cl == "Hypercar" else 0)) + p * 0.2, 3),
             "best_lap_s": round((95.0 - (8 if cl == "Hypercar" else 0)) - 0.4, 3),
             "laps": lap + (int(lap * 0.08) if cl == "Hypercar" else 0),
             "in_pits": False, "is_us": num == "30"}
            for p, (num, mf, mdl, tm, dr, cl) in enumerate([
                ("7", "Toyota", "GR010 Hybrid", "Toyota Gazoo Racing", "Kobayashi", "Hypercar"),
                ("51", "Ferrari", "499P", "Ferrari AF Corse", "Pier Guidi", "Hypercar"),
                ("2", "Cadillac", "V-Series.R", "Cadillac Racing", "Bamber", "Hypercar"),
                ("6", "Porsche", "963", "Porsche Penske", "Estre", "Hypercar"),
                ("92", "Porsche", "911 GT3 R", "Manthey PureRxcing", "Malykhin", "GT3"),
                ("30", "Arentim", "GT3", "Arentim Racing Team", "", "GT3"),
                ("15", "BMW", "M4 GT3", "WRT", "Rossi", "GT3"),
                ("88", "Lamborghini", "Huracán GT3", "Iron Lynx", "Perera", "GT3"),
                ("46", "Aston", "Vantage GT3", "Heart of Racing", "Riberas", "GT3"),
                ("777", "Mercedes", "AMG GT3", "AlManar by GetSpeed", "Schiller", "GT3"),
            ], start=1)
        ],
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
def load_dotenv():
    """Load KEY=VALUE lines from a .env next to this script into os.environ.

    Keeps secrets out of the command line and out of git (.env is gitignored).
    Existing real environment variables win over the file. No dependency needed.
    """
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
    if not os.path.isfile(path):
        return
    try:
        with open(path, "r", encoding="utf-8") as fh:
            for raw in fh:
                line = raw.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, _, val = line.partition("=")
                key = key.strip()
                val = val.strip().strip('"').strip("'")
                if key and key not in os.environ:
                    os.environ[key] = val
    except Exception as e:
        print(f"[bridge] could not read .env: {e}", file=sys.stderr)


def main():
    load_dotenv()
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
