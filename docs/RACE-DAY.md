# Race-Day Runbook — Arentim Pit Wall

> One operator reads this board and calls the race. Keep it on a second screen
> (laptop/tablet) next to the stream. The strategy maths is in
> [STRATEGY.md](STRATEGY.md); this is the "what do I press" sheet.

---

## The day before — prove the pipeline (no game needed)

The bridge → Supabase → board chain is the single point of failure. Test it
without the game using demo mode:

```
python3 pitwall_bridge.py --demo --supabase
```

Open the board on another device — it should come alive with a synthetic race
(our car **#38 BMW M4 LMGT3**, Francisco driving, rivals moving). This proves
your Supabase URL / anon key / passcode and network are correct. If the board
updates here, the only unknown left on race day is the shared-memory read.
The bridge console prints `supabase push FAILING` if a push fails — if you see
that, fix network/keys before trusting the live run.

## Before the start

1. **Bridge up on the game PC.** `python pitwall_bridge.py --print --supabase`
   (see [DEPLOY.md](DEPLOY.md)). `--print` lets you eyeball the mapped fields.
   Confirm the header chip reads **● live · cloud**. If it says **waiting** the
   board has no data yet; if **● NO FEED** (red) the bridge isn't pushing — fix
   before the lights. The bridge console also shouts `push FAILING` if Supabase
   stops accepting pushes.
2. **Open the board** on every device that needs it. All sync off the same
   Supabase row, so they all show the same thing.
3. **Check the default plan** — *Default strat* button. Should read 8 stints /
   7 stops / ~188 laps, blocks Francisco → Rui → Helder → Diogo. If a device
   shows something else, a stale Setup override is on it (the Default view reads
   the shipped baseline, so trust it over the live table at T-0).
4. **Driver rules are baked in:** Francisco starts, Rui & Helder never start.
   Don't hand-edit the sequence unless the team agreed a change.

---

## Validating the telemetry read (practice stint)

Do this once before race day — a single ~1h practice stint with the bridge
running (`--print --supabase`). The pipeline is already proven (demo test); this
confirms the game's **values** map right. Watch for:

- [ ] Header chip goes **● live · cloud** when you're on track.
- [ ] **Fuel (L), VE%, laps, lap times** populate and move. Anything stuck `null`
      the game doesn't expose → it's entered manually in Setup / the sim feeder.
- [ ] **Measured VE %/lap** (fuel-tile subtext, e.g. `VE 51% (4.5%/lap)`) settles
      near **4.2**. If it's well off, note the number — the window self-corrects,
      but `ve_per_lap` in `config.js` should be updated to the real figure.
- [ ] **Pit-in** counts down toward the **VE** stop (~24), not the fuel number
      (~40). When VE binds the tile says *VE-limited*.
- [ ] **Tyre-life %** on the grid **falls** as the stint goes (100 fresh → down).
- [ ] **Track temp / air temp** populate (Tyres panel). If they stay `—` the
      bridge isn't sending `track_temp`/`air_temp` yet — the trend + psi hint need
      them. **Off-tracks** need the bridge's `track_limits` field, so **restart the
      bridge** after any update to pick up newly added fields; contacts work without.
- [ ] **Pit** when you box: the board auto-logs entry/exit, runs the pit timer,
      writes the stint to history, and resets the stint.

Paste the `--print` output back if anything looks wrong — the mapping gets tuned
to match. Field *names* are already validated against the struct, so this is a
value/units check, not a debug-from-scratch.

---

## Reading the board

- **Hero row:** Fuel laps left · Pit-in (laps) · Stint lap. **Pit-in is the number
  that matters** — it counts down to the stop, and for our LMGT3 it tracks
  **Virtual Energy**, not fuel (the tank lasts ~40 laps, VE forces the stop at
  ~24). When VE is the limiter the tile reads **"VE-limited · N laps VE"**.
- **Fuel tile subtext** shows live measured rates: `80.0 L · 2.8 L/lap · VE 51%
  (4.5%/lap)`. The **%/lap** is the real VE drain — confirm it sits near **4.2**;
  if it's well off, the pit window still self-corrects (it uses the measured rate).
- **Strategy Brain** (Status panel): the recommendation engine. See below.
- **Next-stop card:** what the upcoming stop is — fuel to add, tyres new/keep,
  driver swap or stays in, the live window band (`L18–22 · ideal L20`), and the
  **engineer call** (SAVE/PUSH/ON-TARGET + undercut) — see *Live engineer calls*.
- **Race strategy table (left):** the full stop-by-stop plan for the rest of the
  race. It **re-anchors only after a real pit stop or a weather change**, not
  every lap — so it no longer churns. The live pit window + VE track reality
  lap-by-lap in the Status panel; the table is the big picture.
- **Tyres:** used / budget (20). Red = over budget, must double-stint more. Below
  it: worst **tyre-life %** (100 = fresh), laps-on-set, wear-out estimate, and
  **track temp** trend + a cold-pressure hint.
- **Status panel rows:** Stint pace (deg), Seat time (reg), Laps left, Stops left,
  Avg lap, **Pace target**, **To flag**, Make finish.
- **Events log:** every pit, weather call, incident, pace change — timestamped.
- **Banners (top of page):** 📻 BOX THIS LAP · 🅿 IN PITS (live pit timer) ·
  ⚑ FCY/SC cheap-stop · feed-loss. They only show when they matter.

---

## Live engineer calls (what the data is telling you)

These are the blind-engineer read-outs — they let you call the race off the
numbers alone, no eyes on track needed.

- **SAVE / PUSH / ON-TARGET** (next-stop card): whether you'll reach the ideal
  stop on the energy/fuel you have. **PUSH · +1.5 laps in hand** = margin, send
  it. **SAVE · lift & coast ~0.2%/lap** = you're draining too fast, short-shift /
  lift. **ON TARGET** = right on the number. Uses the *more binding* of VE and
  fuel. (Hidden once it's BOX-NOW — the stop call takes over.)
- **Box-now track line** (undercut/overcut): what a stop *right now* does to
  position — "keep P12 (+8s on P13)" or "lose P12 → rejoin 52s behind · undercut
  P11 if they stay out". Gap vs pit-loss. Use it when a rival is close.
- **Stint pace** (Status): deg read-out from lap times — **steady** / **+0.4s
  easing** / **+1.2s dropping**. Dropping = tyres going off → consider boxing at
  the early edge of the window.
- **Seat time** (Status): continuous time at the wheel for the current driver vs
  the reg (`driver_max_consecutive_min`, default 80m). Turns amber near the limit,
  red over it — get them out at the next stop.
- **Pace target** (Status): the lap time needed to make the planned distance in
  the race clock, vs the live average: **· 2.6s spare** (comfortable) or **· short
  2.0s** (can't make the laps at this pace). Mostly comfortable in an energy race.
- **To flag** (Status): whole-race VE/fuel margin given the stops you plan to make
  — **+26 laps (VE)** = plenty, a negative = you're short and need an extra splash.
- **Track temp + cold-psi hint** (Tyres): temp trend arrow + "drop cold psi ~0.5
  (vs 30°C set)" when the track runs hotter/cooler than the reference.

**Driver load** button opens the per-driver history: planned load, **actual this
session** (stints, laps, best, contacts, off-tracks, **time lost**), **seat time
actual**, and **stint-by-stint** (tyre-life end + pit time). This is the "compare
the drivers later" record — it persists in the browser.

---

## The Strategy Brain

Lives in the Status panel. It recomputes the rest of the race every update and
grades a handful of lines against: makes the flag → most laps → fewest tyre sets.

- **Neutral "Plan is optimal":** nothing to do.
- **Blue "◆" with an Apply button:** a better line exists. Read the one-line
  reason; if you agree, tap **Apply** — it commits the plan and logs the event.
  Tap **▸ N other lines** to see runner-ups and apply one of those instead.
- **Red "⚠ No clean plan":** no line stays inside tyre budget / VE window / fuel.
  You're in damage-control; the closest line is shown. Expect a compromise
  (take the penalty, or accept a short final splash).
- **Yellow "FROZEN":** the feed is dead (see below). The Brain won't recompute on
  stale data — it holds the last read and waits.

The Brain never acts on its own. Applying is always your call.

---

## Procedures

### Pit stop (normal)
The board auto-detects pit entry/exit from the game (`in_pits`) and logs it —
you don't press anything. Watch the Next-stop card so you can call the driver in
on the right lap. While stopped, the 🅿 **IN PITS** banner shows a **live pit
timer**, the stop number, and what the tyres were at. On exit the stint is written
to the per-driver history (laps, best, tyre-life, contacts, off-tracks, pit time)
and the plan re-anchors from the real stop lap.

### Damage / forced stop
Car is hurt and must pit now, off-schedule:
1. Hit **Forced Pit**. This refuels, fits fresh tyres, clears damage, adds the
   pit-loss time, and regenerates the rest of the race.
2. Check the Brain — after an unplanned stop it often flags a new best line
   (fewer stops, or tyre rationing). Apply if it makes sense.
3. If the Brain goes red, you've spent a tyre set early; accept fewer fresh sets
   later or a short final stint.

### Full-course yellow / safety car
When the field is slowed and a stop is near, pitting is **much cheaper** (you lose
far less relative time). The board raises an amber **⚑ CHEAP STOP, BOX NOW** banner
when the flag is FCY/SC/yellow and your stop is within ~6 laps.
1. If the banner is up and you're in (or near) the window, **box now** — take the
   discounted stop even a few laps early.
2. The game auto-logs the stop as usual; the plan re-anchors on pit exit.
3. If you're nowhere near a stop, ignore it — don't pit early just to chase it.

### Rain
1. When it starts raining, hit **Rain NOW**. The remaining plan rebuilds onto
   wets from this point.
2. When the line dries, hit **Dry up** to plan the rest back on slicks.
3. The 2 reserve tyre sets exist for exactly this — wets come out of the same 20.

### Pace change
Driver is consistently faster/slower than planned (traffic, confidence, fuel
save): hit **Pace Change**, enter the new average lap time. Stint windows and
finish estimate re-scale.

### Feed loss (bridge died / network dropped)
The board makes this loud on purpose:
- Header chip turns red **● NO FEED**, a red banner appears, and the live numbers
  (fuel, pit-in, gaps) go grey/frozen. **Do not trust a frozen pit-in count.**
- The Brain freezes (yellow) and stops recomputing.
- **Fix the source:** check the bridge process on the game PC and its network.
  The bridge console will be printing `supabase push FAILING` — that confirms the
  break is bridge→Supabase, not the board. Once it pushes again the board clears
  itself within a few seconds (console prints `push recovered`) — no reload needed.
- If you can't recover it fast, fall back to the printed default plan + a stopwatch:
  stops every ~24 laps, driver blocks Francisco → Rui → Helder → Diogo.

---

## What-if & tools (no commitment)

- **What-if:** test Pit-now / Wets / Fuel-save / Push / Conserve against the
  current plan without applying anything.
- **Fuel save:** shows the L/lap target to extend a stint or drop a stop.
- **Lap log / Driver load / Timeline / Standings:** reference views.

---

## Golden rules

1. **Francisco starts. Rui & Helder never start.** Non-negotiable.
2. **Never over-run VE** — a 100s stop-go wrecks the race. Pit at the window.
3. **One stop at a time.** Don't re-plan the whole 6h on every yellow; apply a
   Brain line, drive to the next stop, reassess.
4. **Frozen numbers are not live numbers.** If the banner is up, fix the bridge
   before you make a call.
5. **It's a fun 6h finish, not a title fight.** Equal seat time, bring it home.
