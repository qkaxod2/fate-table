-- 상태와 상관없는 명령(채팅·서술·메모·효과음)은 head를 맞춰 보지 않고 맨 끝에 붙인다.
-- p_expected가 null이면 STALE 검사를 건너뛴다. 나머지는 그대로.
create or replace function public.append_events(
  p_room uuid,
  p_expected bigint,
  p_events jsonb,
  p_client_cmd uuid default null
) returns bigint
language plpgsql security definer set search_path = public as
$$
declare
  head bigint;
  start_seq bigint;
  e jsonb;
begin
  select head_seq into head from rooms where id = p_room for update;
  if head is null then
    raise exception 'NOT_FOUND';
  end if;
  if p_client_cmd is not null
     and exists (select 1 from command_log where room_id = p_room and client_cmd = p_client_cmd) then
    return -1;
  end if;
  if p_expected is not null and head <> p_expected then
    raise exception 'STALE_STATE';
  end if;
  start_seq := head + 1;
  for e in select * from jsonb_array_elements(p_events) loop
    head := head + 1;
    insert into events (room_id, seq, type, actor_id, payload, visibility, owner_id)
    values (
      p_room, head, e->>'type', e->>'actorId', e->'payload',
      coalesce(e->>'visibility', 'public'), e->>'ownerId'
    );
  end loop;
  update rooms set head_seq = head where id = p_room;
  if p_client_cmd is not null then
    insert into command_log values (p_room, p_client_cmd, start_seq, head);
  end if;
  return head;
end;
$$;

revoke execute on function public.append_events(uuid, bigint, jsonb, uuid) from public, anon, authenticated;
