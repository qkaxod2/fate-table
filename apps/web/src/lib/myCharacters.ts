import type { Command } from '@fate/rules-engine';

/** 캐릭터 만들기에서 저장한 캐릭터. 방이 열리기 전까지는 이 브라우저에만 둔다. */
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
}
