-- GM 보관함: 자주 쓰는 NPC와 미리 준비한 장면(배경·분위기·특성·NPC·강요 메모)을 계정에 둔다.
-- 본인만 읽고 쓴다. 방 이벤트와는 상관없고, 꺼내 쓸 때 화면이 평소 명령(scene.start 등)으로 보낸다.
create table public.gm_library (
  user_id  uuid not null references auth.users(id) on delete cascade,
  kind     text not null check (kind in ('npc', 'scene')),
  key      text not null check (char_length(key) between 1 and 64),
  data     jsonb not null,
  saved_at timestamptz not null default now(),
  primary key (user_id, kind, key)
);

alter table public.gm_library enable row level security;
create policy gm_library_own on public.gm_library for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 익명으로 쓰던 브라우저에서 로그인하면 GM 보관함도 계정으로 옮긴다 (나머지는 그대로)
create or replace function public.merge_users(p_from uuid, p_to uuid) returns integer
language plpgsql security definer set search_path = public as
$$
declare
  f text := p_from::text;
  t text := p_to::text;
  m record;
  to_role text;
  n integer := 0;
begin
  if p_from = p_to then
    return 0;
  end if;
  for m in select room_id, role from room_members where user_id = p_from loop
    update events
       set actor_id = case when actor_id = f then t else actor_id end,
           owner_id = case when owner_id = f then t else owner_id end,
           payload  = replace(payload::text, f, t)::jsonb
     where room_id = m.room_id
       and (actor_id = f or owner_id = f or strpos(payload::text, f) > 0);
    update sealed_rolls
       set side = replace(side::text, f, t)::jsonb
     where room_id = m.room_id and strpos(side::text, f) > 0;

    select role into to_role from room_members where room_id = m.room_id and user_id = p_to;
    if to_role is null then
      update room_members set user_id = p_to where room_id = m.room_id and user_id = p_from;
    else
      -- 둘 다 들어가 있던 방: 계정 쪽 자리를 남기고, 익명 쪽이 GM이었으면 GM을 넘겨받는다
      delete from room_members where room_id = m.room_id and user_id = p_from;
      if m.role = 'gm' and to_role <> 'gm' then
        update room_members set role = 'gm' where room_id = m.room_id and user_id = p_to;
      end if;
    end if;
    n := n + 1;
  end loop;

  update rooms set created_by = p_to where created_by = p_from;
  update media_usage set user_id = p_to where user_id = p_from;
  insert into saved_characters (user_id, key, data, saved_at)
    select p_to, key, data, saved_at from saved_characters where user_id = p_from
    on conflict (user_id, key) do nothing;
  delete from saved_characters where user_id = p_from;
  insert into gm_library (user_id, kind, key, data, saved_at)
    select p_to, kind, key, data, saved_at from gm_library where user_id = p_from
    on conflict (user_id, kind, key) do nothing;
  delete from gm_library where user_id = p_from;
  return n;
end;
$$;

revoke execute on function public.merge_users(uuid, uuid) from public, anon, authenticated;
