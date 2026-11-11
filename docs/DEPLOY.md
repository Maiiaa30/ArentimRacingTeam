# Deploy — Pit Wall under your domain

The site is static (everything in `web/`). Any static host works. Configs for the two
easiest are in the repo root: `netlify.toml` and `vercel.json`.

## Option A — Netlify (easiest, free, password option)

1. Push the repo to GitHub (done).
2. Netlify → Add new site → Import from GitHub → pick `ArentimRacingTeam`.
3. Publish directory is `web/` (already set by `netlify.toml`). Deploy.
4. Point your domain: Netlify → Domain settings → add your custom domain.
5. (Recommended) Site settings → Access control → set a **site password** — real
   access control, unlike the soft in-app gate.

## Option B — Vercel

1. Vercel → Add New → Project → import the repo.
2. Framework preset: Other. Output dir `web/` (set by `vercel.json`). Deploy.
3. Add your domain under Project → Domains.
4. Password protection is a Pro feature; otherwise rely on the in-app gate + Supabase passcode.

## Option C — Cloudflare Pages ⭐ (recommended — domain already on Cloudflare)

Free, unlimited bandwidth, and your subdomain is one click (no DNS records to copy).

1. **Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git** →
   pick `Maiiaa30/ArentimRacingTeam`.
2. Build settings:
   - Framework preset: **None**
   - Build command: `bash scripts/build-config.sh`
   - Build output directory: `web`
3. **Environment variables** (Settings → Variables) — this injects the keys at build,
   so nothing secret is in the public repo:
   - `SUPA_URL` = `https://cuinegzqahegrxaodosa.supabase.co`
   - `SUPA_ANON` = your anon public key
   (The build script writes `web/supabase.config.js` from these. The write passcode is
   NOT set on the host, so the public site displays the race but can't feed it — only
   your bridge, which has the passcode, writes.)
4. **Save and Deploy.** You get a `*.pages.dev` URL — test it.
5. **Custom subdomain:** Pages project → Custom domains → Set up a domain →
   enter e.g. `pitwall.yourdomain.com`. Since the domain is on Cloudflare, DNS + SSL
   are added automatically. Done.
6. **(Optional) Real access control:** Cloudflare → Zero Trust → Access → add an
   application for the subdomain (free tier). Gate it by email/PIN so only your team
   opens it — stronger than the in-app soft gate.

After deploy, the hosted pit wall is read-only display (syncs from Supabase). Feed it
from your game PC with the bridge (`start-bridge.bat`), which holds the write passcode.

## Option D — your own box

`web/` behind any web server (nginx/caddy). Example caddy:

```
race.yourdomain.com {
    root * /path/to/ArentimRacingTeam/web
    file_server
    basicauth { friend JDJhJDE0... }   # optional real auth
}
```

## After deploy

- Cross-device sync needs Supabase: run `db/schema.sql`, create `web/supabase.local.js`
  from the example (see main README). Without it the dashboard is single-browser.
- Set real race values + driver names in the dashboard **⚙ Setup** panel.
- The telemetry bridge (`bridge/`) runs on each driver's game PC, not the host.
