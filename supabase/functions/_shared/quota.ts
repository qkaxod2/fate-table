// 생성 API 사용량: 호출 전에 DB에서 원자적으로 예약하고(reserve_media_usage), 실패하면 돌려놓는다.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

export interface QuotaInput {
  userId: string;
  /** 잠금·집계 묶음 이름 ('image' | 'prompt') */
  group: string;
  /** 한도에 함께 세는 종류 */
  kinds: readonly string[];
  /** 이번에 기록할 종류 */
  kind: string;
  limit: number;
}

export type Reservation =
  | { ok: true; id: number }
  /** limit: 한도에 닿음. unavailable: 사용량을 확인하지 못함 (0으로 치지 않는다) */
  | { ok: false; reason: 'limit' | 'unavailable' };

export async function reserveUsage(db: SupabaseClient, q: QuotaInput): Promise<Reservation> {
  const { data, error } = await db.rpc('reserve_media_usage', {
    p_user: q.userId,
    p_group: q.group,
    p_kinds: q.kinds,
    p_kind: q.kind,
    p_limit: q.limit,
  });
  if (error) {
    console.error('quota', error.message);
    return { ok: false, reason: 'unavailable' };
  }
  if (data === null || data === undefined) return { ok: false, reason: 'limit' };
  return { ok: true, id: Number(data) };
}

/** 생성에 실패해 쓰지 않은 예약을 돌려놓는다 */
export async function releaseUsage(db: SupabaseClient, id: number): Promise<void> {
  const { error } = await db.from('media_usage').delete().eq('id', id);
  if (error) console.error('quota release', error.message);
}

/** 예약을 확정한다. 만든 파일 경로를 남긴다 */
export async function keepUsage(db: SupabaseClient, id: number, path?: string): Promise<void> {
  if (!path) return;
  const { error } = await db.from('media_usage').update({ path }).eq('id', id);
  if (error) console.error('quota keep', error.message);
}

/**
 * 예약 → 생성 → 성공이면 유지, 아니면 돌려놓기. run 안에서 keep()을 부른 경우에만 사용량이 남는다.
 * 예약하지 못하면 refuse(이유)의 응답을 그대로 돌려준다.
 */
export async function withUsage(
  db: SupabaseClient,
  q: QuotaInput,
  refuse: (reason: 'limit' | 'unavailable') => Response,
  run: (keep: (path?: string) => void) => Promise<Response>,
): Promise<Response> {
  const slot = await reserveUsage(db, q);
  if (!slot.ok) return refuse(slot.reason);
  let kept: { path?: string } | null = null;
  try {
    return await run((path) => {
      kept = path ? { path } : {};
    });
  } finally {
    const k = kept as { path?: string } | null;
    if (k) await keepUsage(db, slot.id, k.path);
    else await releaseUsage(db, slot.id);
  }
}
