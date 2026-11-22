-- 방 상태 체크포인트. 상태를 보는 명령마다 이벤트를 처음부터 접지 않도록, 일정 간격으로
-- 접은 상태를 저장해 두고 그 뒤 이벤트만 읽는다. version은 규칙 엔진 번들의 해시라서
-- 리듀서가 바뀌어 배포되면 예전 체크포인트는 쓰지 않고 처음부터 다시 접는다.
-- 서버(Edge Function, service role)만 읽고 쓴다. 상태에는 GM만 볼 내용도 들어 있다.
create table public.room_snapshots (
  room_id    uuid primary key references public.rooms(id) on delete cascade,
  seq        bigint not null,
  version    text not null,
  state      jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.room_snapshots enable row level security;
-- 정책 없음 → 클라이언트는 읽을 수 없다
