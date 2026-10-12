-- Early Bird — initial schema
-- All times are timestamptz (UTC). The UI renders Asia/Kolkata.

create extension if not exists pgcrypto;

-- ───────────────────────────── private config ─────────────────────────────
-- The server talks to PostgREST with either the service-role key (bypasses RLS)
-- or the publishable key + an `x-app-secret` header that must match this row.
create schema if not exists private;
revoke all on schema private from anon, authenticated;

create table if not exists private.app_config (
  id int primary key default 1 check (id = 1),
  secret text not null
);

create or replace function public.app_ok()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (current_setting('request.headers', true)::json ->> 'x-app-secret')
      = (select secret from private.app_config where id = 1),
    false
  );
$$;
revoke all on function public.app_ok() from public;
grant execute on function public.app_ok() to anon, authenticated, service_role;

-- ───────────────────────────── artists ─────────────────────────────
create table public.artists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  aliases text[] not null default '{}',
  tier text not null default 'normal' check (tier in ('priority', 'normal')),
  origin text not null default 'india' check (origin in ('india', 'international')),
  image_url text,
  source text not null default 'seed' check (source in ('seed', 'manual', 'csv', 'spotify')),
  is_active boolean not null default true,
  last_checked_at timestamptz,
  created_at timestamptz not null default now()
);

-- ───────────────────────────── events ─────────────────────────────
create table public.events (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,                -- artist_slug|city_slug|yyyy-mm-dd
  artist_id uuid not null references public.artists(id) on delete cascade,
  title text,
  venue text,
  city text not null,
  city_slug text not null,
  starts_on date not null,
  starts_at timestamptz,
  ticket_url text,
  price_min_inr integer,
  early_bird_status text not null default 'unknown'
    check (early_bird_status in ('available', 'upcoming', 'sold_out', 'none', 'unknown')),
  early_bird_deadline timestamptz,
  scarcity_signals text[] not null default '{}',
  is_bengaluru boolean generated always as (city_slug = 'bengaluru') stored,
  confidence real not null default 0.5,
  needs_review boolean not null default false,
  status text not null default 'active' check (status in ('active', 'cancelled')),
  decision text not null default 'undecided' check (decision in ('undecided', 'going', 'maybe', 'skip')),
  decided_at timestamptz,
  calendar_links jsonb not null default '{}',
  best_source text,
  first_seen_at timestamptz not null default now(),
  first_seen_run_id uuid,
  last_seen_at timestamptz not null default now(),
  last_changed_at timestamptz not null default now()
);
create index events_feed_idx on public.events (is_bengaluru desc, starts_on asc);
create index events_artist_idx on public.events (artist_id);
create index events_first_seen_idx on public.events (first_seen_at desc);

create table public.event_sources (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  source text not null,
  url text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (event_id, source, url)
);
create index event_sources_event_idx on public.event_sources (event_id);

create table public.event_changes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  field text not null,
  old_value jsonb,
  new_value jsonb,
  run_id uuid,
  created_at timestamptz not null default now()
);
create index event_changes_event_idx on public.event_changes (event_id, created_at desc);

-- ───────────────────────────── scans ─────────────────────────────
create table public.scan_runs (
  id uuid primary key default gen_random_uuid(),
  trigger text not null check (trigger in ('cron', 'manual', 'seed')),
  status text not null default 'running' check (status in ('running', 'completed', 'partial', 'failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  heartbeat_at timestamptz not null default now(),
  jobs_total int not null default 0,
  jobs_done int not null default 0,
  jobs_failed int not null default 0,
  events_new int not null default 0,
  events_changed int not null default 0,
  credits_used int not null default 0,
  notes text[] not null default '{}',
  error text
);
create unique index one_running_scan on public.scan_runs ((true)) where status = 'running';
create index scan_runs_started_idx on public.scan_runs (started_at desc);

create table public.scan_jobs (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.scan_runs(id) on delete cascade,
  kind text not null check (kind in ('ticketmaster', 'bandsintown', 'listing', 'search', 'page')),
  label text not null,
  payload jsonb not null default '{}',
  priority int not null default 5,
  status text not null default 'pending' check (status in ('pending', 'running', 'done', 'failed', 'skipped')),
  attempts int not null default 0,
  credits int not null default 0,
  found int not null default 0,
  error text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
create index scan_jobs_claim_idx on public.scan_jobs (run_id, status, priority, created_at);

create table public.source_health (
  source text primary key,
  last_ok_at timestamptz,
  last_error_at timestamptz,
  last_error text,
  consecutive_failures int not null default 0,
  requests_today int not null default 0,
  credits_today int not null default 0,
  day date not null default (now() at time zone 'Asia/Kolkata')::date
);

create table public.fetched_pages (
  url_hash text primary key,
  url text not null,
  content_hash text,
  http_status int,
  strategy text,
  fetched_at timestamptz not null default now(),
  extracted_count int not null default 0
);

-- ───────────────────────────── alerts ─────────────────────────────
create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  kind text not null check (kind in ('new', 'early_bird_open', 'deadline_soon', 'changed')),
  dedupe_key text not null unique,
  summary text not null,
  urgent boolean not null default false,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'in_app')),
  channel text,
  attempts int not null default 0,
  provider_message_id text,
  error text,
  run_id uuid,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index alerts_created_idx on public.alerts (created_at desc);
create index alerts_status_idx on public.alerts (status);

-- ───────────────────────────── settings (singleton) ─────────────────────────────
create table public.settings (
  id int primary key default 1 check (id = 1),
  alert_email text,
  home_city text not null default 'bengaluru',
  google_email text,
  google_refresh_token_enc text,
  google_connected_at timestamptz,
  daily_credit_cap int not null default 300,
  updated_at timestamptz not null default now()
);
insert into public.settings (id) values (1) on conflict do nothing;

-- ───────────────────────────── RPCs ─────────────────────────────
-- Start a scan or resume the one already running. Stale runs (no heartbeat for
-- 10 minutes) are closed as partial so a crashed function never blocks scans.
create or replace function public.start_scan(p_trigger text)
returns public.scan_runs
language plpgsql
as $$
declare r public.scan_runs;
begin
  update public.scan_runs
     set status = 'partial', finished_at = now(),
         notes = array_append(notes, 'closed: no heartbeat for 10 minutes')
   where status = 'running' and heartbeat_at < now() - interval '10 minutes';

  select * into r from public.scan_runs where status = 'running' limit 1;
  if found then
    return r;
  end if;

  begin
    insert into public.scan_runs (trigger) values (p_trigger) returning * into r;
  exception when unique_violation then
    select * into r from public.scan_runs where status = 'running' limit 1;
  end;
  return r;
end;
$$;

-- Claim up to p_limit jobs atomically; jobs stuck in running for 3 minutes are reclaimed.
create or replace function public.claim_jobs(p_run uuid, p_limit int)
returns setof public.scan_jobs
language sql
as $$
  update public.scan_jobs j
     set status = 'running', attempts = j.attempts + 1, started_at = now()
   where j.id in (
     select id from public.scan_jobs
      where run_id = p_run
        and (status = 'pending'
             or (status = 'running' and started_at < now() - interval '3 minutes' and attempts < 3))
      order by priority asc, created_at asc
      limit p_limit
      for update skip locked
   )
  returning j.*;
$$;

-- Bump today's request/credit counters for a source (resets at IST midnight).
create or replace function public.record_source(p_source text, p_ok boolean, p_credits int, p_error text)
returns void
language plpgsql
as $$
declare today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  insert into public.source_health (source, day) values (p_source, today)
  on conflict (source) do nothing;

  update public.source_health
     set requests_today = case when day = today then requests_today + 1 else 1 end,
         credits_today  = case when day = today then credits_today + coalesce(p_credits, 0) else coalesce(p_credits, 0) end,
         day = today,
         last_ok_at = case when p_ok then now() else last_ok_at end,
         last_error_at = case when p_ok then last_error_at else now() end,
         last_error = case when p_ok then last_error else left(p_error, 500) end,
         consecutive_failures = case when p_ok then 0 else consecutive_failures + 1 end
   where source = p_source;
end;
$$;

create or replace function public.credits_used_today()
returns int
language sql
stable
as $$
  select coalesce(sum(credits_today), 0)::int
    from public.source_health
   where day = (now() at time zone 'Asia/Kolkata')::date;
$$;

-- ───────────────────────────── RLS ─────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['artists','events','event_sources','event_changes','scan_runs',
                           'scan_jobs','source_health','fetched_pages','alerts','settings']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update, delete on public.%I to anon, authenticated', t);
    execute format(
      'create policy app_access on public.%I for all to anon, authenticated using (public.app_ok()) with check (public.app_ok())',
      t);
  end loop;
end $$;

grant execute on function public.start_scan(text) to anon, authenticated;
grant execute on function public.claim_jobs(uuid, int) to anon, authenticated;
grant execute on function public.record_source(text, boolean, int, text) to anon, authenticated;
grant execute on function public.credits_used_today() to anon, authenticated;
