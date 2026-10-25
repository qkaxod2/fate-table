-- 계정: 캐릭터 보관함과, 익명으로 쓰던 기록을 로그인한 계정으로 옮기는 함수.
-- 익명 사용자가 이메일·구글을 연결하면 user id가 그대로라 옮길 것이 없다.
-- 옮기기는 이미 계정이 있는 사람이 익명으로 놀던 브라우저에서 로그인할 때만 쓴다.

-- 캐릭터 만들기에서 저장한 캐릭터. 본인만 읽고 쓴다.
create table public.saved_characters (
  user_id  uuid not null references auth.users(id) on delete cascade,
  key      text not null check (char_length(key) between 1 and 64),
  data     jsonb not null,
  saved_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table public.saved_characters enable row level security;
create policy saved_characters_own on public.saved_characters for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

/**
 * p_from(익명)의 방·캐릭터·사용량을 p_to로 옮긴다. 옮긴 방 수를 돌려준다.
 * 이벤트에 적힌 사용자 id(행동한 사람, 캐릭터 주인, 비공개 이벤트 주인)도 바꿔서
 * 옮긴 뒤에도 자기 캐릭터로 굴릴 수 있게 한다. uuid는 겹치지 않으니 글자 그대로 바꿔도 안전하다.
 */
create function public.merge_users(p_from uuid, p_to uuid) returns integer
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
  return n;
end;
$$;

revoke execute on function public.merge_users(uuid, uuid) from public, anon, authenticated;
