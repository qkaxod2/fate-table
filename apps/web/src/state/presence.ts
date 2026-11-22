// 방의 접속 상태: 누가 들어와 있는지, 누가 글을 쓰는 중인지, 누가 방어를 고르는 중인지.
// 기록에 남길 일이 아니라서 이벤트로 쓰지 않고 Supabase Realtime Presence로 주고받는다.
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { useEffect, useRef, useState } from 'react';

/** 지금 하고 있는 일. 없으면 그냥 접속해 있는 것 */
export type Doing = 'typing' | 'defending' | null;

export interface PresenceInfo {
  nickname: string;
  doing: Doing;
}

/** 쓰다 멈추면 이만큼 뒤에 '쓰는 중'을 내린다 */
const TYPING_IDLE_MS = 4000;

/** userId → 상태. 같은 사람이 탭을 여러 개 열었으면 하나라도 하고 있는 일을 보여 준다 */
export function readPresence(
  raw: Record<string, Array<{ nickname?: unknown; doing?: unknown }>>,
): Record<string, PresenceInfo> {
  const out: Record<string, PresenceInfo> = {};
  for (const [userId, metas] of Object.entries(raw)) {
    const first = metas[0];
    if (!first) continue;
    const doing =
      (metas.find((m) => m.doing === 'defending')?.doing as Doing | undefined) ??
      (metas.find((m) => m.doing === 'typing')?.doing as Doing | undefined) ??
      null;
    out[userId] = { nickname: String(first.nickname ?? ''), doing };
  }
  return out;
}

/** '민수 님이 쓰는 중' 같은 한 줄. 나는 빼고, 없으면 null */
export function doingLine(
  presence: Record<string, PresenceInfo>,
  me: string,
  doing: Exclude<Doing, null>,
): string | null {
  const names = Object.entries(presence)
    .filter(([id, p]) => id !== me && p.doing === doing && p.nickname)
    .map(([, p]) => p.nickname);
  if (names.length === 0) return null;
  const who =
    names.length > 2
      ? `${names.slice(0, 2).join(', ')} 외 ${names.length - 2}명`
      : names.join(', ');
  return doing === 'typing' ? `${who} 님이 쓰는 중…` : `${who} 님이 방어를 고르는 중…`;
}

/**
 * 방에 접속해 있다고 알리고 다른 사람의 접속 상태를 받는다.
 * typing은 입력란 글이 바뀔 때마다 true로 부르면 되고, 멈추면 알아서 내려간다.
 */
export function usePresence(
  sb: SupabaseClient | null,
  roomId: string,
  userId: string,
  nickname: string | undefined,
  defending: boolean,
) {
  const [presence, setPresence] = useState<Record<string, PresenceInfo>>({});
  const channel = useRef<RealtimeChannel | null>(null);
  const joined = useRef(false);
  const [typing, setTyping] = useState(false);
  const idle = useRef<number | undefined>(undefined);
  const doing: Doing = defending ? 'defending' : typing ? 'typing' : null;
  // 접속하자마자(또는 다시 연결되자마자) 보낼 최신 상태
  const latest = useRef<PresenceInfo>({ nickname: nickname ?? '', doing });

  useEffect(() => {
    if (!sb) return;
    const ch = sb.channel(`presence:room:${roomId}`, { config: { presence: { key: userId } } });
    channel.current = ch;
    const sync = () => setPresence(readPresence(ch.presenceState() as never));
    ch.on('presence', { event: 'sync' }, sync)
      .on('presence', { event: 'join' }, sync)
      .on('presence', { event: 'leave' }, sync)
      .subscribe((status) => {
        joined.current = status === 'SUBSCRIBED';
        if (joined.current && latest.current.nickname) void ch.track(latest.current);
      });
    return () => {
      joined.current = false;
      channel.current = null;
      void sb.removeChannel(ch);
    };
  }, [sb, roomId, userId]);

  // 보낼 상태가 바뀌면 다시 알린다
  const nick = nickname ?? '';
  useEffect(() => {
    latest.current = { nickname: nick, doing };
    const ch = channel.current;
    if (ch && joined.current && nick) void ch.track(latest.current);
  }, [nick, doing]);

  useEffect(() => () => window.clearTimeout(idle.current), []);

  /** 입력란 글이 바뀔 때 부른다. 빈 글이면 바로 내린다 */
  const noteTyping = (text: string) => {
    window.clearTimeout(idle.current);
    if (!text.trim()) {
      setTyping(false);
      return;
    }
    setTyping(true);
    idle.current = window.setTimeout(() => setTyping(false), TYPING_IDLE_MS);
  };

  return { presence, noteTyping };
}
