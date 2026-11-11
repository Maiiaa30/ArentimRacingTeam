-- Arentim Racing Team — Pit Wall · Supabase schema
-- Run once in the Supabase SQL editor (Dashboard → SQL → New query → Run).
--
-- Design: live race state lives in ONE jsonb row (id = 1). The dashboard reads it
-- and subscribes to realtime changes; the sim feeder / telemetry bridge writes it.
--
-- Security model (anon key is PUBLIC — it ships in the page):
--   * anyone with the anon key may READ the live state (fine — it's your own race page)
--   * nobody may write the row directly
--   * writes go through push_state(passcode, data), which checks a shared passcode
--     stored in race_secret. race_secret is NOT readable by anon, so the passcode
--     never leaves the server. Only people who know the passcode can feed the board.
--
-- To change the passcode later: UPDATE race_secret SET passcode = 'newword' WHERE id = 1;

-- ---------- live state (single row) ----------
create table if not exists public.race_state (
  id         int primary key default 1,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint race_state_singleton check (id = 1)
);
insert into public.race_state (id, data) values (1, '{}'::jsonb)
  on conflict (id) do nothing;

-- ---------- shared write passcode (server-side only) ----------
create table if not exists public.race_secret (
  id       int primary key default 1,
  passcode text not null,
  constraint race_secret_singleton check (id = 1)
);
-- CHANGE THIS before going live:
insert into public.race_secret (id, passcode) values (1, 'change-me-in-sql')
  on conflict (id) do nothing;

-- ---------- RLS ----------
alter table public.race_state  enable row level security;
alter table public.race_secret enable row level security;

-- anon may read the live state; no direct writes, no policy on race_secret at all
drop policy if exists race_state_read on public.race_state;
create policy race_state_read on public.race_state
  for select using (true);
-- (race_secret has RLS on and zero policies → anon can neither read nor write it)

-- ---------- gated write ----------
-- SECURITY DEFINER runs as the table owner, bypassing RLS, but only after the
-- passcode check passes. anon gets EXECUTE on this and nothing else.
create or replace function public.push_state(p_passcode text, p_data jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_passcode is null
     or p_passcode <> (select passcode from public.race_secret where id = 1) then
    raise exception 'bad passcode';
  end if;
  update public.race_state
     set data = p_data, updated_at = now()
   where id = 1;
end;
$$;

revoke all on function public.push_state(text, jsonb) from public;
grant execute on function public.push_state(text, jsonb) to anon, authenticated;

-- ---------- realtime ----------
-- Dashboard subscribes to changes on this table.
alter publication supabase_realtime add table public.race_state;

-- ============================================================================
-- Richer tables (optional, later) — the full data model from docs/PLAN.md.
-- Not required for live sync; add when you want persisted config / history.
-- ============================================================================
-- race_config     — one row of race parameters (duration, fuel, tyres, drivers)
-- plan_stints     — generated stint plan rows
-- lap_log         — one row per completed lap (the dashboard already exports CSV)
-- events          — operator events (rain / forced pit / pace change)
-- weather_timeline— [{start_s, condition, wetness}]
-- Create these the same way (jsonb or typed columns) when needed.
