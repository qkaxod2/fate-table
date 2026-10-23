-- 방 · 참가자 · 이벤트. 진실은 events이고, 클라이언트는 읽기만 한다 (쓰기는 Edge Function의 service role).

create table public.rooms (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 60),
  invite_code text not null unique,
  created_by  uuid not null references auth.users(id),
  head_seq    bigint not null default 0,
  created_at  timestamptz not null default now()
);

create table public.room_members (
  room_id   uuid not null references public.rooms(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  role      text not null check (role in ('gm', 'player', 'spectator')),
  nickname  text not null check (char_length(nickname) between 1 and 30),
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
create index room_members_user on public.room_members (user_id);

create table public.events (
  room_id    uuid not null references public.rooms(id) on delete cascade,
  seq        bigint not null,
  type       text not null,
  actor_id   text,
  payload    jsonb not null,
  visibility text not null default 'public' check (visibility in ('public', 'gm', 'owner')),
  owner_id   text,
  created_at timestamptz not null default now(),
  primary key (room_id, seq)
);

-- 반대 굴림에서 상대가 응답하기 전까지 숨겨 두는 공격자 주사위
create table public.sealed_rolls (
  room_id uuid not null references public.rooms(id) on delete cascade,
  roll_id text not null,
  side    jsonb not null,
  primary key (room_id, roll_id)
);

-- 같은 명령을 두 번 보내도 한 번만 기록 (네트워크 재시도 대비)
create table public.command_log (
  room_id    uuid not null references public.rooms(id) on delete cascade,
  client_cmd uuid not null,
  first_seq  bigint not null,
  last_seq   bigint not null,
  primary key (room_id, client_cmd)
);

create function public.is_member(r uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from room_members where room_id = r and user_id = auth.uid()) $$;

create function public.is_gm(r uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from room_members where room_id = r and user_id = auth.uid() and role = 'gm') $$;

alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.events enable row level security;
alter table public.sealed_rolls enable row level security;
alter table public.command_log enable row level security;

create policy rooms_read on public.rooms for select using (public.is_member(id));
create policy members_read on public.room_members for select using (public.is_member(room_id));
create policy events_read on public.events for select using (
  public.is_member(room_id) and (
    visibility = 'public'
    or (visibility = 'gm' and public.is_gm(room_id))
    or (visibility = 'owner' and (owner_id = auth.uid()::text or public.is_gm(room_id)))
  )
);
-- sealed_rolls, command_log: 정책 없음 → 서버만 접근

/**
 * 이벤트를 한 번에 기록한다. head_seq가 기대값과 다르면 STALE_STATE.
 * p_events: [{type, actorId, payload, visibility, ownerId?}, ...]
 * 같은 client_cmd가 이미 있으면 아무것도 쓰지 않고 -1을 돌려준다.
 */
create function public.append_events(
  p_room uuid,
  p_expected bigint,
  p_events jsonb,
  p_client_cmd uuid default null
) returns bigint
language plpgsql security definer set search_path = public as
$$
declare
  head bigint;
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
  if head <> p_expected then
    raise exception 'STALE_STATE';
  end if;
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
    insert into command_log values (p_room, p_client_cmd, p_expected + 1, head);
  end if;
  return head;
end;
$$;

revoke execute on function public.append_events(uuid, bigint, jsonb, uuid) from public, anon, authenticated;

-- 새 이벤트를 Realtime으로 흘려보낸다 (RLS가 비공개 이벤트를 거른다)
alter publication supabase_realtime add table public.events;
