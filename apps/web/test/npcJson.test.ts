import { describe, expect, it } from 'vitest';
import type { SavedNpc } from '@/lib/gmLibrary';
import { mergeNpcs, npcsJson, readNpcs } from '@/lib/npcJson';

const base = {
  name: '부두의 밀수꾼',
  isNpc: true,
  approaches: { careful: 0, clever: 1, flashy: 0, forceful: 2, quick: 1, sneaky: 3 },
  stunts: [],
  highConcept: '밤 부두의 칼잡이',
  aspects: ['빚진 게 많다'],
};

describe('npc json', () => {
  it('내려받은 JSON을 다시 올리면 같은 NPC들이 된다', () => {
    const items: SavedNpc[] = [
      { key: 'a', savedAt: '2026-11-27T00:00:00Z', npc: base },
      {
        key: 'b',
        savedAt: '2026-11-27T00:00:00Z',
        npc: { ...base, name: '경비대장', highConcept: '규칙대로', trouble: '뇌물에 약하다' },
      },
    ];
    expect(readNpcs(JSON.parse(npcsJson(items)))).toEqual(items.map((n) => n.npc));
  });

  it('배열·NPC 하나·보관함 행 꼴도 받고, 틀린 것과 겹치는 것은 건너뛴다', () => {
    expect(readNpcs(base)).toEqual([base]);
    expect(readNpcs([{ npc: base }])).toEqual([base]);
    const { isNpc: _i, ...noFlag } = base;
    expect(readNpcs([noFlag])).toEqual([base]);
    expect(
      readNpcs({
        npcs: [
          base,
          base,
          { name: '' },
          { ...base, name: '이름만', approaches: { careful: 99 } },
          3,
        ],
      }),
    ).toEqual([base]);
    expect(readNpcs('hello')).toEqual([]);
    expect(readNpcs(null)).toEqual([]);
  });

  it('방에 묶인 값은 떼어 낸다', () => {
    expect(readNpcs({ ...base, ownerId: 'u1', sourceKey: 'k1' })).toEqual([base]);
  });

  it('이미 있는 NPC에는 초상화만 덧입히고, 새 NPC는 새로 담는다', () => {
    const url = 'https://example.com/a.webp';
    const items: SavedNpc[] = [
      { key: 'a', savedAt: '2026-11-27T00:00:00Z', npc: base },
      {
        key: 'b',
        savedAt: '2026-11-27T00:00:00Z',
        npc: { ...base, name: '경비대장', portraitUrl: 'https://example.com/old.webp' },
      },
    ];
    const other = { ...base, name: '새 얼굴' };
    const got = readNpcs([
      { ...base, portraitUrl: url },
      { ...base, name: '경비대장', portraitUrl: url },
      other,
    ]);
    const { fresh, portraits } = mergeNpcs(items, got);
    expect(fresh).toEqual([other]);
    expect(portraits).toEqual([{ ...items[0], npc: { ...base, portraitUrl: url } }]);
  });
});
