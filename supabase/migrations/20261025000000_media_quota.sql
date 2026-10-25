-- 생성 API 사용량을 호출 전에 원자적으로 예약한다.
-- 같은 사용자·같은 묶음(그림 / 프롬프트)의 예약은 트랜잭션 잠금으로 한 줄로 세워서,
-- 한도가 1회 남았을 때 동시에 들어온 요청 중 하나만 통과한다.

/**
 * 지난 24시간 동안 p_kinds 사용량이 p_limit 미만이면 p_kind로 한 줄 기록하고 그 id를 돌려준다.
 * 한도에 닿았으면 null.
 */
create function public.reserve_media_usage(
  p_user uuid,
  p_group text,
  p_kinds text[],
  p_kind text,
  p_limit int
) returns bigint
language plpgsql security definer set search_path = public as
$$
declare
  used int;
  new_id bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended('media_usage:' || p_user::text || ':' || p_group, 0));
  select count(*) into used
  from media_usage
  where user_id = p_user and kind = any (p_kinds) and created_at >= now() - interval '24 hours';
  if used >= p_limit then
    return null;
  end if;
  insert into media_usage (user_id, kind) values (p_user, p_kind) returning id into new_id;
  return new_id;
end;
$$;

revoke execute on function public.reserve_media_usage(uuid, text, text[], text, int)
  from public, anon, authenticated;
