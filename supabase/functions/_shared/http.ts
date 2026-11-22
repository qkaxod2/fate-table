// Edge Function 공용: serve(CORS 화이트리스트), 응답 형식, 로그인 사용자, 서비스 클라이언트, 이벤트 기록
import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2';

const CORS_BASE = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  Vary: 'Origin',
};

/**
 * 부를 수 있는 사이트. 함수 시크릿 ALLOWED_ORIGINS(쉼표로 구분, 예: https://me.github.io,http://localhost:3000)가
 * 있으면 그 목록만, 없으면 어디서나(로컬 개발). 배포 워크플로가 GitHub Pages 주소로 채운다.
 */
export function allowedOrigins(raw = Deno.env.get('ALLOWED_ORIGINS') ?? ''): string[] | null {
  const list = raw
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  return list.length > 0 ? list : null;
}

/** 이 요청에 돌려줄 CORS 헤더. 목록에 없는 사이트면 Allow-Origin을 빼서 브라우저가 막게 한다 */
export function corsFor(origin: string | null, allowed = allowedOrigins()): Record<string, string> {
  if (!allowed) return { ...CORS_BASE, 'Access-Control-Allow-Origin': '*' };
  if (origin && allowed.includes(origin))
    return { ...CORS_BASE, 'Access-Control-Allow-Origin': origin };
  return { ...CORS_BASE };
}

/**
 * Deno.serve 대신 쓴다. OPTIONS(사전 요청)에 답하고, 모든 응답에 그 요청의 CORS 헤더를 붙이며,
 * 처리 중 예외가 나도 CORS가 붙은 500으로 돌려준다 (브라우저에서 원인이 CORS 오류로 가려지지 않게).
 */
export function serve(handler: (req: Request) => Promise<Response> | Response): void {
  Deno.serve(async (req) => {
    const cors = corsFor(req.headers.get('Origin'));
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
    let res: Response;
    try {
      res = await handler(req);
    } catch (e) {
      console.error(e);
      res = fail(500, 'SERVER', '서버에서 문제가 생겼어요. 잠시 뒤 다시 시도해 주세요.');
    }
    // 헤더를 못 바꾸는 응답(fetch 결과 그대로 등)이면 새로 감싼다
    const out = new Response(res.body, res);
    for (const [k, v] of Object.entries(cors)) out.headers.set(k, v);
    return out;
  });
}

export function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
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

/**
 * append_events() 호출. 성공하면 새 head, 이미 처리된 명령이면 -1, 경합이면 'STALE'.
 * expected가 null이면 head를 맞춰 보지 않고 맨 끝에 붙인다 (상태와 상관없는 명령)
 */
export async function appendEvents(
  db: SupabaseClient,
  roomId: string,
  expected: number | null,
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

/** 방의 모든 이벤트 (서버용, 비공개 포함). until이 있으면 그 seq까지만 */
export async function loadEvents(
  db: SupabaseClient,
  roomId: string,
  after = 0,
  until?: number,
): Promise<StoredEvent[]> {
  const out: StoredEvent[] = [];
  for (let from = after; ; ) {
    let q = db
      .from('events')
      .select('seq, type, actor_id, payload, visibility, owner_id')
      .eq('room_id', roomId)
      .gt('seq', from);
    if (until !== undefined) q = q.lte('seq', until);
    const { data, error } = await q.order('seq').limit(1000);
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
