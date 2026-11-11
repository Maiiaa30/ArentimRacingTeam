// PitDB — live state sync between the sim feeder / telemetry bridge and the dashboard.
//
// Two backends, one API (pushState / onState):
//   LOCAL  (default) → localStorage. Works across tabs in the SAME browser, no account.
//                      Open sim.html in one tab, index.html in another → feeder drives board.
//   SUPABASE (when configured) → Supabase realtime. Cross-device: feeder on one PC,
//                      pit wall on a phone/TV anywhere.
//
// Enable Supabase by creating web/supabase.local.js (gitignored) from the example:
//   window.SUPA = { url:'https://xxx.supabase.co', anonKey:'eyJ...', passcode:'word' };
// and load it BEFORE this file. Run db/schema.sql in Supabase once first.
//
// If Supabase config is present but the client fails to load, PitDB falls back to
// localStorage so the dev workflow never breaks.
window.PitDB = (() => {
  const KEY = 'arentim_pitwall_state';
  const SUPA = window.SUPA;
  const hasSupa = !!(SUPA && SUPA.url && SUPA.anonKey);

  // ---------- localStorage backend (default / fallback) ----------
  const local = {
    push(obj){
      try { localStorage.setItem(KEY, JSON.stringify({ ...obj, _t: Date.now() })); } catch(e){}
    },
    on(cb){
      try { const v = localStorage.getItem(KEY); if(v) cb(JSON.parse(v)); } catch(e){}
      window.addEventListener('storage', e => {
        if(e.key === KEY && e.newValue){ try { cb(JSON.parse(e.newValue)); } catch(_){} }
      });
    }
  };

  if(!hasSupa){
    return { mode:'local', connected:true, init(){}, pushState: local.push, onState: local.on };
  }

  // ---------- Supabase backend ----------
  // Lazy-load the client from CDN; queue pushes and subscribers until it's ready.
  // On any load/connect failure, fall back to localStorage transparently.
  let client = null, ready = false, failed = false;
  const pushQueue = [];      // states pushed before the client was ready
  const subscribers = [];    // onState callbacks
  const CDN = 'https://esm.sh/@supabase/supabase-js@2';

  // Dedupe by updated_at so the realtime push and the poll fallback below never
  // double-fire for the same state.
  let _lastStamp = null;
  function emit(data){
    if(!data) return;
    const stamp = data.updated_at || data._t || null;
    if(stamp && stamp === _lastStamp) return;
    _lastStamp = stamp;
    subscribers.forEach(cb => { try { cb(data); } catch(_){} });
  }

  async function connect(){
    try {
      const { createClient } = await import(CDN);
      client = createClient(SUPA.url, SUPA.anonKey, { auth:{ persistSession:false } });

      // initial snapshot
      const { data, error } = await client
        .from('race_state').select('data').eq('id', 1).single();
      if(!error && data && data.data) emit(data.data);

      // realtime updates
      // Realtime channel with auto-reconnect — over a 6h race the websocket can
      // drop (network blip, laptop sleep). On any non-OK status we rebuild the
      // channel after a short backoff. The 3s poll below keeps data flowing
      // regardless, so a dropped socket never blanks the board.
      let _reconnecting = false;
      function subscribeRealtime(){
        const ch = client.channel('race_state_live_' + Date.now())
          .on('postgres_changes',
              { event:'*', schema:'public', table:'race_state', filter:'id=eq.1' },
              payload => { const d = payload.new && payload.new.data; if(d) emit(d); })
          .subscribe(status => {
            if((status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') && !_reconnecting){
              _reconnecting = true;
              setTimeout(() => {
                _reconnecting = false;
                try { client.removeChannel(ch); } catch(_){}
                subscribeRealtime();
              }, 5000);
            }
          });
      }
      subscribeRealtime();

      // Safety-net poll: if realtime isn't enabled on the table (common), the board
      // still updates on its own without a page refresh. Dedupe (emit) skips the
      // overlap when realtime IS working. 3s ≈ live enough for a 6h race, tiny load.
      setInterval(async () => {
        try {
          const { data, error } = await client
            .from('race_state').select('data, updated_at').eq('id', 1).single();
          if(!error && data && data.data){
            const d = data.data;
            if(data.updated_at && !d.updated_at) d.updated_at = data.updated_at;
            emit(d);
          }
        } catch(_){}
      }, 3000);

      ready = true;
      // flush anything pushed before we connected (keep only the latest)
      if(pushQueue.length){ const last = pushQueue.pop(); pushQueue.length = 0; doPush(last); }
    } catch(err){
      console.warn('PitDB: Supabase unavailable, falling back to localStorage —', err && err.message);
      failed = true;
      // wire the local backend so queued + future calls still work
      pushQueue.forEach(local.push); pushQueue.length = 0;
      subscribers.forEach(local.on);
    }
  }

  async function doPush(obj){
    try {
      const { error } = await client.rpc('push_state', { p_passcode: SUPA.passcode, p_data: obj });
      if(error) console.warn('PitDB push rejected:', error.message);
    } catch(err){ console.warn('PitDB push failed:', err && err.message); }
  }

  const connecting = connect();

  return {
    mode: 'supabase',
    connected: true,
    init(){ return connecting; },
    pushState(obj){
      if(failed) return local.push(obj);
      if(!ready){ pushQueue.push(obj); return; }
      doPush(obj);
    },
    onState(cb){
      subscribers.push(cb);
      if(failed) local.on(cb);
    }
  };
})();
