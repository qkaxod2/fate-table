// 명령 처리: 파싱 → 로그인 확인 → handleCommand (참가자 확인 → 재전송 확인 → resolve → append_events)
// 요청: { roomId, clientCmdId, command }  응답: { events: [{seq, ...}] }
import { parseCommand } from '../_shared/engine.js';
import {
  admin,
  appendEvents,
  CORS,
  currentUser,
  fail,
  loadEvents,
  ok,
  readJson,
} from '../_shared/http.ts';
import { handleCommand, type Store } from './handle.ts';

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

  const user = await currentUser(req).catch(() => null);
  if (!user) return fail(401, 'NOT_SIGNED_IN', '로그인이 필요해요.');

  const db = admin();
  const range = (row: { first_seq: unknown; last_seq: unknown } | null) =>
    row ? ([Number(row.first_seq), Number(row.last_seq)] as const) : null;
  const store: Store = {
    async memberRole() {
      const { data } = await db
        .from('room_members')
        .select('role')
        .eq('room_id', roomId)
        .eq('user_id', user.id)
        .maybeSingle();
      return data?.role ?? null;
    },
    async findCommand() {
      const { data, error } = await db
        .from('command_log')
        .select('first_seq, last_seq')
        .eq('room_id', roomId)
        .eq('client_cmd', clientCmd)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return range(data);
    },
    async readHistory() {
      const [history, { data: seals }] = await Promise.all([
        loadEvents(db, roomId),
        db.from('sealed_rolls').select('roll_id, side').eq('room_id', roomId),
      ]);
      return { history, sealed: new Map((seals ?? []).map((s) => [s.roll_id, s.side])) };
    },
    async undoGroup(seq) {
      const { data } = await db
        .from('command_log')
        .select('first_seq, last_seq')
        .eq('room_id', roomId)
        .lte('first_seq', seq)
        .gte('last_seq', seq)
        .maybeSingle();
      return range(data);
    },
    async seal(rollId, side) {
      await db.from('sealed_rolls').upsert({ room_id: roomId, roll_id: rollId, side });
    },
    append: (expected, events) => appendEvents(db, roomId, expected, events, clientCmd),
    loadRange: (first, last) => loadEvents(db, roomId, first - 1, last),
  };

  const out = await handleCommand(user.id, command, store, {
    int: cryptoInt,
    uuid: () => crypto.randomUUID(),
  });
  return out.status === 200 ? ok({ events: out.events }) : fail(out.status, out.code, out.message);
});
