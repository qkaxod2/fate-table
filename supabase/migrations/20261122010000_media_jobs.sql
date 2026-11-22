-- 그림 생성 작업 큐. 요청은 작업만 쌓고 바로 답하고, Edge Function이 응답 뒤에 하나씩 처리한다.
-- NovelAI는 키당 동시 1건이라 claim_media_job()이 한 번에 하나만 내준다.
-- 화면은 자기 작업 행을 Realtime으로 지켜보다 done/failed가 되면 결과를 받는다.
create table public.media_jobs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  kind        text not null,
  input       jsonb not null,
  status      text not null default 'pending' check (status in ('pending', 'running', 'done', 'failed')),
  result      jsonb,
  error       jsonb,
  created_at  timestamptz not null default now(),
  started_at  timestamptz,
  finished_at timestamptz
);
create index media_jobs_queue on public.media_jobs (created_at) where status in ('pending', 'running');
create index media_jobs_user on public.media_jobs (user_id, created_at desc);

alter table public.media_jobs enable row level security;
create policy media_jobs_read_own on public.media_jobs for select using (user_id = auth.uid());
-- 쓰기는 서버(service role)만

/**
 * 다음 작업을 맡는다. 이미 그리는 중인 작업이 있으면 아무것도 내주지 않는다.
 * 3분 넘게 끝나지 않은 작업은 함수가 멈춘 것으로 보고 실패로 돌린다.
 */
create function public.claim_media_job()
returns setof public.media_jobs
language plpgsql security definer set search_path = public as
$$
declare
  job media_jobs;
begin
  -- 동시에 부른 쪽끼리 줄을 세운다
  perform pg_advisory_xact_lock(hashtext('media_jobs'));
  update media_jobs
     set status = 'failed',
         error = '{"code":"TIMEOUT","message":"그림을 만드는 데 너무 오래 걸렸어요. 다시 시도해 주세요."}',
         finished_at = now()
   where status = 'running' and started_at < now() - interval '3 minutes';
  -- 오래 기다리기만 한 작업도 정리한다 (처리할 함수가 없었던 경우)
  update media_jobs
     set status = 'failed',
         error = '{"code":"TIMEOUT","message":"그림 작업이 시작되지 못했어요. 다시 시도해 주세요."}',
         finished_at = now()
   where status = 'pending' and created_at < now() - interval '10 minutes';
  if exists (select 1 from media_jobs where status = 'running') then
    return;
  end if;
  select * into job from media_jobs where status = 'pending' order by created_at limit 1 for update;
  if job.id is null then
    return;
  end if;
  update media_jobs set status = 'running', started_at = now() where id = job.id returning * into job;
  return next job;
end;
$$;

revoke execute on function public.claim_media_job() from public, anon, authenticated;

alter publication supabase_realtime add table public.media_jobs;
