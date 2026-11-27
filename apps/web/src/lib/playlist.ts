// GM의 유튜브 플레이리스트. 이 브라우저에 두고, JSON 파일로 내려받거나 올려서 옮긴다.

export interface PlaylistItem {
  /** 유튜브 영상 id (11자) */
  id: string;
  title?: string;
}

const ID = /^[\w-]{11}$/;

/** 유튜브 주소(또는 영상 id)에서 영상 id를 꺼낸다. 유튜브가 아니면 null */
export function parseYoutube(input: string): string | null {
  const s = input.trim();
  if (ID.test(s)) return s;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^(www|m|music)\./, '');
  let id: string | null = null;
  if (host === 'youtu.be') id = u.pathname.split('/')[1] ?? null;
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    id = u.searchParams.get('v');
    const m = u.pathname.match(/^\/(?:shorts|embed|live|v)\/([^/?#]+)/);
    if (!id && m) id = m[1] ?? null;
  }
  return id && ID.test(id) ? id : null;
}

export const youtubeUrl = (id: string) => `https://youtu.be/${id}`;

const KEY = 'fate.playlist';
const CHAIN_KEY = 'fate.playlist.chain';

export interface PlaylistState {
  items: PlaylistItem[];
  /** 곡이 끝나면 다음 곡을 모두에게 튼다 */
  chain: boolean;
}

let state: PlaylistState | null = null;
const subs = new Set<() => void>();
const EMPTY: PlaylistState = { items: [], chain: true };

/** 목록은 GM 판과 방 화면(이어 틀기)이 함께 본다. 이 브라우저에 남는다 */
export function getPlaylist(): PlaylistState {
  if (typeof window === 'undefined') return EMPTY;
  if (!state) {
    state = { ...EMPTY };
    try {
      state.items = readPlaylist(JSON.parse(localStorage.getItem(KEY) ?? '[]'));
      state.chain = localStorage.getItem(CHAIN_KEY) !== '0';
    } catch {
      // 저장이 막힌 브라우저에서는 이번 화면에서만 쓴다
    }
  }
  return state;
}

export const serverPlaylist = () => EMPTY;

export function setPlaylist(next: Partial<PlaylistState>): void {
  state = { ...getPlaylist(), ...next };
  try {
    localStorage.setItem(KEY, JSON.stringify(state.items));
    localStorage.setItem(CHAIN_KEY, state.chain ? '1' : '0');
  } catch {
    // 위와 같다
  }
  subs.forEach((fn) => fn());
}

export function subscribePlaylist(fn: () => void): () => void {
  subs.add(fn);
  return () => void subs.delete(fn);
}

/** 끝난 곡 다음에 틀 곡 (목록에 없거나 한 곡뿐이면 없다) */
export function nextInPlaylist(items: PlaylistItem[], id: string): PlaylistItem | null {
  if (items.length < 2) return null;
  const i = items.findIndex((t) => t.id === id);
  return i < 0 ? null : items[(i + 1) % items.length]!;
}

/** 내려받을 JSON. 다른 사람이 읽어도 알 수 있게 주소로 적는다 */
export function playlistJson(items: PlaylistItem[]): string {
  return JSON.stringify(
    {
      version: 1,
      tracks: items.map((t) => ({ url: youtubeUrl(t.id), ...(t.title ? { title: t.title } : {}) })),
    },
    null,
    2,
  );
}

/**
 * 올린 JSON을 읽는다. { tracks: [...] } 이나 그냥 배열, 각 곡은 주소 문자열이나
 * { url | id, title } 을 받는다. 읽을 수 없는 곡은 건너뛰고, 같은 영상은 한 번만 담는다.
 */
export function readPlaylist(data: unknown): PlaylistItem[] {
  const list: unknown[] = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && Array.isArray((data as { tracks?: unknown }).tracks)
      ? (data as { tracks: unknown[] }).tracks
      : [];
  const out: PlaylistItem[] = [];
  for (const t of list) {
    let id: string | null = null;
    let title: unknown;
    if (typeof t === 'string') id = parseYoutube(t);
    else if (t && typeof t === 'object') {
      const o = t as { url?: unknown; id?: unknown; title?: unknown };
      const src = typeof o.url === 'string' ? o.url : typeof o.id === 'string' ? o.id : '';
      id = parseYoutube(src);
      title = o.title;
    }
    if (!id || out.some((x) => x.id === id)) continue;
    const name = typeof title === 'string' ? title.trim().slice(0, 80) : '';
    out.push(name ? { id, title: name } : { id });
  }
  return out;
}

/** 지금 목록 뒤에 새 곡들을 붙인다 (이미 있는 영상은 건너뛴다) */
export function mergePlaylist(a: PlaylistItem[], b: PlaylistItem[]): PlaylistItem[] {
  return [...a, ...b.filter((t) => !a.some((x) => x.id === t.id))];
}
