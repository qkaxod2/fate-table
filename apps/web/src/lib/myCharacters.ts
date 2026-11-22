import type { Aspect, Character, Command } from '@fate/rules-engine';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ensureSession, getSupabase } from './supabase';

/**
 * 캐릭터 만들기에서 저장한 캐릭터. 이 브라우저에 두고, 계정의 보관함(saved_characters)에도
 * 올린다. 로그인하지 않았으면 익명 세션을 만들어 올리고(운영자 화면에서도 보인다),
 * 나중에 로그인하면 익명 기록이 계정으로 옮겨진다.
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
  if (list.length === 0) return;
  await ensureSession(sb);
  const uid = await sessionUser(sb);
  if (!uid) return;
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
  if (!sb) return local;
  // 이 브라우저에만 있던 캐릭터가 있으면 익명 세션을 만들어서라도 올린다
  if (local.length > 0) await ensureSession(sb).catch(() => undefined);
  if (!(await sessionUser(sb))) return local;
  const { data, error } = await sb
    .from('saved_characters')
    .select('data')
    .order('saved_at', { ascending: false })
    .limit(50);
  if (error) return local;
  const remote = data.map((r) => r.data as CharacterDraft);
  // 서버에 없거나 서버 판보다 나중에 고친 것만 올린다 (다른 기기에서 고친 판을 덮지 않게)
  const savedAt = new Map(remote.map((c) => [c.key, c.savedAt]));
  const stale = local.filter((c) => {
    const at = savedAt.get(c.key);
    return at === undefined || at < c.savedAt;
  });
  if (stale.length > 0) void pushCharacters(sb, stale).catch(() => undefined);
  return mergeCharacters(remote, local);
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

/**
 * 방에서 자란 캐릭터(이정표로 바뀐 접근법·특기·특성·지나온 이야기)를 보관함 초안으로 옮긴다.
 * 데려온 초안이 있으면 그 키에 덮어쓰고, 없으면 새로 만든다. 이번 판 상태(스트레스·후유증·운명점)는 옮기지 않는다.
 */
export function draftFromCharacter(
  c: Character,
  aspects: readonly Aspect[],
  base?: CharacterDraft | null,
): CharacterDraft {
  const own = aspects.filter((a) => a.ownerType === 'character' && a.ownerId === c.id && !a.hidden);
  const high = own.find((a) => a.kind === 'high')?.text ?? base?.highConcept ?? c.name;
  const trouble = own.find((a) => a.kind === 'trouble')?.text ?? base?.trouble;
  const rest = own.filter((a) => a.kind === 'normal').map((a) => a.text);
  const portraitUrl = c.portraitUrl ?? base?.portraitUrl;
  const backstory = c.backstory ?? base?.backstory;
  return {
    ...(base ?? {}),
    key: c.sourceKey ?? base?.key ?? crypto.randomUUID(),
    savedAt: new Date().toISOString(),
    name: c.name,
    isNpc: false,
    approaches: c.approaches,
    stunts: c.stunts.map(({ usedThisSession: _u, ...s }) => s),
    highConcept: high,
    ...(trouble ? { trouble } : {}),
    aspects: rest.length > 0 ? rest.slice(0, 3) : (base?.aspects ?? []),
    ...(backstory ? { backstory } : {}),
    ...(portraitUrl ? { portraitUrl } : {}),
  };
}
