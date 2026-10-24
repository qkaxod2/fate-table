// 명령 처리: 파싱 → 역할 확인 → 이벤트로 상태 복원 → rules-engine resolve → append_events
// 요청: { roomId, clientCmdId, command }  응답: { events: [{seq, ...}] }
import { CommandError, parseCommand, replay, resolve } from '../_shared/engine.js';
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
  // 이벤트와 봉인 주사위는 함께 읽는다 (경합으로 다시 시도할 때도)
  const readHistory = () =>
    Promise.all([
      loadEvents(db, roomId),
      db.from('sealed_rolls').select('roll_id, side').eq('room_id', roomId),
    ]);
  const undoSeq = command.type === 'event.undo' ? command.payload.targetSeq : null;
  // 로그인 확인 → 참가자 확인은 이어서, 나머지 조회와는 나란히 기다린다
  const whoP = currentUser(req)
    .catch(() => null)
    .then(async (user) => {
      if (!user) return { user: null, member: null };
      const { data: member } = await db
        .from('room_members')
        .select('role')
        .eq('room_id', roomId)
        .eq('user_id', user.id)
        .maybeSingle();
      return { user, member };
    });
  const [{ user, member }, firstRead, undoGroup] = await Promise.all([
    whoP,
    readHistory(),
    undoSeq === null
      ? Promise.resolve(null)
      : db
          .from('command_log')
          .select('first_seq, last_seq')
          .eq('room_id', roomId)
          .lte('first_seq', undoSeq)
          .gte('last_seq', undoSeq)
          .maybeSingle(),
  ]);
  if (!user) return fail(401, 'NOT_SIGNED_IN', '로그인이 필요해요.');
  if (!member) return fail(403, 'NOT_MEMBER', '이 방의 참가자가 아니에요.');
  const actor = { userId: user.id, role: member.role };
  const canSee = (e: StoredEvent) =>
    e.visibility === 'public' ||
    actor.role === 'gm' ||
    (e.visibility === 'owner' && e.ownerId === user.id);

  // 되돌리기는 같은 명령이 만든 이벤트를 함께 되돌린다
  const g = undoGroup?.data;
  const group: readonly [number, number] | undefined = g
    ? [Number(g.first_seq), Number(g.last_seq)]
    : undefined;

  let read = firstRead;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) read = await readHistory();
    const [history, { data: seals }] = read;
    const head = history.at(-1)?.seq ?? 0;
    const state = replay(history);
    const sealed = new Map((seals ?? []).map((s) => [s.roll_id, s.side]));

    let result;
    try {
      result = resolve(state, command, actor, {
        rng: cryptoInt,
        newId: () => crypto.randomUUID(),
        animSeed: () => cryptoInt(2 ** 32),
        sealed: (id: string) => sealed.get(id),
        history,
        groupOf: () => group,
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
