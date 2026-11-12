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

## Reading the board

- **Hero row:** Fuel laps left · Pit-in (laps) · Stint lap. Pit-in is the number
  that matters — it counts down to the VE/fuel stop.
- **Strategy Brain** (Status panel): the recommendation engine. See below.
- **Next-stop card:** what the upcoming stop is — fuel to add, tyres new/keep,
  driver swap or stays in.
- **Tyres:** used / budget (20). Red = over budget, must double-stint more.
- **Events log:** every pit, weather call, incident, pace change — timestamped.

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
on the right lap.

### Damage / forced stop
Car is hurt and must pit now, off-schedule:
1. Hit **Forced Pit**. This refuels, fits fresh tyres, clears damage, adds the
   pit-loss time, and regenerates the rest of the race.
2. Check the Brain — after an unplanned stop it often flags a new best line
   (fewer stops, or tyre rationing). Apply if it makes sense.
3. If the Brain goes red, you've spent a tyre set early; accept fewer fresh sets
   later or a short final stint.

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
