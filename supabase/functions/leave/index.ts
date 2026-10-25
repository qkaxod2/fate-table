// 방에서 나가기. 참가자 자리를 지우고, 남은 사람에게 퇴장을 알린다. 캐릭터는 방에 남는다.
// GM은 혼자 나갈 수 없다 (GM이 없는 방이 되므로). 방을 없애려면 close를 쓴다.
// 요청: { roomId }  응답: { left: true }
import { admin, appendEvents, CORS, currentUser, fail, ok, readJson } from '../_shared/http.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return fail(405, 'METHOD', 'POST만 받아요.');
  const user = await currentUser(req);
  if (!user) return fail(401, 'NOT_SIGNED_IN', '로그인이 필요해요.');

  const body = await readJson<{ roomId?: unknown }>(req);
  const roomId = String(body?.roomId ?? '');
  if (!roomId) return fail(400, 'INVALID', '나갈 방을 알려 주세요.');

  const db = admin();
  const { data: me } = await db
    .from('room_members')
    .select('role, nickname')
    .eq('room_id', roomId)
    .eq('user_id', user.id)
    .maybeSingle();
  // 이미 나간 방이면 그대로 성공 (목록에서 지우기만 하면 된다)
  if (!me) return ok({ left: true });

  if (me.role === 'gm') {
    const { count } = await db
      .from('room_members')
      .select('user_id', { count: 'exact', head: true })
      .eq('room_id', roomId)
      .eq('role', 'gm');
    if ((count ?? 0) <= 1)
      return fail(
        409,
        'LAST_GM',
        'GM은 방을 나갈 수 없어요. 방을 닫으려면 방 터트리기를 써 주세요.',
      );
  }

  // 아직 참가자일 때 퇴장을 기록해야 다른 사람 화면에 실시간으로 닿는다
  await appendEvents(db, roomId, null, [
    {
      type: 'room.member_left',
      actorId: user.id,
      payload: { userId: user.id, nickname: me.nickname },
      visibility: 'public',
    },
  ]);
  const { error } = await db
    .from('room_members')
    .delete()
    .eq('room_id', roomId)
    .eq('user_id', user.id);
  if (error) return fail(500, 'DB', error.message);
  return ok({ left: true });
});
