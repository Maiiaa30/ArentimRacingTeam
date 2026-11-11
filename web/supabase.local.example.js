// Supabase config — ENABLE CROSS-DEVICE SYNC
//
// 1. Copy this file to  web/supabase.local.js  (that name is gitignored — never commit keys)
// 2. Fill in your project values (Supabase Dashboard → Project Settings → API)
// 3. Run db/schema.sql once in the Supabase SQL editor, and set your passcode there:
//      update race_secret set passcode = 'your-shared-word' where id = 1;
// 4. supabase.local.js is already loaded before js/supabase.js in index.html and sim.html
//
// Without this file the dashboard uses localStorage (single-browser) — still fully usable.

window.SUPA = {
  url:     'https://YOUR-PROJECT.supabase.co',
  anonKey: 'YOUR-ANON-PUBLIC-KEY',   // the "anon public" key — safe to ship in the page
  passcode:'your-shared-word'        // must match race_secret.passcode in the DB; gates writes
};
