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

export function roomHref(id: string): string {
  return `/room/?id=${encodeURIComponent(id)}`;
}
