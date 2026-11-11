// Default race config — Arentim Racing Team 6h LMU
// All times in SECONDS, fuel in LITERS, distances in LAPS.
window.RACE_CONFIG = {
  // --- race ---
  duration_s: 6 * 3600,        // 6 hours
  car_number: 38,              // our GT3
  n_drivers: 4,
  // Francisco starts (index 0). Rui & Helder must never take stint 1.
  driver_names: ["Francisco Coelho", "Diogo Rodrigues", "Rui Garcia", "Helder Marques"],
  // Agreed DEFAULT rotation (8-stint EQUAL-SEAT plan). Everyone drives the same —
  // 2 stints each, ~equal minutes, because this is for fun + first 6h finish.
  // Francisco bookends (starts + takes the flag: the cold-tyre start and the
  // traffic-heavy finish, the two riskiest phases) but still only 2 stints.
  // The other three split the calm middle 2 stints each. Rui/Helder never start.
  // Balance: Francisco 2, Diogo 2, Rui 2, Helder 2.
  driver_sequence: ["Francisco Coelho", "Diogo Rodrigues", "Rui Garcia", "Helder Marques",
                    "Diogo Rodrigues", "Rui Garcia", "Helder Marques", "Francisco Coelho"],
  cannot_start: ["Rui Garcia", "Helder Marques"],

  // --- car / pace (ASSUMED GT3 endurance values — replace with practice data in Setup) ---
  // Tuned so the default plan is ~6 stints of ~32 laps = the agreed strategy.
  avg_lap_s: 110,              // avg lap time, seconds   (ASSUMPTION — set real in Setup)
  fuel_per_lap: 3.1,           // liters per lap dry      (ASSUMPTION)
  tank_cap: 105,               // liters ~ 33-lap stint   (ASSUMPTION)
  fuel_margin_laps: 1,         // keep this many laps of fuel as safety
  // Short-fuel cap for the EQUAL-SEAT plan: pit at ~24 laps (~45 min) instead of
  // running the tank dry (~32). Makes 8 even stints so all 4 drivers get the same
  // time. Set to 0/remove to go back to fuel-max (fewer stops, uneven split).
  max_stint_laps: 24,

  // --- tires ---
  tire_budget: 20,             // total tires available for the race
  tire_reserve_sets: 1,        // hold this many sets back (wets / damage) when planning dry
  tire_count_mode: "set",      // "set" (4 tires = 1 set) | "individual"  — confirm in LMU
  wets_share_budget: true,     // wets come out of the same 20
  tire_life_laps: {            // usable laps before big dropoff, per compound
    // med 70 => comfortably double-stints (~2 x 33 laps) in the cool forecast
    soft: 40, med: 70, hard: 85, wet: 55
  },

  // --- pit ---
  pit_loss_s: 55,              // pit lane delta + service (PLACEHOLDER — measure)

  // --- weather ---
  wet_lap_factor: 1.12,        // wet lap time = dry * this (PLACEHOLDER)
  wet_fuel_factor: 1.0,        // fuel/lap multiplier in wet

  // --- strategy ---
  optimize_target: "fewest_stops", // "fewest_stops" | "fastest" | "safest" (operator picks)

  // --- car / class ---
  car_class: "GT3",            // "GT3" | "Hypercar"
  energy_mode: "fuel",         // "fuel" (GT3) | "ve" (Hypercar virtual energy)
  ve_max: 100,                 // Virtual Energy budget (%) — only if energy_mode "ve"
  ve_per_lap: 1.6,             // VE % used per lap — validate in-game

  // --- damage / repair ---  LMU reports Aero/Body/Susp/Tyres % + a repair-time estimate
  damage: {
    severe_pct: 20,            // category % that counts as severe (REPAIR)
    susp_critical: 25,         // suspension % that forces a pit (REPAIR_NOW)
    repair_fallback_s: 30      // used only if LMU repair_s is missing
  },

  // --- access gate ---  SOFT shared passcode (see js/gate.js header).
  // "" = no gate. This is a convenience lock for the team, NOT real security
  // (the value is in client JS). Real protection = Supabase passcode + host auth.
  access_passcode: ""          // set a shared word to require it on load
};

// Real driver names — editable from the dashboard Setup panel.
window.DRIVERS = ["Francisco Coelho", "Diogo Rodrigues", "Rui Garcia", "Helder Marques"];

// Apply saved overrides from the Setup panel (localStorage) over the defaults above.
// This is how real practice values + driver names get in without editing code.
window.CONFIG_KEY = 'arentim_pitwall_config';
try {
  const ov = JSON.parse(localStorage.getItem(window.CONFIG_KEY) || 'null');
  if (ov && typeof ov === 'object') {
    if (ov.tire_life_laps) { Object.assign(window.RACE_CONFIG.tire_life_laps, ov.tire_life_laps); delete ov.tire_life_laps; }
    Object.assign(window.RACE_CONFIG, ov);
    if (Array.isArray(ov.driver_names)) window.DRIVERS = ov.driver_names.slice();
  }
} catch (e) {}

// Weather timeline — pulled from game later; manual for now.
// Each segment: { start_s, condition: "dry"|"wet", wetness: 0..1 }
// Forecast: dry/cloudy, no rain expected (TBD on the day). Plan dry; if rain
// comes, the live game weather drives the chip and the operator hits "Rain NOW"
// to regenerate the remainder onto wets.
window.WEATHER_TIMELINE = [
  { start_s: 0, condition: "dry", wetness: 0 }
];
