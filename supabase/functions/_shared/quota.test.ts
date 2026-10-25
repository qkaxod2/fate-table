// deno test: 사용량 예약 흐름. reserve_media_usage RPC와 media_usage 테이블을 흉내 낸다.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { withUsage, type QuotaInput } from './quota.ts';

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

/** 한도 검사와 기록이 한 번에 일어나는 가짜 DB. rpcError를 주면 RPC가 실패한다 */
function fakeDb(opts: { rpcError?: string } = {}) {
  const rows = new Map<number, { kind: string; path?: string }>();
  let next = 1;
  const db = {
    rpc(_name: string, a: { p_kinds: string[]; p_kind: string; p_limit: number }) {
      if (opts.rpcError) return Promise.resolve({ data: null, error: { message: opts.rpcError } });
      const used = [...rows.values()].filter((r) => a.p_kinds.includes(r.kind)).length;
      if (used >= a.p_limit) return Promise.resolve({ data: null, error: null });
      const id = next++;
      rows.set(id, { kind: a.p_kind });
      return Promise.resolve({ data: id, error: null });
    },
    from: () => ({
      delete: () => ({
        eq: (_c: string, id: number) => {
          rows.delete(id);
          return Promise.resolve({ error: null });
        },
      }),
      update: (patch: { path: string }) => ({
        eq: (_c: string, id: number) => {
          const r = rows.get(id);
          if (r) r.path = patch.path;
          return Promise.resolve({ error: null });
        },
      }),
    }),
  } as unknown as SupabaseClient;
  return { db, rows };
}

const Q: QuotaInput = {
  userId: 'u',
  group: 'image',
  kinds: ['portrait'],
  kind: 'portrait',
  limit: 1,
};
const refuse = (reason: string) => new Response(reason, { status: 429 });

Deno.test('only one of two concurrent requests passes when one use is left', async () => {
  const { db, rows } = fakeDb();
  let calls = 0;
  const gen = (keep: (p?: string) => void) =>
    new Promise<Response>((resolve) =>
      setTimeout(() => {
        calls++;
        keep('u/a.png');
        resolve(new Response('ok'));
      }, 5),
    );
  const [a, b] = await Promise.all([withUsage(db, Q, refuse, gen), withUsage(db, Q, refuse, gen)]);
  assert(calls === 1, `paid API called ${calls} times`);
  assert([a.status, b.status].sort().join() === '200,429', `${a.status} ${b.status}`);
  assert(rows.size === 1 && [...rows.values()][0]!.path === 'u/a.png', 'one usage row with path');
});

Deno.test('a failed generation gives the reservation back', async () => {
  const { db, rows } = fakeDb();
  const res = await withUsage(db, Q, refuse, () =>
    Promise.resolve(new Response('x', { status: 502 })),
  );
  assert(res.status === 502, 'passes the failure through');
  assert(rows.size === 0, 'reservation released');
  // 던져도 돌려놓는다
  await withUsage(db, Q, refuse, () => Promise.reject(new Error('boom'))).catch(() => {});
  assert(rows.size === 0, 'reservation released after a throw');
});

Deno.test('a usage lookup error refuses instead of counting as zero', async () => {
  const { db } = fakeDb({ rpcError: 'connection lost' });
  let called = false;
  const res = await withUsage(
    db,
    Q,
    (reason) => new Response(reason, { status: 503 }),
    () => {
      called = true;
      return Promise.resolve(new Response('ok'));
    },
  );
  assert(!called, 'paid API not called');
  assert(res.status === 503 && (await res.text()) === 'unavailable', 'refused as unavailable');
});
