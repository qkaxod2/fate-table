-- 캐릭터 초상화 (NAI). 이미지는 공개 버킷, 사용량은 서버(서비스 키)만 읽고 쓴다.

insert into storage.buckets (id, name, public)
values ('portraits', 'portraits', true)
on conflict (id) do nothing;

create table if not exists public.media_usage (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null check (kind in ('portrait', 'scene', 'npc', 'sfx')),
  path       text,
  created_at timestamptz not null default now()
);
create index if not exists media_usage_user_time on public.media_usage (user_id, kind, created_at desc);

alter table public.media_usage enable row level security;
-- 정책 없음: 클라이언트(anon/authenticated)는 접근 불가, Edge Function의 service role만 사용
