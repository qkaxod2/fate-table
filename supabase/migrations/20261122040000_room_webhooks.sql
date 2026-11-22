-- 디스코드 알림. GM이 방에 디스코드 웹훅 주소를 붙이면 서버가 세션 시작·끝, 장면 전환, 대성공, 퇴장을 보낸다.
-- 주소를 아는 사람은 그 채널에 글을 쓸 수 있으므로 GM만 읽고 쓴다. 서버(service role)는 RLS를 건너뛴다.
create table public.room_webhooks (
  room_id    uuid primary key references public.rooms(id) on delete cascade,
  url        text not null check (
    url ~ '^https://(ptb\.|canary\.)?discord(app)?\.com/api/webhooks/[0-9]+/[A-Za-z0-9_-]+$'
  ),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.room_webhooks enable row level security;
create policy room_webhooks_gm_read on public.room_webhooks for select using (public.is_gm(room_id));
create policy room_webhooks_gm_insert on public.room_webhooks for insert
  with check (public.is_gm(room_id) and created_by = auth.uid());
create policy room_webhooks_gm_update on public.room_webhooks for update
  using (public.is_gm(room_id)) with check (public.is_gm(room_id) and created_by = auth.uid());
create policy room_webhooks_gm_delete on public.room_webhooks for delete using (public.is_gm(room_id));

-- 익명 계정을 로그인 계정에 합친 뒤 익명 계정이 지워져도 링크와 알림은 남는다 (방이 지워질 때만 함께 지워진다)
alter table public.room_shares alter column created_by drop not null;
alter table public.room_shares drop constraint room_shares_created_by_fkey;
alter table public.room_shares add constraint room_shares_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;
