// 방 만들기: 만든 사람이 GM이 되고, 첫 세션이 바로 열린다.
// 요청: { name, nickname }  응답: { roomId, inviteCode }
import { initialState, reduce, resolve } from '../_shared/engine.js';
import {
  admin,
  appendEvents,
  cleanNickname,
  CORS,
  currentUser,
  fail,
  ok,
  readJson,
  type PlainEvent,
} from '../_shared/http.ts';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function inviteCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => CODE_CHARS[b % CODE_CHARS.length]).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return fail(405, 'METHOD', 'POST만 받아요.');
  const user = await currentUser(req);
  if (!user) return fail(401, 'NOT_SIGNED_IN', '로그인이 필요해요.');

  const body = await readJson<{ name?: unknown; nickname?: unknown }>(req);
  const name = String(body?.name ?? '').trim();
  const nickname = cleanNickname(body?.nickname);
  if (!name || name.length > 60) return fail(400, 'INVALID', '방 이름은 1~60자로 적어 주세요.');
  if (!nickname) return fail(400, 'INVALID', '닉네임은 1~30자로 적어 주세요.');

  const db = admin();
  let room: { id: string; invite_code: string } | null = null;
  for (let i = 0; i < 5 && !room; i++) {
    const { data, error } = await db
      .from('rooms')
      .insert({ name, invite_code: inviteCode(), created_by: user.id })
      .select('id, invite_code')
      .single();
    if (!error) room = data;
    else if (!error.message.includes('duplicate')) return fail(500, 'DB', error.message);
  }
  if (!room) return fail(500, 'DB', '초대 코드를 만들지 못했어요.');

  const { error: memberErr } = await db
    .from('room_members')
    .insert({ room_id: room.id, user_id: user.id, role: 'gm', nickname });
  if (memberErr) return fail(500, 'DB', memberErr.message);

  const gm = { userId: user.id, role: 'gm' };
  const joined: PlainEvent = {
    type: 'room.member_joined',
    actorId: user.id,
    payload: { userId: user.id, nickname, role: 'gm' },
    visibility: 'public',
  };
  const state = reduce(initialState(), { ...joined, seq: 1 });
  const session = resolve(state, { type: 'session.start', payload: { title: name } }, gm, {
    rng: () => 0,
    newId: () => crypto.randomUUID(),
    animSeed: () => 0,
  }).events as PlainEvent[];

  await appendEvents(db, room.id, 0, [joined, ...session]);
  return ok({ roomId: room.id, inviteCode: room.invite_code });
});
