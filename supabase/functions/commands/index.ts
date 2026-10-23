// 명령 처리: 파싱 → 역할 확인 → 이벤트로 상태 복원 → rules-engine resolve → append_events
// 요청: { roomId, clientCmdId, command }  응답: { events: [{seq, ...}] }
import { CommandError, initialState, parseCommand, reduce, resolve } from '../_shared/engine.js';
import {
  admin,
  appendEvents,
  CORS,
  currentUser,
  fail,
  loadEvents,
  ok,
  readJson,
  type PlainEvent,
  type StoredEvent,
} from '../_shared/http.ts';

const UUID = /^[0-9a-f-]{36}$/i;

function cryptoInt(max: number): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]! % max;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return fail(405, 'METHOD', 'POST만 받아요.');
  const user = await currentUser(req);
  if (!user) return fail(401, 'NOT_SIGNED_IN', '로그인이 필요해요.');

  const body = await readJson<{ roomId?: string; clientCmdId?: string; command?: unknown }>(req);
  const roomId = String(body?.roomId ?? '');
  const clientCmd = String(body?.clientCmdId ?? '');
  if (!UUID.test(roomId) || !UUID.test(clientCmd))
    return fail(400, 'INVALID', '요청 형식이 올바르지 않아요.');

  let command;
  try {
    command = parseCommand(body?.command);
  } catch {
    return fail(400, 'INVALID', '알 수 없는 명령이에요.');
  }

  const db = admin();
  const { data: member } = await db
    .from('room_members')
    .select('role')
    .eq('room_id', roomId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!member) return fail(403, 'NOT_MEMBER', '이 방의 참가자가 아니에요.');
  const actor = { userId: user.id, role: member.role };
  const canSee = (e: StoredEvent) =>
    e.visibility === 'public' ||
    actor.role === 'gm' ||
    (e.visibility === 'owner' && e.ownerId === user.id);

  for (let attempt = 0; attempt < 4; attempt++) {
    const history = await loadEvents(db, roomId);
    const head = history.at(-1)?.seq ?? 0;
    let state = initialState();
    for (const e of history) state = reduce(state, e);

    const { data: seals } = await db
      .from('sealed_rolls')
      .select('roll_id, side')
      .eq('room_id', roomId);
    const sealed = new Map((seals ?? []).map((s) => [s.roll_id, s.side]));

    let result;
    try {
      result = resolve(state, command, actor, {
        rng: cryptoInt,
        newId: () => crypto.randomUUID(),
        animSeed: () => cryptoInt(2 ** 32),
        sealed: (id: string) => sealed.get(id),
      });
    } catch (e) {
      if (e instanceof CommandError) return fail(409, e.code, e.message);
      throw e;
    }

    const events = result.events as PlainEvent[];
    // 상대가 응답하기 전까지 숨길 주사위는 이벤트보다 먼저 봉인한다
    if (result.seal) {
      await db
        .from('sealed_rolls')
        .upsert({ room_id: roomId, roll_id: result.seal.rollId, side: result.seal.side });
    }
    const newHead = await appendEvents(db, roomId, head, events, clientCmd);
    if (newHead === 'STALE') continue;
    if (newHead === -1) {
      const { data: done } = await db
        .from('command_log')
        .select('first_seq')
        .eq('room_id', roomId)
        .eq('client_cmd', clientCmd)
        .single();
      const again = await loadEvents(db, roomId, Number(done!.first_seq) - 1);
      return ok({ events: again.slice(0, events.length).filter(canSee) });
    }
    const stored: StoredEvent[] = events.map((e, i) => ({ ...e, seq: head + 1 + i }));
    return ok({ events: stored.filter(canSee) });
  }
  return fail(409, 'STALE_STATE', '다른 사람과 동시에 눌렀어요. 다시 시도해 주세요.');
});
