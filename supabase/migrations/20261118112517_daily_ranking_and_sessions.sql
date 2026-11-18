-- Daily stage ranking: one row per player per JST day, best verified score.
create table public.daily_scores (
  day date not null,
  player_id uuid not null,
  name text not null check (char_length(name) between 1 and 12),
  score int not null check (score between 0 and 100000),
  perfects int not null default 0,
  max_combo int not null default 0,
  max_idx int not null default 0,
  skin text not null default 'shiro' check (char_length(skin) <= 16),
  replay jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (day, player_id)
);
create index daily_scores_rank on public.daily_scores (day, score desc, updated_at);
alter table public.daily_scores enable row level security;

-- Anonymous play analytics: one row per browser session.
create table public.sessions (
  id uuid primary key,
  player_id uuid not null,
  started_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  first_visit boolean not null default false,
  source text not null default 'direct',
  lang text not null default '',
  mobile boolean not null default true,
  plays int not null default 0,
  daily_plays int not null default 0,
  best int not null default 0,
  first_score int,
  total_score bigint not null default 0,
  shares int not null default 0,
  gacha int not null default 0,
  seconds int not null default 0
);
create index sessions_started on public.sessions (started_at);
create index sessions_player on public.sessions (player_id);
alter table public.sessions enable row level security;

-- Tables have no policies: clients only go through the functions below.

create or replace function public.daily_top(p_day date, p_limit int default 50)
returns table (rank bigint, name text, score int, skin text)
language sql stable security definer set search_path = public as $$
  select rank() over (order by s.score desc), s.name, s.score, s.skin
  from public.daily_scores s
  where s.day = p_day
  order by s.score desc, s.updated_at
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;

create or replace function public.daily_me(p_day date, p_player uuid)
returns table (rank bigint, total bigint, score int)
language sql stable security definer set search_path = public as $$
  select
    (select count(*) + 1 from public.daily_scores o where o.day = p_day and o.score > m.score),
    (select count(*) from public.daily_scores o where o.day = p_day),
    m.score
  from public.daily_scores m
  where m.day = p_day and m.player_id = p_player;
$$;

-- Called only by the submit-score edge function after it re-ran the replay.
create or replace function public.submit_daily(
  p_day date, p_player uuid, p_name text, p_score int, p_perfects int,
  p_combo int, p_idx int, p_skin text, p_replay jsonb
)
returns table (rank bigint, total bigint, best int, improved boolean)
language plpgsql security definer set search_path = public as $$
declare
  prev int;
begin
  select d.score into prev from public.daily_scores d where d.day = p_day and d.player_id = p_player;
  insert into public.daily_scores as d (day, player_id, name, score, perfects, max_combo, max_idx, skin, replay)
  values (p_day, p_player, p_name, p_score, p_perfects, p_combo, p_idx, p_skin, p_replay)
  on conflict (day, player_id) do update set
    name = excluded.name,
    skin = excluded.skin,
    score = greatest(d.score, excluded.score),
    perfects = case when excluded.score > d.score then excluded.perfects else d.perfects end,
    max_combo = case when excluded.score > d.score then excluded.max_combo else d.max_combo end,
    max_idx = case when excluded.score > d.score then excluded.max_idx else d.max_idx end,
    replay = case when excluded.score > d.score then excluded.replay else d.replay end,
    updated_at = case when excluded.score > d.score then now() else d.updated_at end;
  return query
    select m.rank, m.total, m.score, (prev is null or p_score > prev)
    from public.daily_me(p_day, p_player) m;
end;
$$;

create or replace function public.track_session(p jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare
  c_plays int := least(greatest(coalesce((p->>'plays')::int, 0), 0), 100000);
  c_daily int := least(greatest(coalesce((p->>'daily_plays')::int, 0), 0), 100000);
  c_best int := least(greatest(coalesce((p->>'best')::int, 0), 0), 100000);
  c_first int := least(greatest((p->>'first_score')::int, 0), 100000);
  c_total bigint := least(greatest(coalesce((p->>'total_score')::bigint, 0), 0), 100000000);
  c_shares int := least(greatest(coalesce((p->>'shares')::int, 0), 0), 10000);
  c_gacha int := least(greatest(coalesce((p->>'gacha')::int, 0), 0), 10000);
  c_secs int := least(greatest(coalesce((p->>'seconds')::int, 0), 0), 86400);
begin
  insert into public.sessions as s (id, player_id, first_visit, source, lang, mobile, plays, daily_plays, best, first_score, total_score, shares, gacha, seconds)
  values (
    (p->>'id')::uuid, (p->>'player_id')::uuid,
    coalesce((p->>'first_visit')::boolean, false),
    left(coalesce(p->>'source', 'direct'), 16),
    left(coalesce(p->>'lang', ''), 12),
    coalesce((p->>'mobile')::boolean, true),
    c_plays, c_daily, c_best, c_first, c_total, c_shares, c_gacha, c_secs
  )
  on conflict (id) do update set
    last_at = now(),
    plays = greatest(s.plays, excluded.plays),
    daily_plays = greatest(s.daily_plays, excluded.daily_plays),
    best = greatest(s.best, excluded.best),
    first_score = coalesce(s.first_score, excluded.first_score),
    total_score = greatest(s.total_score, excluded.total_score),
    shares = greatest(s.shares, excluded.shares),
    gacha = greatest(s.gacha, excluded.gacha),
    seconds = greatest(s.seconds, excluded.seconds)
  where s.player_id = excluded.player_id;
end;
$$;

revoke all on function public.daily_top(date, int) from public;
revoke all on function public.daily_me(date, uuid) from public;
revoke all on function public.submit_daily(date, uuid, text, int, int, int, int, text, jsonb) from public;
revoke all on function public.track_session(jsonb) from public;
grant execute on function public.daily_top(date, int) to anon, authenticated, service_role;
grant execute on function public.daily_me(date, uuid) to anon, authenticated, service_role;
grant execute on function public.track_session(jsonb) to anon, authenticated, service_role;
grant execute on function public.submit_daily(date, uuid, text, int, int, int, int, text, jsonb) to service_role;
