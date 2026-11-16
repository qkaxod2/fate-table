import type { Command } from '@fate/rules-engine';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabase } from './supabase';

/**
 * 캐릭터 만들기에서 저장한 캐릭터. 이 브라우저에 두고, 세션(익명 포함)이 있으면 계정의
 * 보관함(saved_characters)에도 올려서 다른 기기에서도 데려올 수 있게 한다.
 */
export type CharacterDraft = Extract<Command, { type: 'character.create' }>['payload'] & {
  key: string;
  portraitUrl?: string;
  savedAt: string;
};

const KEY = 'fate.myCharacters';

export function loadMyCharacters(): CharacterDraft[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as CharacterDraft[]) : [];
  } catch {
    return [];
  }
}

export function saveMyCharacter(c: CharacterDraft): void {
  try {
    const rest = loadMyCharacters().filter((x) => x.key !== c.key);
    localStorage.setItem(KEY, JSON.stringify([c, ...rest].slice(0, 20)));
  } catch {
    // 저장소를 못 쓰는 환경(사생활 보호 모드 등)에서는 조용히 넘어간다
  }
  const sb = getSupabase();
  if (sb) void pushCharacters(sb, [c]).catch(() => undefined);
}

async function sessionUser(sb: SupabaseClient): Promise<string | null> {
  const { data } = await sb.auth.getSession();
  return data.session?.user.id ?? null;
}

async function pushCharacters(sb: SupabaseClient, list: CharacterDraft[]): Promise<void> {
  const uid = await sessionUser(sb);
  if (!uid || list.length === 0) return;
  const { error } = await sb
    .from('saved_characters')
    .upsert(list.map((c) => ({ user_id: uid, key: c.key, data: c, saved_at: c.savedAt })));
  if (error) throw error;
}

/** 로그인하면 이 브라우저에만 있던 캐릭터를 계정에 올린다 */
export function uploadLocalCharacters(sb: SupabaseClient): Promise<void> {
  return pushCharacters(sb, loadMyCharacters());
}

/** 같은 키가 둘이면 나중에 저장한 쪽을 남긴다 (고친 직후 서버에 아직 옛 판이 있을 수 있다) */
export function mergeCharacters(...lists: CharacterDraft[][]): CharacterDraft[] {
  const byKey = new Map<string, CharacterDraft>();
  for (const c of lists.flat()) {
    const had = byKey.get(c.key);
    if (!had || had.savedAt < c.savedAt) byKey.set(c.key, c);
  }
  return [...byKey.values()].sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

/** 계정 보관함과 이 브라우저의 캐릭터를 합친 목록 (최근 저장 순) */
export async function listMyCharacters(): Promise<CharacterDraft[]> {
  const local = loadMyCharacters();
  const sb = getSupabase();
  if (!sb || !(await sessionUser(sb))) return local;
  const { data, error } = await sb
    .from('saved_characters')
    .select('data')
    .order('saved_at', { ascending: false })
    .limit(50);
  if (error) return local;
  return mergeCharacters(
    data.map((r) => r.data as CharacterDraft),
    local,
  );
}

/** 저장한 캐릭터 하나 (계정 보관함 포함) */
export async function findMyCharacter(key: string): Promise<CharacterDraft | null> {
  return (await listMyCharacters()).find((c) => c.key === key) ?? null;
}

/**
 * 저장한 캐릭터를 지운다. 계정 보관함에서 먼저 지우고, 거기서 실패하면 이 브라우저의 것도
 * 남겨 둔다 (한쪽만 지우면 다음 목록에서 다시 살아난다).
 */
export async function deleteMyCharacter(key: string): Promise<void> {
  const sb = getSupabase();
  if (sb && (await sessionUser(sb))) {
    const { error } = await sb.from('saved_characters').delete().eq('key', key);
    if (error) throw error;
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(loadMyCharacters().filter((x) => x.key !== key)));
  } catch {
    // 저장소를 못 쓰는 환경
  }
}

/** 같은 내용을 새 키로 저장한다. 같은 캐릭터를 조금 바꾼 판을 만들 때 */
export function copyMyCharacter(c: CharacterDraft): CharacterDraft {
  const copy: CharacterDraft = {
    ...c,
    key: crypto.randomUUID(),
    name: `${c.name} 사본`.slice(0, 40),
    savedAt: new Date().toISOString(),
  };
  saveMyCharacter(copy);
  return copy;
}
