#!/usr/bin/env bash
# Deploy-time config injection. Set SUPA_URL and SUPA_ANON as build env vars in
# your host (Cloudflare Pages / Netlify / Vercel). Writes web/supabase.config.js
# with the PUBLIC values only (no write passcode). No-op if env vars are absent.
set -e
OUT="web/supabase.config.js"
if [ -n "$SUPA_URL" ] && [ -n "$SUPA_ANON" ]; then
  printf '// generated at build time\nwindow.SUPA={url:"%s",anonKey:"%s",passcode:""};\n' "$SUPA_URL" "$SUPA_ANON" > "$OUT"
  echo "build-config: wrote $OUT from env"
else
  echo "build-config: SUPA_URL/SUPA_ANON not set; leaving $OUT empty (static-only)"
fi
