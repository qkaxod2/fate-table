// 명령 처리의 순서와 규칙. DB 접근은 Store로 받아서 index.ts는 Supabase를, 테스트는 메모리를 꽂는다.
// 순서: 참가자 확인 → 이미 처리한 명령이면 저장된 결과 → 이벤트로 상태 복원 → resolve → append
import { CommandError, initialState, replay, resolve } from '../_shared/engine.js';
import type { PlainEvent, StoredEvent } from '../_shared/http.ts';

export interface Store {
  /** 참가자 역할. 참가자가 아니면 null */
  memberRole(): Promise<string | null>;
  /** 이 명령 id로 이미 기록한 이벤트 범위 [first, last] (command_log) */
  findCommand(): Promise<readonly [number, number] | null>;
  /** 방의 모든 이벤트(비공개 포함)와 봉인 주사위 */
  readHistory(): Promise<{ history: StoredEvent[]; sealed: Map<string, unknown> }>;
  /** 되돌리기: 이 seq를 만든 명령의 이벤트 범위 */
  undoGroup(seq: number): Promise<readonly [number, number] | null>;
  seal(rollId: string, side: unknown): Promise<void>;
  /** 성공하면 새 head, 같은 명령 id가 이미 있으면 -1, 경합이면 'STALE'. expected가 null이면 맨 끝에 붙인다 */
  append(expected: number | null, events: PlainEvent[]): Promise<number | 'STALE'>;
  /** seq가 first..last인 이벤트 */
  loadRange(first: number, last: number): Promise<StoredEvent[]>;
}

export interface Rand {
  int(max: number): number;
  uuid(): string;
}

export type Outcome =
  { status: 200; events: StoredEvent[] } | { status: 403 | 409; code: string; message: string };

/**
 * 방 상태를 보지 않는 명령. 이력을 읽어 접지 않고, head 경합 없이 맨 끝에 붙인다.
 * 방이 길어져도 채팅이 늦어지지 않고, 굴림·이동과 동시에 보내도 STALE로 다시 읽지 않는다.
 */
export const STATELESS: ReadonlySet<string> = new Set([
  'chat.post',
  'narration.post',
  'gm.note',
  'sfx.play',
]);

export async function handleCommand(
  userId: string,
  command: unknown,
  store: Store,
  rand: Rand,
): Promise<Outcome> {
  const type = (command as { type: string }).type;
  const stateless = STATELESS.has(type);
  const undoSeq =
    (command as { type: string }).type === 'event.undo'
      ? (command as { payload: { targetSeq: number } }).payload.targetSeq
      : null;
  // 참가자 확인, 처리 기록, 이력, 되돌리기 범위는 나란히 읽는다
  const [role, done, firstRead, group] = await Promise.all([
    store.memberRole(),
    store.findCommand(),
    stateless ? Promise.resolve(null) : store.readHistory(),
    undoSeq === null ? Promise.resolve(null) : store.undoGroup(undoSeq),
  ]);
  if (!role) return { status: 403, code: 'NOT_MEMBER', message: '이 방의 참가자가 아니에요.' };
  const actor = { userId, role };
  const canSee = (e: StoredEvent) =>
    e.visibility === 'public' ||
    actor.role === 'gm' ||
    (e.visibility === 'owner' && e.ownerId === userId);
  const stored = async ([first, last]: readonly [number, number]): Promise<Outcome> => ({
    status: 200,
    events: (await store.loadRange(first, last)).filter(canSee),
  });

  // 이미 처리한 명령의 재전송: 지금 상태로 다시 검증하지 않고 그때 기록한 결과를 돌려준다
  if (done) return stored(done);

  if (stateless) {
    let result;
    try {
      result = resolve(initialState(), command, actor, {
        rng: rand.int,
        newId: rand.uuid,
        animSeed: () => rand.int(2 ** 32),
      });
    } catch (e) {
      if (!(e instanceof CommandError)) throw e;
      return { status: 409, code: e.code, message: e.message };
    }
    const events = result.events as PlainEvent[];
    const newHead = await store.append(null, events);
    if (newHead === -1) {
      const range = await store.findCommand();
      if (range) return stored(range);
    }
    if (typeof newHead !== 'number' || newHead < 0)
      throw new Error('append without expected head cannot be stale');
    const first = newHead - events.length + 1;
    return {
      status: 200,
      events: events.map((e, i) => ({ ...e, seq: first + i })).filter(canSee),
    };
  }

  let read = firstRead!;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) read = await store.readHistory();
    const { history, sealed } = read;
    const head = history.at(-1)?.seq ?? 0;
    const state = replay(history);

    let result;
    try {
      result = resolve(state, command, actor, {
        rng: rand.int,
        newId: rand.uuid,
        animSeed: () => rand.int(2 ** 32),
        sealed: (id: string) => sealed.get(id),
        history,
        groupOf: () => group ?? undefined,
      });
    } catch (e) {
      if (!(e instanceof CommandError)) throw e;
      // 처음 보낸 요청이 방금 기록됐다면 그 결과가 답이다
      const late = await store.findCommand();
      if (late) return stored(late);
      return { status: 409, code: e.code, message: e.message };
    }

    const events = result.events as PlainEvent[];
    // 상대가 응답하기 전까지 숨길 주사위는 이벤트보다 먼저 봉인한다
    if (result.seal) await store.seal(result.seal.rollId, result.seal.side);
    const newHead = await store.append(head, events);
    if (newHead === 'STALE') continue;
    if (newHead === -1) {
      // 같은 명령이 동시에 먼저 기록됐다
      const range = await store.findCommand();
      if (range) return stored(range);
      continue;
    }
    return {
      status: 200,
      events: events.map((e, i) => ({ ...e, seq: head + 1 + i })).filter(canSee),
    };
  }
  return {
    status: 409,
    code: 'STALE_STATE',
    message: '다른 사람과 동시에 눌렀어요. 다시 시도해 주세요.',
  };
}
