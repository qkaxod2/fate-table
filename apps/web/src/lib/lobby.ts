import type { SupabaseClient } from '@supabase/supabase-js';
import { callFunction } from './api';

/** 이 브라우저에서 쓴 닉네임과 들어갔던 방 (편의용, 진짜 목록은 서버에 있다) */
const NICK = 'fate.nickname';
const ROOMS = 'fate.myRooms';

export interface RecentRoom {
  id: string;
  name: string;
  role: string;
  at: string;
}

export function loadNickname(): string {
  try {
    return localStorage.getItem(NICK) ?? '';
  } catch {
    return '';
  }
}

export function saveNickname(v: string): void {
  try {
    localStorage.setItem(NICK, v);
  } catch {
    // 무시
  }
}

export function loadRecentRooms(): RecentRoom[] {
  try {
    return JSON.parse(localStorage.getItem(ROOMS) ?? '[]') as RecentRoom[];
  } catch {
    return [];
  }
}

export function rememberRoom(r: Omit<RecentRoom, 'at'>): void {
  try {
    const rest = loadRecentRooms().filter((x) => x.id !== r.id);
    localStorage.setItem(
      ROOMS,
      JSON.stringify([{ ...r, at: new Date().toISOString() }, ...rest].slice(0, 10)),
    );
  } catch {
    // 무시
  }
}

/** 나갔거나 없어진 방을 이 브라우저 기록에서도 지운다 */
export function forgetRoom(id: string): void {
  try {
    localStorage.setItem(ROOMS, JSON.stringify(loadRecentRooms().filter((x) => x.id !== id)));
  } catch {
    // 무시
  }
}

/** 방에서 나가기. 내 목록에서 빠지고, 초대 코드로 다시 들어올 수 있다 */
export async function leaveRoom(id: string): Promise<void> {
  await callFunction('leave', { roomId: id });
  forgetRoom(id);
}

/** 방 터트리기 (GM만). 방과 기록이 모두 지워지고 접속 중인 사람은 내보내진다 */
export async function closeRoom(id: string): Promise<void> {
  await callFunction('close', { roomId: id });
  forgetRoom(id);
}

export function roomHref(id: string): string {
  return `/room/?id=${encodeURIComponent(id)}`;
}

export interface MyRoom {
  id: string;
  name: string;
  role: string;
  nickname: string;
  inviteCode: string;
  joinedAt: string;
}

/**
 * 서버에 기록된 "내가 들어간 방". 이미 익명 세션이 있을 때만 묻는다
 * (목록을 보려고 새 익명 계정을 만들지는 않는다). 세션이 없으면 null.
 */
export async function fetchMyRooms(sb: SupabaseClient): Promise<MyRoom[] | null> {
  const { data: auth } = await sb.auth.getSession();
  const uid = auth.session?.user.id;
  if (!uid) return null;
  const { data, error } = await sb
    .from('room_members')
    .select('room_id, role, nickname, joined_at, rooms(name, invite_code)')
    .eq('user_id', uid)
    .order('joined_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).flatMap((row) => {
    const room = (Array.isArray(row.rooms) ? row.rooms[0] : row.rooms) as
      { name: string; invite_code: string } | null | undefined;
    if (!room) return [];
    return [
      {
        id: row.room_id as string,
        name: room.name,
        role: row.role as string,
        nickname: row.nickname as string,
        inviteCode: room.invite_code,
        joinedAt: row.joined_at as string,
      },
    ];
  });
}

export const ROLE_LABEL: Record<string, string> = {
  gm: 'GM',
  player: '플레이어',
  spectator: '관전',
};
