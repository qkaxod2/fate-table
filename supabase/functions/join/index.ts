// 초대 코드로 방에 들어가기. 이미 들어와 있으면 그대로 돌려준다.
// 요청: { code, nickname }  응답: { roomId, role }
import {
  admin,
  appendEvents,
  cleanNickname,
  CORS,
  currentUser,
  fail,
  ok,
  readJson,
} from '../_shared/http.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return fail(405, 'METHOD', 'POST만 받아요.');
  const user = await currentUser(req);
  if (!user) return fail(401, 'NOT_SIGNED_IN', '로그인이 필요해요.');

  const body = await readJson<{ code?: unknown; nickname?: unknown }>(req);
  const code = String(body?.code ?? '')
    .trim()
    .toUpperCase();
  const nickname = cleanNickname(body?.nickname);
  if (!code) return fail(400, 'INVALID', '초대 코드를 적어 주세요.');

  const db = admin();
  const { data: room } = await db.from('rooms').select('id').eq('invite_code', code).maybeSingle();
  if (!room) return fail(404, 'NOT_FOUND', '초대 코드에 맞는 방이 없어요. 코드를 다시 확인해 주세요.');

  const { data: existing } = await db
    .from('room_members')
    .select('role')
    .eq('room_id', room.id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (existing) return ok({ roomId: room.id, role: existing.role });
  if (!nickname) return fail(400, 'INVALID', '닉네임은 1~30자로 적어 주세요.');

  const { error } = await db
    .from('room_members')
    .insert({ room_id: room.id, user_id: user.id, role: 'player', nickname });
  if (error) return fail(500, 'DB', error.message);

  const joined = {
    type: 'room.member_joined',
    actorId: user.id,
    payload: { userId: user.id, nickname, role: 'player' },
    visibility: 'public',
  };
  for (let i = 0; i < 5; i++) {
    const { data: r } = await db.from('rooms').select('head_seq').eq('id', room.id).single();
    const res = await appendEvents(db, room.id, Number(r!.head_seq), [joined]);
    if (res !== 'STALE') break;
  }
  return ok({ roomId: room.id, role: 'player' });
});
