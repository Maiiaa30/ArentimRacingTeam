// PitDB — live state sync between the sim feeder / telemetry bridge and the dashboard.
//
// NOW: localStorage backend → works across tabs in the SAME browser (no account).
//      Open sim.html in one tab, index.html in another → feeder drives the dashboard.
// LATER: drop in Supabase realtime for cross-device sync (same pushState/onState API).
//      If window.SUPA = { url, anonKey, passcode } is provided (web/supabase.local.js),
//      wire the Supabase client here; the rest of the app is unchanged.
window.PitDB = (() => {
  const KEY = 'arentim_pitwall_state';
  const hasSupa = !!(window.SUPA && window.SUPA.url && window.SUPA.anonKey);

  // ---- localStorage backend (default) ----
  function pushLocal(obj){
    try { localStorage.setItem(KEY, JSON.stringify({ ...obj, _t: Date.now() })); } catch(e){}
  }
  function onLocal(cb){
    try { const v = localStorage.getItem(KEY); if(v) cb(JSON.parse(v)); } catch(e){}
    window.addEventListener('storage', e => {
      if(e.key === KEY && e.newValue){ try { cb(JSON.parse(e.newValue)); } catch(_){} }
    });
  }

  // ---- Supabase backend (enabled when keys present) ----
  // TODO when keys arrive: load @supabase/supabase-js, create client, upsert a single
  // race_state row on pushState, and subscribe to postgres_changes on onState.
  // Passcode (window.SUPA.passcode) gates writes.
  function initSupa(){ console.warn('PitDB: SUPA keys present — Supabase wiring is a TODO; using localStorage.'); }

  if(hasSupa) initSupa();
  return {
    mode: hasSupa ? 'supabase(pending)->local' : 'local',
    connected: true,
    init(){},
    pushState: pushLocal,
    onState: onLocal
  };
})();
