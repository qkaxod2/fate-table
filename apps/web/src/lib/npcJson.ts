// NPC 보관함 JSON 내려받기·올리기. 보관함(gm_library)과 따로 두어 브라우저 없이도 시험한다.
import { parseCommand } from '@fate/rules-engine';
import type { NpcPayload, SavedNpc } from './gmLibrary';

/** 한 번에 올릴 수 있는 NPC 수 (보관함 목록이 100개까지 보인다) */
export const NPC_IMPORT_MAX = 100;

/** 내려받을 JSON. 다시 올리면 같은 NPC들이 된다 */
export function npcsJson(items: SavedNpc[]): string {
  return JSON.stringify({ version: 1, npcs: items.map((n) => n.npc) }, null, 2);
}

/**
 * 올린 JSON을 읽는다. { npcs: [...] } 이나 그냥 배열, NPC 하나만 든 객체도 받는다.
 * 각 NPC는 캐릭터 만들기 명령과 같은 꼴이고, 보관함 행처럼 { npc: {...} } 로 감싸도 된다.
 * 규칙에 맞지 않는 NPC는 건너뛰고, 같은 이름·하이 컨셉은 한 번만 담는다.
 */
export function readNpcs(data: unknown): NpcPayload[] {
  const list: unknown[] = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && Array.isArray((data as { npcs?: unknown }).npcs)
      ? (data as { npcs: unknown[] }).npcs
      : data && typeof data === 'object'
        ? [data]
        : [];
  const out: NpcPayload[] = [];
  for (const raw of list.slice(0, NPC_IMPORT_MAX)) {
    const o = raw && typeof raw === 'object' && 'npc' in raw ? (raw as { npc: unknown }).npc : raw;
    if (!o || typeof o !== 'object') continue;
    let npc: NpcPayload;
    try {
      // 방 상태에 묶인 값(주인·초안 키)은 떼고, 규칙 엔진의 검사를 그대로 쓴다
      const { ownerId: _o, sourceKey: _s, ...rest } = o as Record<string, unknown>;
      const cmd = parseCommand({ type: 'character.create', payload: { ...rest, isNpc: true } });
      if (cmd.type !== 'character.create') continue;
      npc = cmd.payload;
    } catch {
      continue;
    }
    if (out.some((x) => sameNpc(x, npc))) continue;
    out.push(npc);
  }
  return out;
}

/** 이름과 하이 컨셉이 같으면 같은 NPC로 본다 */
export function sameNpc(a: NpcPayload, b: NpcPayload): boolean {
  return a.name.trim() === b.name.trim() && a.highConcept.trim() === b.highConcept.trim();
}
