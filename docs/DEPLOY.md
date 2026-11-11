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

## Option C — Cloudflare Pages

1. Pages → Create → connect the repo. Build command: none. Output dir: `web`.
2. Add your domain. **Cloudflare Access** gives real auth (Zero Trust, free tier).

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
