-- 사이트 운영자 목록. 운영자는 모든 사용자의 저장 캐릭터를 읽기 전용으로 볼 수 있다.
-- 정책 없음: 클라이언트는 이 표를 읽지도 쓰지도 못하고, Edge Function(service role)만 확인한다.
-- 운영자 추가는 Supabase 대시보드 SQL Editor에서:
--   insert into public.site_admins (user_id)
--   select id from auth.users where email = '운영자 이메일';
create table public.site_admins (
  user_id  uuid primary key references auth.users(id) on delete cascade,
  added_at timestamptz not null default now()
);

alter table public.site_admins enable row level security;
