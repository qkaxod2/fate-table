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
  const byKey = new Map<string, CharacterDraft>();
  for (const c of [...data.map((r) => r.data as CharacterDraft), ...local])
    if (!byKey.has(c.key)) byKey.set(c.key, c);
  return [...byKey.values()].sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}
