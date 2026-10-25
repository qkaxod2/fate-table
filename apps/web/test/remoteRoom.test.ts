import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { RemoteRoom } from '@/state/remoteRoom';

const call = vi.hoisted(() => ({ fn: vi.fn() }));
vi.mock('@/lib/api', async () => {
  class ApiError extends Error {
    constructor(
      readonly code: string,
      message: string,
    ) {
      super(message);
    }
  }
  return { ApiError, callFunction: (...args: unknown[]) => call.fn(...args) };
});

interface Row {
  seq: number;
  type: string;
  actor_id: string | null;
  payload: unknown;
  visibility: string;
  owner_id: string | null;
}

const plusOne = (seq: number, visibility = 'public'): Row => ({
  seq,
  type: 'fate.adjusted',
  actor_id: 'gm',
  payload: { target: 'gm_pool', delta: 1, reason: 'manual' },
  visibility,
  owner_id: null,
});

/**
 * 가짜 Supabase. 조회는 보낸 순간의 서버 상태를 찍어 두고, 테스트가 release()할 때 돌려준다.
 * 실시간 수신은 push()로 흉내 낸다. RLS처럼 'gm' 이벤트는 조회·수신 모두에서 빠진다.
 */
function fakeServer() {
  const rows: Row[] = [];
  const queries: Array<{ after: number; release: () => void }> = [];
  let onInsert: (msg: { new: Row }) => void = () => {};
  let onStatus: (status: string) => void = () => {};
  const visible = (r: Row) => r.visibility === 'public';

  const sb = {
    from: () => {
      let after = 0;
      const q = {
        select: () => q,
        eq: () => q,
        order: () => q,
        gt: (_col: string, v: number) => {
          after = v;
          return q;
        },
        limit: () =>
          new Promise((resolve) => {
            const snapshot = rows.filter((r) => r.seq > after && visible(r));
            queries.push({ after, release: () => resolve({ data: snapshot, error: null }) });
          }),
      };
      return q;
    },
    channel: () => {
      const ch = {
        on: (_e: string, _f: unknown, cb: typeof onInsert) => {
          onInsert = cb;
          return ch;
        },
        subscribe: (cb: typeof onStatus) => {
          onStatus = cb;
          return ch;
        },
      };
      return ch;
    },
    removeChannel: async () => {},
  } as unknown as SupabaseClient;

  return {
    sb,
    queries,
    /** 서버에 기록만 한다 (실시간 전달 전) */
    write(...rs: Row[]) {
      rows.push(...rs);
    },
    /** 실시간으로 전달한다 */
    deliver(r: Row) {
      if (visible(r)) onInsert({ new: r });
    },
    subscribed: () => onStatus('SUBSCRIBED'),
    async releaseNext() {
      const q = queries.shift();
      if (!q) throw new Error('no pending query');
      q.release();
      await flush();
    },
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

async function started() {
  const server = fakeServer();
  const room = new RemoteRoom(server.sb, 'room', 'me');
  const start = room.start();
  await flush();
  await server.releaseNext();
  await start;
  return { server, room };
}

describe('RemoteRoom realtime vs refill', () => {
  it('does not apply an event twice when a stale refill lands after realtime', async () => {
    const { server, room } = await started();
    // 다시 연결되어 재조회를 보냈는데, 응답이 오기 전에 실시간 이벤트가 먼저 도착한다
    server.write(plusOne(1), plusOne(2), plusOne(3));
    server.subscribed();
    await flush();
    for (const seq of [1, 2, 3]) server.deliver(plusOne(seq));
    expect(room.getSnapshot().state.gmPool).toBe(3);

    await server.releaseNext();
    const snap = room.getSnapshot();
    expect(snap.state.gmPool).toBe(3);
    expect(snap.events.map((e) => e.seq)).toEqual([1, 2, 3]);

    // 커서가 뒤로 가지 않았으니 다음 이벤트도 한 번만 붙는다
    server.write(plusOne(4));
    server.deliver(plusOne(4));
    expect(room.getSnapshot().state.gmPool).toBe(4);
    expect(server.queries).toHaveLength(0);
  });

  it('applies a partly stale refill only from where realtime left off', async () => {
    const { server, room } = await started();
    server.write(plusOne(1), plusOne(2), plusOne(3));
    server.subscribed();
    await flush();
    server.deliver(plusOne(1));
    await server.releaseNext();
    expect(room.getSnapshot().state.gmPool).toBe(3);
    expect(room.getSnapshot().events.map((e) => e.seq)).toEqual([1, 2, 3]);
  });

  it('reads again when an event arrives behind a hidden gap during a refill', async () => {
    const { server, room } = await started();
    server.write(plusOne(1));
    server.subscribed();
    await flush();
    // 조회가 나간 뒤 GM 전용 이벤트(2)와 공개 이벤트(3)가 기록된다
    server.write(plusOne(2, 'gm'), plusOne(3));
    server.deliver(plusOne(3));
    await server.releaseNext(); // 이 응답에는 1만 있다
    expect(room.getSnapshot().events.map((e) => e.seq)).toEqual([1]);
    // 3 앞의 빈 자리 때문에 한 번 더 읽는다
    expect(server.queries).toHaveLength(1);
    await server.releaseNext();
    expect(room.getSnapshot().events.map((e) => e.seq)).toEqual([1, 3]);
    expect(room.getSnapshot().state.gmPool).toBe(2);
  });
});

describe('RemoteRoom command resend', () => {
  it('resends with the same command id when the response is lost', async () => {
    const { server, room } = await started();
    const { ApiError } = await import('@/lib/api');
    call.fn.mockReset();
    call.fn
      .mockRejectedValueOnce(new ApiError('NETWORK', 'lost'))
      .mockResolvedValueOnce({ events: [{ ...plusOne(1), actorId: 'gm', seq: 1 }] });
    server.write(plusOne(1));
    // 서버는 처리했고 실시간으로 먼저 도착한다
    server.deliver(plusOne(1));
    await room.run({ type: 'fate.adjust', payload: { target: 'gm_pool', delta: 1 } });
    const [first, second] = call.fn.mock.calls.map((c) => c[1] as { clientCmdId: string });
    expect(second!.clientCmdId).toBe(first!.clientCmdId);
    expect(room.getSnapshot().state.gmPool).toBe(1);
  });

  it('does not resend on a rule error', async () => {
    const { room } = await started();
    const { ApiError } = await import('@/lib/api');
    call.fn.mockReset();
    call.fn.mockRejectedValueOnce(new ApiError('INVALID', 'nope'));
    await expect(
      room.run({ type: 'fate.adjust', payload: { target: 'gm_pool', delta: 1 } }),
    ).rejects.toThrow('nope');
    expect(call.fn).toHaveBeenCalledTimes(1);
  });
});
