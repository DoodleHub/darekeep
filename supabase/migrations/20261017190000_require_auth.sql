-- Darekeep is sign-in only: nothing is readable or callable without an authenticated session.

alter policy "profiles are public" on public.profiles to authenticated;
alter policy "dungeons are public" on public.dungeons to authenticated;
alter policy "versions are public" on public.dungeon_versions to authenticated;
alter policy "runs are public" on public.runs to authenticated;
alter policy "ratings are public" on public.ratings to authenticated;
alter policy "challenges are public" on public.challenges to authenticated;

revoke select on public.profiles, public.dungeons, public.dungeon_versions,
  public.runs, public.ratings, public.challenges from anon;

revoke execute on function public.leaderboard(text, text, date, int) from anon;
revoke execute on function public.leaderboard_rank(text, text, int, date) from anon;
revoke execute on function public.dungeon_stats(text) from anon;
revoke execute on function public.browse_dungeons(text, text, int, uuid) from anon;
revoke execute on function public.player_bests(text, uuid[]) from anon;

revoke execute on function private.short_code(int) from anon;
revoke execute on function private.gameplay_objects(jsonb) from anon;
revoke usage on schema private from anon;
