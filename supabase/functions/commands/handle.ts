// 명령 처리의 순서와 규칙. DB 접근은 Store로 받아서 index.ts는 Supabase를, 테스트는 메모리를 꽂는다.
// 순서: 참가자 확인 → 이미 처리한 명령이면 저장된 결과 → 이벤트로 상태 복원 → resolve → append
import { CommandError, initialState, replay, resolve } from '../_shared/engine.js';

type RoomState = ReturnType<typeof initialState>;
import type { PlainEvent, StoredEvent } from '../_shared/http.ts';

export interface Store {
  /** 참가자 역할. 참가자가 아니면 null */
  memberRole(): Promise<string | null>;
  /** 이 명령 id로 이미 기록한 이벤트 범위 [first, last] (command_log) */
  findCommand(): Promise<readonly [number, number] | null>;
  /** after 다음부터의 이벤트(비공개 포함). after가 0이면 방의 모든 이벤트 */
  readHistory(after: number): Promise<StoredEvent[]>;
  /** 저장해 둔 상태 체크포인트 (지금 규칙 엔진 버전의 것만) */
  snapshot(): Promise<Snapshot | null>;
  saveSnapshot(snapshot: Snapshot): Promise<void>;
  /** 반대 굴림 하나의 봉인된 공격자 주사위. 방어 명령에서만 읽는다 */
  sealedSide(rollId: string): Promise<unknown>;
  /** 되돌리기: 이 seq를 만든 명령의 이벤트 범위 */
  undoGroup(seq: number): Promise<readonly [number, number] | null>;
  seal(rollId: string, side: unknown): Promise<void>;
  /** 성공하면 새 head, 같은 명령 id가 이미 있으면 -1, 경합이면 'STALE'. expected가 null이면 맨 끝에 붙인다 */
  append(expected: number | null, events: PlainEvent[]): Promise<number | 'STALE'>;
  /** seq가 first..last인 이벤트 */
  loadRange(first: number, last: number): Promise<StoredEvent[]>;
  /** 기록을 마친 뒤 바깥에 알린다 (디스코드). before는 명령을 처리하기 전 상태. 기다리지 않는다 */
  notify?(events: StoredEvent[], before: RoomState): void;
}

export interface Snapshot {
  seq: number;
  state: RoomState;
}

/** 이벤트가 이만큼 쌓일 때마다 상태 체크포인트를 저장한다 */
export const SNAPSHOT_EVERY = 200;
/** 장면·세션이 끝날 때는 이만큼만 쌓였어도 저장한다 */
const SNAPSHOT_AT_SCENE_END = 20;

/** 되돌리기가 체크포인트 이전(seq <= base)을 건드리면 그 체크포인트는 쓸 수 없다 */
function touchesBefore(events: readonly StoredEvent[], base: number): boolean {
  return events.some(
    (e) =>
      e.type === 'event.undone' && (e.payload as { seqs: number[] }).seqs.some((q) => q <= base),
  );
}

interface Read {
  /** 체크포인트 상태 (없으면 처음 상태) */
  base: RoomState;
  baseSeq: number;
  /** base 이후 이벤트 */
  history: StoredEvent[];
  head: number;
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
  'dice.secret',
  'narration.post',
  'gm.note',
  'music.set',
  'sfx.play',
  'stage.fx',
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
  // 봉인 주사위는 방어할 때만 그 판정 하나를 읽는다 (방에 쌓인 봉인을 매번 다 읽지 않는다).
  // 방어를 되돌리면 다시 방어해야 하므로 봉인은 지우지 않는다
  const defendId =
    type === 'roll.defend' ? (command as { payload: { rollId: string } }).payload.rollId : null;
  // 되돌리기는 지난 이벤트를 직접 찾아야 해서 체크포인트 없이 처음부터 읽는다
  const useSnapshot = undoSeq === null;
  const read = async (snap: Snapshot | null): Promise<Read> => {
    if (snap) {
      const history = await store.readHistory(snap.seq);
      if (!touchesBefore(history, snap.seq))
        return {
          base: snap.state,
          baseSeq: snap.seq,
          history,
          head: history.at(-1)?.seq ?? snap.seq,
        };
    }
    const history = await store.readHistory(0);
    return { base: initialState(), baseSeq: 0, history, head: history.at(-1)?.seq ?? 0 };
  };
  // 참가자 확인, 처리 기록, 체크포인트, 되돌리기 범위, 봉인은 나란히 읽는다
  const [role, done, snap, group, seal] = await Promise.all([
    store.memberRole(),
    store.findCommand(),
    stateless || !useSnapshot ? Promise.resolve(null) : store.snapshot().catch(() => null),
    undoSeq === null ? Promise.resolve(null) : store.undoGroup(undoSeq),
    defendId === null ? Promise.resolve(undefined) : store.sealedSide(defendId),
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

  for (let attempt = 0; attempt < 4; attempt++) {
    const { base, baseSeq, history, head } = await read(snap);
    const state = replay(history, base);

    let result;
    try {
      result = resolve(state, command, actor, {
        rng: rand.int,
        newId: rand.uuid,
        animSeed: () => rand.int(2 ** 32),
        sealed: (id: string) => (id === defendId && seal != null ? seal : undefined) as never,
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
    const written = events.map((e, i) => ({ ...e, seq: head + 1 + i }) as StoredEvent);
    await maybeSnapshot(store, base, baseSeq, [...history, ...written]);
    store.notify?.(written, state);
    return { status: 200, events: written.filter(canSee) };
  }
  return {
    status: 409,
    code: 'STALE_STATE',
    message: '다른 사람과 동시에 눌렀어요. 다시 시도해 주세요.',
  };
}

/**
 * 체크포인트 뒤로 충분히 쌓였거나 장면·세션이 끝났으면 지금 상태를 저장한다.
 * 저장에 실패해도 명령은 이미 기록됐으므로 다음 기회에 다시 저장한다.
 */
async function maybeSnapshot(
  store: Store,
  base: RoomState,
  baseSeq: number,
  after: StoredEvent[],
): Promise<void> {
  const head = after.at(-1)?.seq ?? baseSeq;
  const since = head - baseSeq;
  const sceneEnd = after.some((e) => e.type === 'scene.ended' || e.type === 'session.ended');
  if (since < SNAPSHOT_EVERY && !(sceneEnd && since >= SNAPSHOT_AT_SCENE_END)) return;
  // 방금 쓴 되돌리기가 체크포인트 이전을 건드렸다면 이 base로는 접을 수 없다 (다음 명령이 처음부터 읽고 저장한다)
  if (touchesBefore(after, baseSeq)) return;
  try {
    await store.saveSnapshot({ seq: head, state: replay(after, base) });
  } catch (e) {
    console.error('snapshot save failed', e);
  }
}
