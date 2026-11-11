// Default race config — Arentim Racing Team 6h LMU
// All times in SECONDS, fuel in LITERS, distances in LAPS.
window.RACE_CONFIG = {
  // --- race ---
  duration_s: 6 * 3600,        // 6 hours
  n_drivers: 4,
  driver_names: ["D1", "D2", "D3", "D4"],

  // --- car / pace (set from practice) ---
  avg_lap_s: 95,               // avg lap time, seconds  (PLACEHOLDER — set real)
  fuel_per_lap: 3.1,           // liters per lap dry      (PLACEHOLDER)
  tank_cap: 75,                // liters                  (PLACEHOLDER)
  fuel_margin_laps: 1,         // keep this many laps of fuel as safety

  // --- tires ---
  tire_budget: 20,             // total tires available for the race
  tire_count_mode: "set",      // "set" (4 tires = 1 set) | "individual"  — confirm in LMU
  wets_share_budget: true,     // wets come out of the same 20
  tire_life_laps: {            // usable laps before big dropoff, per compound
    soft: 28, med: 40, hard: 55, wet: 45
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

  // --- damage / repair ---  (times = fallback estimates; read from LMU engineer menu if exposed)
  damage: {
    repair_body_s: 30,         // body-only repair time (PLACEHOLDER — validate in-game)
    repair_all_s: 120,         // full repair incl. suspension/aero (cap ~180s)
    critical_severity: 2,      // dent zone value that counts as severe
    // dent zone index -> body location (community convention; VALIDATE by hitting corners)
    zone_labels: ["front","front-right","right","rear-right","rear","rear-left","left","front-left"]
  }
};

// Real driver names — swap these in (you said you'll tell me how later).
window.DRIVERS = ["D1", "D2", "D3", "D4"];

// Weather timeline — pulled from game later; manual for now.
// Each segment: { start_s, condition: "dry"|"wet", wetness: 0..1 }
window.WEATHER_TIMELINE = [
  { start_s: 0, condition: "dry", wetness: 0 }
];
