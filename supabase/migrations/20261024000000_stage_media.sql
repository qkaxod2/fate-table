-- 스탠딩·표정·장면 배경·LLM 프롬프트 사용량도 media_usage로 센다.
alter table public.media_usage drop constraint if exists media_usage_kind_check;
alter table public.media_usage
  add constraint media_usage_kind_check
  check (kind in ('portrait', 'scene', 'npc', 'sfx', 'standing', 'expression', 'prompt'));
