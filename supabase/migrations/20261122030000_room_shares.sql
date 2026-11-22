-- 읽기 전용 리플레이 링크. GM이 만든 토큰을 아는 사람은 로그인 없이 그 방의 공개 이벤트만 읽는다.
-- 비공개(GM·귓속말) 이벤트는 내보내지 않는다. 링크를 지우면 더는 읽을 수 없다.
create table public.room_shares (
  token      uuid primary key default gen_random_uuid(),
  room_id    uuid not null references public.rooms(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index room_shares_room on public.room_shares (room_id);

alter table public.room_shares enable row level security;
create policy room_shares_gm_read on public.room_shares for select using (public.is_gm(room_id));
create policy room_shares_gm_insert on public.room_shares for insert
  with check (public.is_gm(room_id) and created_by = auth.uid());
create policy room_shares_gm_delete on public.room_shares for delete using (public.is_gm(room_id));

/** 토큰으로 방 이름과 공개 이벤트를 돌려준다. 없는 토큰이면 null */
create function public.replay_room(p_token uuid) returns jsonb
language sql stable security definer set search_path = public as
$$
  select jsonb_build_object(
    'name', r.name,
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'seq', e.seq, 'type', e.type, 'actorId', e.actor_id, 'payload', e.payload,
        'visibility', e.visibility
      ) order by e.seq)
      from events e where e.room_id = r.id and e.visibility = 'public'
    ), '[]'::jsonb)
  )
  from room_shares s join rooms r on r.id = s.room_id
  where s.token = p_token
$$;

grant execute on function public.replay_room(uuid) to anon, authenticated;
