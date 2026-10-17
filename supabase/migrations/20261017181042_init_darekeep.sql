-- Darekeep: dungeons, versions, runs, ratings, challenges.
-- New public tables are not exposed to the Data API automatically, so grants are explicit.

create schema if not exists private;
grant usage on schema private to anon, authenticated;

-- ---------- helpers ----------
create or replace function private.short_code(n int default 8)
returns text
language sql volatile
set search_path = ''
as $$
  select string_agg(substr('abcdefghjkmnpqrstuvwxyz23456789', (floor(random() * 31) + 1)::int, 1), '')
  from generate_series(1, n);
$$;

-- Gameplay objects of a layout, ignoring decorations, in a canonical order.
create or replace function private.gameplay_objects(l jsonb)
returns jsonb
language sql immutable
set search_path = ''
as $$
  select coalesce(jsonb_agg(o order by o::text), '[]'::jsonb)
  from jsonb_array_elements(l -> 'objects') o
  where o ->> 'k' not in ('torch', 'rubble', 'chest', 'moss');
$$;

revoke all on function private.short_code(int) from public;
revoke all on function private.gameplay_objects(jsonb) from public;
grant execute on function private.short_code(int) to anon, authenticated;
grant execute on function private.gameplay_objects(jsonb) to anon, authenticated;

-- ---------- profiles ----------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'Adventurer'
    check (char_length(display_name) between 2 and 20),
  is_guest boolean not null default true,
  cosmetics jsonb not null default '{}'::jsonb check (pg_column_size(cosmetics) < 2000),
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create policy "profiles are public" on public.profiles
  for select to anon, authenticated using (true);
create policy "users edit own profile" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

grant select on public.profiles to anon, authenticated;
grant update (display_name, cosmetics) on public.profiles to authenticated;

-- Keep a profile row in sync with auth.users (creation + guest → account upgrade).
create or replace function private.sync_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, is_guest, display_name)
  values (
    new.id,
    coalesce(new.is_anonymous, false),
    'Adventurer' || lpad(floor(random() * 10000)::int::text, 4, '0')
  )
  on conflict (id) do update set is_guest = excluded.is_guest;
  return new;
end;
$$;
revoke all on function private.sync_profile() from public, anon, authenticated;

create trigger on_auth_user_sync
  after insert or update of is_anonymous on auth.users
  for each row execute function private.sync_profile();

-- ---------- dungeons ----------
create table public.dungeons (
  id text primary key default private.short_code(8),
  owner_id uuid references public.profiles (id) on delete cascade,
  kind text not null default 'community'
    check (kind in ('community', 'curated', 'daily', 'tutorial')),
  title text not null check (char_length(title) between 3 and 32),
  description text not null default '' check (char_length(description) <= 140),
  theme smallint not null default 0 check (theme between 0 and 3),
  difficulty text check (difficulty in ('Easy', 'Medium', 'Hard', 'Expert')),
  sort_order int not null default 0,
  current_version_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index dungeons_owner_idx on public.dungeons (owner_id);
create index dungeons_kind_created_idx on public.dungeons (kind, created_at desc);

create table public.dungeon_versions (
  id text primary key default private.short_code(10),
  dungeon_id text not null references public.dungeons (id) on delete cascade,
  version int not null check (version > 0),
  layout jsonb not null check (pg_column_size(layout) < 20000),
  layout_hash text not null check (char_length(layout_hash) <= 16),
  creator_time_ms int check (creator_time_ms between 0 and 180000),
  creator_replay text check (char_length(creator_replay) <= 40000),
  created_at timestamptz not null default now(),
  unique (dungeon_id, version),
  unique (dungeon_id, id)
);

-- current version must belong to the same dungeon
alter table public.dungeons
  add constraint dungeons_current_version_fk
  foreign key (id, current_version_id)
  references public.dungeon_versions (dungeon_id, id)
  deferrable initially deferred;

alter table public.dungeons enable row level security;
alter table public.dungeon_versions enable row level security;

create policy "dungeons are public" on public.dungeons
  for select to anon, authenticated using (true);
create policy "owners create community dungeons" on public.dungeons
  for insert to authenticated
  with check ((select auth.uid()) = owner_id and kind = 'community');
create policy "only accounts publish" on public.dungeons
  as restrictive for insert to authenticated
  with check ((select (auth.jwt() ->> 'is_anonymous')::boolean) is false);
create policy "owners update dungeons" on public.dungeons
  for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id and kind = 'community');
create policy "owners delete dungeons" on public.dungeons
  for delete to authenticated
  using ((select auth.uid()) = owner_id);

create policy "versions are public" on public.dungeon_versions
  for select to anon, authenticated using (true);
create policy "owners add versions" on public.dungeon_versions
  for insert to authenticated
  with check (exists (
    select 1 from public.dungeons d
    where d.id = dungeon_id and d.owner_id = (select auth.uid())
  ));
create policy "only accounts add versions" on public.dungeon_versions
  as restrictive for insert to authenticated
  with check ((select (auth.jwt() ->> 'is_anonymous')::boolean) is false);
create policy "owners restyle versions" on public.dungeon_versions
  for update to authenticated
  using (exists (
    select 1 from public.dungeons d
    where d.id = dungeon_id and d.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.dungeons d
    where d.id = dungeon_id and d.owner_id = (select auth.uid())
  ));

grant select on public.dungeons, public.dungeon_versions to anon, authenticated;
grant insert on public.dungeons to authenticated;
grant update (title, description, theme, current_version_id, updated_at) on public.dungeons to authenticated;
grant delete on public.dungeons to authenticated;
grant insert on public.dungeon_versions to authenticated;
grant update (layout) on public.dungeon_versions to authenticated;

-- A published version's gameplay is frozen; only decorations/theme may change.
create or replace function private.freeze_version_gameplay()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.gameplay_objects(new.layout) is distinct from private.gameplay_objects(old.layout) then
    raise exception 'Gameplay changes require a new version';
  end if;
  return new;
end;
$$;
revoke all on function private.freeze_version_gameplay() from public;
grant execute on function private.freeze_version_gameplay() to authenticated;

create trigger freeze_version_gameplay
  before update on public.dungeon_versions
  for each row execute function private.freeze_version_gameplay();

-- ---------- runs ----------
create table public.runs (
  id bigint generated always as identity primary key,
  version_id text not null references public.dungeon_versions (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  success boolean not null,
  time_ms int not null check (time_ms between 0 and 180000),
  tokens smallint not null check (tokens between 0 and 3),
  damage smallint not null check (damage between 0 and 3),
  practice boolean not null default false,
  daily_date date,
  death_x real check (death_x between 0 and 16),
  death_y real check (death_y between 0 and 12),
  death_cause text check (char_length(death_cause) <= 16),
  replay text check (char_length(replay) <= 40000),
  created_at timestamptz not null default now()
);
create index runs_version_board_idx on public.runs (version_id, success, time_ms);
create index runs_user_idx on public.runs (user_id, version_id);
create index runs_daily_idx on public.runs (daily_date) where daily_date is not null;

alter table public.runs enable row level security;
create policy "runs are public" on public.runs
  for select to anon, authenticated using (true);
create policy "players record own runs" on public.runs
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and (daily_date is null or daily_date = (now() at time zone 'utc')::date)
  );
grant select on public.runs to anon, authenticated;
grant insert on public.runs to authenticated;

-- ---------- ratings & reports ----------
create table public.ratings (
  dungeon_id text not null references public.dungeons (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  rating text not null check (rating in ('fun', 'clever', 'frustrating')),
  created_at timestamptz not null default now(),
  primary key (dungeon_id, user_id)
);
create index ratings_user_idx on public.ratings (user_id);
alter table public.ratings enable row level security;
create policy "ratings are public" on public.ratings
  for select to anon, authenticated using (true);
create policy "players rate" on public.ratings
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "players change rating" on public.ratings
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
grant select on public.ratings to anon, authenticated;
grant insert, update (rating, created_at) on public.ratings to authenticated;

create table public.reports (
  id bigint generated always as identity primary key,
  dungeon_id text not null references public.dungeons (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  reason text not null check (reason in ('name', 'exploit', 'misleading', 'other')),
  note text not null default '' check (char_length(note) <= 200),
  created_at timestamptz not null default now()
);
create index reports_dungeon_idx on public.reports (dungeon_id);
create index reports_user_idx on public.reports (user_id);
alter table public.reports enable row level security;
create policy "players file reports" on public.reports
  for insert to authenticated with check ((select auth.uid()) = user_id);
grant insert on public.reports to authenticated;

-- ---------- challenges ----------
create table public.challenges (
  id text primary key default private.short_code(8),
  version_id text not null references public.dungeon_versions (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  goal text not null check (goal in ('escape', 'full')),
  target_ms int not null check (target_ms between 0 and 180000),
  run_id bigint not null references public.runs (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index challenges_version_idx on public.challenges (version_id);
create index challenges_user_idx on public.challenges (user_id);
create index challenges_run_idx on public.challenges (run_id);
alter table public.challenges enable row level security;
create policy "challenges are public" on public.challenges
  for select to anon, authenticated using (true);
create policy "challenge with your own eligible run" on public.challenges
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.runs r
      where r.id = run_id
        and r.user_id = (select auth.uid())
        and r.version_id = challenges.version_id
        and r.success and not r.practice
        and r.time_ms = target_ms
        and (goal = 'escape' or r.tokens = 3)
    )
  );
grant select on public.challenges to anon, authenticated;
grant insert on public.challenges to authenticated;

-- ---------- read APIs (security invoker: RLS applies) ----------

-- Best eligible time per account. Guests never appear on public boards.
create or replace function public.leaderboard(
  p_version text, p_board text default 'escape', p_daily date default null, p_limit int default 20
)
returns table (rank bigint, user_id uuid, display_name text, time_ms int, run_id bigint, created_at timestamptz)
language sql stable
security invoker
set search_path = ''
as $$
  with best as (
    select distinct on (r.user_id) r.user_id, r.time_ms, r.id, r.created_at
    from public.runs r
    join public.profiles p on p.id = r.user_id
    where r.version_id = p_version
      and r.success and not r.practice
      and (p_board = 'escape' or r.tokens = 3)
      and (p_daily is null or r.daily_date = p_daily)
      and not p.is_guest
    order by r.user_id, r.time_ms, r.created_at
  )
  select rank() over (order by b.time_ms), b.user_id, p.display_name, b.time_ms, b.id, b.created_at
  from best b
  join public.profiles p on p.id = b.user_id
  order by b.time_ms, b.created_at
  limit least(greatest(p_limit, 1), 100);
$$;

-- Where a given time would place (ties share a rank).
create or replace function public.leaderboard_rank(
  p_version text, p_board text, p_time int, p_daily date default null
)
returns int
language sql stable
security invoker
set search_path = ''
as $$
  select 1 + count(*)::int from (
    select r.user_id, min(r.time_ms) t
    from public.runs r
    join public.profiles p on p.id = r.user_id
    where r.version_id = p_version
      and r.success and not r.practice
      and (p_board = 'escape' or r.tokens = 3)
      and (p_daily is null or r.daily_date = p_daily)
      and not p.is_guest
      and r.user_id is distinct from (select auth.uid())
    group by r.user_id
  ) s
  where s.t < p_time;
$$;

-- Aggregate creator feedback + difficulty for a version. Creator's own runs are excluded.
create or replace function public.dungeon_stats(p_version text)
returns jsonb
language sql stable
security invoker
set search_path = ''
as $$
  with v as (
    select dv.id, dv.dungeon_id, d.owner_id, d.difficulty
    from public.dungeon_versions dv join public.dungeons d on d.id = dv.dungeon_id
    where dv.id = p_version
  ),
  rs as (
    select r.* from public.runs r, v
    where r.version_id = v.id and r.user_id is distinct from v.owner_id
  ),
  firsts as (
    select user_id, bool_or(success) ok from (
      select user_id, success, row_number() over (partition by user_id order by created_at) rn from rs
    ) x where rn <= 5 group by user_id
  ),
  agg as (
    select
      count(distinct user_id)::int players,
      count(distinct user_id) filter (where success)::int escapers,
      count(*)::int attempts,
      (percentile_cont(0.5) within group (order by time_ms) filter (where success))::int median_ms
    from rs
  ),
  diff as (select count(*)::int n, count(*) filter (where ok)::int ok_n from firsts)
  select jsonb_build_object(
    'players', agg.players,
    'escapers', agg.escapers,
    'attempts', agg.attempts,
    'median_ms', agg.median_ms,
    'difficulty', case
      when diff.n < 30 then coalesce((select difficulty from v), 'Unrated')
      when diff.ok_n::numeric / diff.n >= 0.75 then 'Easy'
      when diff.ok_n::numeric / diff.n >= 0.40 then 'Medium'
      when diff.ok_n::numeric / diff.n >= 0.15 then 'Hard'
      else 'Expert' end,
    'deaths', coalesce((
      select jsonb_agg(jsonb_build_array(death_x, death_y)) from (
        select death_x, death_y from rs
        where not success and death_x is not null
        order by created_at desc limit 300
      ) dd), '[]'::jsonb),
    'ratings', (
      select jsonb_build_object(
        'fun', count(*) filter (where rating = 'fun'),
        'clever', count(*) filter (where rating = 'clever'),
        'frustrating', count(*) filter (where rating = 'frustrating'))
      from public.ratings where dungeon_id = (select dungeon_id from v)),
    'fastest', (
      select jsonb_build_object('run_id', r.id, 'time_ms', r.time_ms, 'name', p.display_name)
      from public.runs r join public.profiles p on p.id = r.user_id
      where r.version_id = p_version and r.success and not r.practice and r.replay is not null
      order by r.time_ms, r.created_at limit 1)
  )
  from agg, diff;
$$;

-- Dungeon cards with stats for browsing.
create or replace function public.browse_dungeons(
  p_kind text default 'community', p_sort text default 'new', p_limit int default 30, p_owner uuid default null
)
returns table (
  id text, title text, description text, kind text, difficulty text, theme smallint, sort_order int,
  creator text, owner_id uuid, version_id text, version int, layout jsonb, created_at timestamptz, creator_time_ms int,
  players int, escapers int, median_ms int, fun int, clever int, frustrating int
)
language sql stable
security invoker
set search_path = ''
as $$
  select
    d.id, d.title, d.description, d.kind,
    case
      when coalesce(f.n, 0) < 30 then coalesce(d.difficulty, 'Unrated')
      when f.ok_n::numeric / f.n >= 0.75 then 'Easy'
      when f.ok_n::numeric / f.n >= 0.40 then 'Medium'
      when f.ok_n::numeric / f.n >= 0.15 then 'Hard'
      else 'Expert' end,
    d.theme, d.sort_order, coalesce(p.display_name, 'Darekeep'), d.owner_id,
    v.id, v.version, v.layout, d.created_at, v.creator_time_ms,
    coalesce(s.players, 0), coalesce(s.escapers, 0), s.median_ms,
    coalesce(rt.fun, 0), coalesce(rt.clever, 0), coalesce(rt.frustrating, 0)
  from public.dungeons d
  join public.dungeon_versions v on v.id = d.current_version_id
  left join public.profiles p on p.id = d.owner_id
  left join lateral (
    select count(distinct r.user_id)::int players,
           count(distinct r.user_id) filter (where r.success)::int escapers,
           (percentile_cont(0.5) within group (order by r.time_ms) filter (where r.success))::int median_ms
    from public.runs r
    where r.version_id = v.id and r.user_id is distinct from d.owner_id
  ) s on true
  left join lateral (
    select count(*)::int n, count(*) filter (where ok)::int ok_n from (
      select user_id, bool_or(success) ok from (
        select r.user_id, r.success, row_number() over (partition by r.user_id order by r.created_at) rn
        from public.runs r where r.version_id = v.id and r.user_id is distinct from d.owner_id
      ) x where rn <= 5 group by user_id
    ) y
  ) f on true
  left join lateral (
    select count(*) filter (where rating = 'fun')::int fun,
           count(*) filter (where rating = 'clever')::int clever,
           count(*) filter (where rating = 'frustrating')::int frustrating
    from public.ratings where dungeon_id = d.id
  ) rt on true
  where (p_owner is null and d.kind = p_kind) or (p_owner is not null and d.owner_id = p_owner)
  order by
    case when p_sort = 'curated' then d.sort_order end asc,
    case when p_sort = 'popular' then s.players end desc nulls last,
    case when p_sort = 'top' then rt.fun + rt.clever - rt.frustrating end desc nulls last,
    d.created_at desc
  limit least(greatest(p_limit, 1), 60);
$$;

-- Personal records per version for the signed-in player.
create or replace function public.my_records()
returns table (
  version_id text, attempts int, best_ms int, best_full_ms int,
  escaped boolean, treasure boolean, flawless boolean
)
language sql stable
security invoker
set search_path = ''
as $$
  select r.version_id, count(*)::int,
    min(r.time_ms) filter (where r.success and not r.practice),
    min(r.time_ms) filter (where r.success and not r.practice and r.tokens = 3),
    bool_or(r.success), bool_or(r.success and r.tokens = 3), bool_or(r.success and r.damage = 0)
  from public.runs r
  where r.user_id = (select auth.uid())
  group by r.version_id;
$$;

-- Explorer XP (by dungeon identity, so new versions don't re-award) + creator milestones.
create or replace function public.my_progress()
returns jsonb
language sql stable
security invoker
set search_path = ''
as $$
  with mine as (
    select dv.dungeon_id,
      bool_or(r.success) esc,
      bool_or(r.success and r.tokens = 3) tre,
      bool_or(r.success and r.damage = 0) fla
    from public.runs r join public.dungeon_versions dv on dv.id = r.version_id
    where r.user_id = (select auth.uid())
    group by dv.dungeon_id
  ),
  dailies as (
    select count(distinct daily_date)::int n from public.runs
    where user_id = (select auth.uid()) and success and daily_date is not null
  ),
  created as (
    select count(distinct r.user_id) filter (where r.success)::int completions,
           count(distinct r.user_id)::int players
    from public.runs r
    join public.dungeon_versions dv on dv.id = r.version_id
    join public.dungeons d on d.id = dv.dungeon_id
    where d.owner_id = (select auth.uid()) and r.user_id <> (select auth.uid())
  ),
  liked as (
    select count(*)::int n from public.ratings ra join public.dungeons d on d.id = ra.dungeon_id
    where d.owner_id = (select auth.uid()) and ra.rating in ('fun', 'clever') and ra.user_id <> (select auth.uid())
  )
  select jsonb_build_object(
    'xp', 20 * count(*) filter (where esc) + 10 * count(*) filter (where tre)
        + 10 * count(*) filter (where fla) + 20 * (select n from dailies),
    'escapes', count(*) filter (where esc),
    'treasures', count(*) filter (where tre),
    'flawless', count(*) filter (where fla),
    'dailies', (select n from dailies),
    'creator_players', (select players from created),
    'creator_completions', (select completions from created),
    'creator_likes', (select n from liked)
  )
  from mine;
$$;

-- Best times for a set of players (friends you've exchanged challenges with).
create or replace function public.player_bests(p_version text, p_users uuid[])
returns table (user_id uuid, display_name text, best_ms int, best_full_ms int)
language sql stable
security invoker
set search_path = ''
as $$
  select r.user_id, p.display_name,
    min(r.time_ms) filter (where r.success and not r.practice),
    min(r.time_ms) filter (where r.success and not r.practice and r.tokens = 3)
  from public.runs r join public.profiles p on p.id = r.user_id
  where r.version_id = p_version and r.user_id = any (p_users[1:50])
  group by r.user_id, p.display_name;
$$;

-- Publish a new dungeon or a new version. Cosmetic-only edits keep the current version (and its records).
create or replace function public.publish_dungeon(
  p_dungeon_id text, p_title text, p_description text, p_layout jsonb,
  p_hash text, p_time_ms int, p_replay text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_dungeon public.dungeons;
  v_current public.dungeon_versions;
  v_version int;
  v_new_id text;
  v_theme smallint := least(greatest(coalesce((p_layout ->> 'theme')::smallint, 0), 0), 3);
begin
  if p_dungeon_id is null then
    insert into public.dungeons (owner_id, title, description, theme)
    values ((select auth.uid()), p_title, coalesce(p_description, ''), v_theme)
    returning * into v_dungeon;
  else
    select * into v_dungeon from public.dungeons
    where id = p_dungeon_id and owner_id = (select auth.uid());
    if not found then
      raise exception 'Dungeon not found';
    end if;
    update public.dungeons
      set title = p_title, description = coalesce(p_description, ''), theme = v_theme, updated_at = now()
      where id = v_dungeon.id;
    select * into v_current from public.dungeon_versions where id = v_dungeon.current_version_id;
  end if;

  if v_current.id is not null
     and private.gameplay_objects(v_current.layout) = private.gameplay_objects(p_layout) then
    update public.dungeon_versions set layout = p_layout where id = v_current.id;
    return jsonb_build_object('dungeon_id', v_dungeon.id, 'version_id', v_current.id,
                              'version', v_current.version, 'new_version', false);
  end if;

  if p_time_ms is null or p_replay is null then
    raise exception 'Complete your dungeon before publishing';
  end if;

  select coalesce(max(version), 0) + 1 into v_version
  from public.dungeon_versions where dungeon_id = v_dungeon.id;

  insert into public.dungeon_versions (dungeon_id, version, layout, layout_hash, creator_time_ms, creator_replay)
  values (v_dungeon.id, v_version, p_layout, p_hash, p_time_ms, p_replay)
  returning id into v_new_id;

  update public.dungeons set current_version_id = v_new_id where id = v_dungeon.id;

  return jsonb_build_object('dungeon_id', v_dungeon.id, 'version_id', v_new_id,
                            'version', v_version, 'new_version', true);
end;
$$;

revoke all on function public.leaderboard(text, text, date, int) from public;
revoke all on function public.leaderboard_rank(text, text, int, date) from public;
revoke all on function public.dungeon_stats(text) from public;
revoke all on function public.browse_dungeons(text, text, int, uuid) from public;
revoke all on function public.my_records() from public;
revoke all on function public.my_progress() from public;
revoke all on function public.player_bests(text, uuid[]) from public;
revoke all on function public.publish_dungeon(text, text, text, jsonb, text, int, text) from public;

grant execute on function public.leaderboard(text, text, date, int) to anon, authenticated;
grant execute on function public.leaderboard_rank(text, text, int, date) to anon, authenticated;
grant execute on function public.dungeon_stats(text) to anon, authenticated;
grant execute on function public.browse_dungeons(text, text, int, uuid) to anon, authenticated;
grant execute on function public.player_bests(text, uuid[]) to anon, authenticated;
grant execute on function public.my_records() to authenticated;
grant execute on function public.my_progress() to authenticated;
grant execute on function public.publish_dungeon(text, text, text, jsonb, text, int, text) to authenticated;
