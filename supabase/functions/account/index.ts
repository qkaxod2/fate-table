// 익명으로 쓰던 기록(방·캐릭터)을 방금 로그인한 계정으로 옮기고, 빈 익명 사용자는 지운다.
// 요청: { anonToken }  (로그인 전에 쓰던 익명 세션의 access token)  응답: { rooms }
import { admin, CORS, currentUser, fail, ok, readJson } from '../_shared/http.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return fail(405, 'METHOD', 'POST만 받아요.');
  const user = await currentUser(req);
  if (!user) return fail(401, 'NOT_SIGNED_IN', '로그인이 필요해요.');
  if (user.is_anonymous) return fail(400, 'ANONYMOUS', '계정으로 로그인한 뒤에 옮길 수 있어요.');

  const body = await readJson<{ anonToken?: unknown }>(req);
  const token = String(body?.anonToken ?? '');
  if (!token) return fail(400, 'INVALID', '옮길 기록이 없어요.');

  const db = admin();
  const { data: from } = await db.auth.getUser(token);
  // 익명 사용자만 옮긴다 (다른 정식 계정의 토큰으로 남의 기록을 가져오지 못하게)
  if (!from.user || !from.user.is_anonymous)
    return fail(400, 'INVALID', '옮길 익명 기록을 찾지 못했어요.');
  if (from.user.id === user.id) return ok({ rooms: 0 });

  const { data: rooms, error } = await db.rpc('merge_users', {
    p_from: from.user.id,
    p_to: user.id,
  });
  if (error) return fail(500, 'DB', error.message);
  await db.auth.admin.deleteUser(from.user.id);
  return ok({ rooms: Number(rooms) });
});
