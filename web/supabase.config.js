// Public Supabase config for HOSTED builds.
//
// This file is intentionally empty in git. At deploy time the host writes the
// real values here from environment variables (scripts/build-config.sh reads
// SUPA_URL / SUPA_ANON). The anon key is public by design; the write passcode is
// NOT included, so a hosted page can read/display the race but not feed it.
//
// Local dev ignores this and uses web/supabase.local.js (gitignored) instead,
// which also carries the passcode so the local sim feeder can write.
