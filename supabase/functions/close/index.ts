// 방 터트리기: GM만 할 수 있다. 접속 중인 사람에게 닫혔다고 알린 뒤 방과 모든 기록을 지운다.
// 요청: { roomId }  응답: { closed: true }
import { admin, appendEvents, CORS, currentUser, fail, ok, readJson } from '../_shared/http.ts';

/** 알림이 다른 사람 화면에 닿을 틈. 지운 뒤에는 RLS가 이벤트를 더는 보여 주지 않는다 */
const NOTICE_MS = 1500;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return fail(405, 'METHOD', 'POST만 받아요.');
  const user = await currentUser(req);
  if (!user) return fail(401, 'NOT_SIGNED_IN', '로그인이 필요해요.');

  const body = await readJson<{ roomId?: unknown }>(req);
  const roomId = String(body?.roomId ?? '');
  if (!roomId) return fail(400, 'INVALID', '닫을 방을 알려 주세요.');

  const db = admin();
  const { data: me } = await db
    .from('room_members')
    .select('role')
    .eq('room_id', roomId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!me) return fail(404, 'NOT_FOUND', '이미 없어진 방이에요.');
  if (me.role !== 'gm') return fail(403, 'FORBIDDEN', '방은 GM만 터트릴 수 있어요.');

  await appendEvents(db, roomId, null, [
    { type: 'room.closed', actorId: user.id, payload: {}, visibility: 'public' },
  ]);
  // 이벤트 구독이 늦거나 끊긴 화면을 위해 방 채널로도 한 번 더 알린다 (실패해도 진행)
  const url = Deno.env.get('SUPABASE_URL')!;
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  await fetch(`${url}/realtime/v1/api/broadcast`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [{ topic: `room:${roomId}`, event: 'closed', payload: {}, private: false }],
    }),
  }).catch(() => null);
  await new Promise((r) => setTimeout(r, NOTICE_MS));

  // 참가자·이벤트·봉인 굴림·명령 기록은 on delete cascade로 함께 지워진다
  const { error } = await db.from('rooms').delete().eq('id', roomId);
  if (error) return fail(500, 'DB', error.message);
  return ok({ closed: true });
});
