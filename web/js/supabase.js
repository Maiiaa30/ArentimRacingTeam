// Supabase realtime client — WIRED LATER.
// Keep real keys in web/supabase.local.js (gitignored). This is a placeholder shim
// so the dashboard runs fully offline during dev (sim panel drives it instead).
window.PitDB = {
  connected: false,
  // async init(url, anonKey) { ... create client, subscribe to race_state ... }
  // async pushState(state) { ... }
  // onState(cb) { ... realtime subscription ... }
  init() { console.warn("PitDB: offline stub — using local sim feeder"); },
  pushState() {},
  onState() {}
};
