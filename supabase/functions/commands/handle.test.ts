// deno test: 명령 재전송과 동시 처리. DB 대신 command_log·append_events를 흉내 내는 메모리 저장소를 쓴다.
import { parseCommand } from '../_shared/engine.js';
import type { PlainEvent, StoredEvent } from '../_shared/http.ts';
import { handleCommand, type Store } from './handle.ts';

/** 키 순서와 상관없이 비교한다 */
const canon = (v: unknown): string =>
  JSON.stringify(v, (_k, x) =>
    x && typeof x === 'object' && !Array.isArray(x)
      ? Object.fromEntries(Object.entries(x).sort(([p], [q]) => p.localeCompare(q)))
      : x,
  );

function assertEquals(actual: unknown, expected: unknown, msg = '') {
  const a = canon(actual);
  const e = canon(expected);
  if (a !== e) throw new Error(`${msg}\n  actual:   ${a}\n  expected: ${e}`);
}

/** 방 하나. roles: userId → role */
function memoryRoom(roles: Record<string, string>) {
  const events: StoredEvent[] = [];
  const log = new Map<string, [number, number]>();
  let ids = 0;
  const storeFor = (
    userId: string,
    clientCmd: string,
    hooks: { beforeAppend?: () => void } = {},
  ): Store => ({
    memberRole: () => Promise.resolve(roles[userId] ?? null),
    findCommand: () => Promise.resolve(log.get(clientCmd) ?? null),
    readHistory: () => Promise.resolve({ history: [...events], sealed: new Map() }),
    undoGroup: () => Promise.resolve(null),
    seal: () => Promise.resolve(),
    append(expected: number, evs: PlainEvent[]) {
      hooks.beforeAppend?.();
      if (log.has(clientCmd)) return Promise.resolve(-1);
      const head = events.at(-1)?.seq ?? 0;
      if (head !== expected) return Promise.resolve('STALE' as const);
      evs.forEach((e, i) => events.push({ visibility: 'public', ...e, seq: head + 1 + i }));
      log.set(clientCmd, [head + 1, head + evs.length]);
      return Promise.resolve(head + evs.length);
    },
    loadRange: (first, last) =>
      Promise.resolve(events.filter((e) => e.seq >= first && e.seq <= last)),
  });
  const run = (
    userId: string,
    clientCmd: string,
    command: unknown,
    hooks?: { beforeAppend?: () => void },
  ) =>
    handleCommand(userId, parseCommand(command), storeFor(userId, clientCmd, hooks), {
      int: () => 0,
      uuid: () => `id${++ids}`,
    });
  /** 다른 요청이 먼저 기록한 것처럼 넣는다 */
  const commit = (clientCmd: string, evs: PlainEvent[]) => {
    const head = events.at(-1)?.seq ?? 0;
    evs.forEach((e, i) => events.push({ visibility: 'public', ...e, seq: head + 1 + i }));
    log.set(clientCmd, [head + 1, head + evs.length]);
  };
  return { events, run, commit, storeFor };
}

const START = { type: 'session.start', payload: {} };

Deno.test('a resent command returns the stored result instead of failing validation', async () => {
  const room = memoryRoom({ gm: 'gm' });
  const first = await room.run('gm', 'cmd-1', START);
  assertEquals(first.status, 200);
  // 응답을 잃은 클라이언트가 같은 id로 다시 보낸다. 지금 상태로는 "session already running"이지만
  const again = await room.run('gm', 'cmd-1', START);
  assertEquals(again, first, 'resend should return the same events');
  assertEquals(room.events.length, 1, 'nothing new is written');
  // 새 id로 보내면 규칙 검증대로 거절한다
  const fresh = await room.run('gm', 'cmd-2', START);
  assertEquals(fresh.status, 409);
});

Deno.test('a resend still checks membership first', async () => {
  const room = memoryRoom({ gm: 'gm' });
  await room.run('gm', 'cmd-1', START);
  const stranger = await room.run('stranger', 'cmd-1', START);
  assertEquals(stranger.status, 403);
});

Deno.test('a resend shows only events the caller may see', async () => {
  const room = memoryRoom({ gm: 'gm', p1: 'player' });
  const note = { type: 'gm.note', payload: { text: '숨은 함정' } };
  const first = await room.run('gm', 'cmd-n', note);
  assertEquals(first.status === 200 && first.events.length, 1);
  // 숨김 이벤트를 다른 사람이 같은 id로 조회해도 내용은 보이지 않는다
  const peek = await room.run('p1', 'cmd-n', note);
  assertEquals(peek.status === 200 && peek.events, []);
});

Deno.test(
  'returns the stored result when the first request lands while the resend runs',
  async () => {
    const room = memoryRoom({ gm: 'gm' });
    let landed = false;
    // 재전송이 기록하기 직전에 처음 요청이 먼저 기록된다 → append_events가 -1
    const resend = await room.run('gm', 'cmd-1', START, {
      beforeAppend: () => {
        if (landed) return;
        landed = true;
        room.commit('cmd-1', [
          { type: 'session.started', actorId: 'gm', payload: { sessionId: 'first', number: 1 } },
        ]);
      },
    });
    assertEquals(resend.status === 200 && resend.events.map((e) => e.payload), [
      { sessionId: 'first', number: 1 },
    ]);
    assertEquals(room.events.length, 1);
  },
);

Deno.test('returns the stored result when the first request lands before validation', async () => {
  const room = memoryRoom({ gm: 'gm' });
  // 처리 기록 조회와 이력 조회 사이에 처음 요청이 기록되어, 읽은 이력으로는 이미 세션이 열려 있다
  room.commit('other', [
    { type: 'session.started', actorId: 'gm', payload: { sessionId: 'first', number: 1 } },
  ]);
  const store = room.storeFor('gm', 'cmd-1');
  let asked = 0;
  const late: Store = {
    ...store,
    findCommand: () => (asked++ === 0 ? Promise.resolve(null) : Promise.resolve([1, 1] as const)),
  };
  const out = await handleCommand('gm', parseCommand(START), late, {
    int: () => 0,
    uuid: () => 'u',
  });
  assertEquals(out.status, 200);
});
