-- Evaluate auth.jwt() once per statement instead of per row, and cover the composite FK.
drop policy "only accounts publish" on public.dungeons;
create policy "only accounts publish" on public.dungeons
  as restrictive for insert to authenticated
  with check ((((select auth.jwt()) ->> 'is_anonymous')::boolean) is false);

drop policy "only accounts add versions" on public.dungeon_versions;
create policy "only accounts add versions" on public.dungeon_versions
  as restrictive for insert to authenticated
  with check ((((select auth.jwt()) ->> 'is_anonymous')::boolean) is false);

create index dungeons_current_version_idx on public.dungeons (id, current_version_id);
