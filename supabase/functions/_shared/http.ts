// Edge Function 공용: CORS, 응답 형식, 로그인 사용자, 서비스 클라이언트, 이벤트 기록
import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2';

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

export const ok = (data: unknown) => reply(200, { ok: true, data });
export const fail = (status: number, code: string, message: string) =>
  reply(status, { ok: false, error: { code, message } });

export function admin(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
}

export async function currentUser(req: Request): Promise<User | null> {
  const asUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data } = await asUser.auth.getUser();
  return data.user;
}

export async function readJson<T>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}

export interface PlainEvent {
  type: string;
  actorId: string | null;
  payload: unknown;
  visibility?: string;
  ownerId?: string;
}

export interface StoredEvent extends PlainEvent {
  seq: number;
}

/** append_events() 호출. 성공하면 새 head, 이미 처리된 명령이면 -1, 경합이면 'STALE' */
export async function appendEvents(
  db: SupabaseClient,
  roomId: string,
  expected: number,
  events: PlainEvent[],
  clientCmd?: string,
): Promise<number | 'STALE'> {
  const { data, error } = await db.rpc('append_events', {
    p_room: roomId,
    p_expected: expected,
    p_events: events,
    p_client_cmd: clientCmd ?? null,
  });
  if (error) {
    if (error.message.includes('STALE_STATE')) return 'STALE';
    throw new Error(error.message);
  }
  return Number(data);
}

/** 방의 모든 이벤트 (서버용, 비공개 포함) */
export async function loadEvents(db: SupabaseClient, roomId: string, after = 0): Promise<StoredEvent[]> {
  const out: StoredEvent[] = [];
  for (let from = after; ; ) {
    const { data, error } = await db
      .from('events')
      .select('seq, type, actor_id, payload, visibility, owner_id')
      .eq('room_id', roomId)
      .gt('seq', from)
      .order('seq')
      .limit(1000);
    if (error) throw new Error(error.message);
    for (const r of data) {
      out.push({
        seq: Number(r.seq),
        type: r.type,
        actorId: r.actor_id,
        payload: r.payload,
        visibility: r.visibility,
        ...(r.owner_id ? { ownerId: r.owner_id } : {}),
      });
    }
    if (data.length < 1000) return out;
    from = out[out.length - 1]!.seq;
  }
}

export function cleanNickname(v: unknown): string | null {
  const s = String(v ?? '').trim();
  return s.length >= 1 && s.length <= 30 ? s : null;
}
