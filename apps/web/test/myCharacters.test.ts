import { describe, expect, it } from 'vitest';
import { type CharacterDraft, mergeCharacters } from '@/lib/myCharacters';

const draft = (key: string, name: string, savedAt: string): CharacterDraft => ({
  key,
  name,
  savedAt,
  isNpc: false,
  highConcept: '망한 왕국의 마지막 기사',
  approaches: { careful: 1, clever: 0, flashy: 2, forceful: 3, quick: 2, sneaky: 1 },
  stunts: [],
  aspects: [],
});

describe('mergeCharacters', () => {
  it('같은 키는 나중에 저장한 판을 남긴다', () => {
    const server = [draft('a', '하윤', '2026-11-01T00:00:00Z')];
    const local = [draft('a', '하윤 (고침)', '2026-11-02T00:00:00Z')];
    expect(mergeCharacters(server, local).map((c) => c.name)).toEqual(['하윤 (고침)']);
    expect(mergeCharacters(local, server).map((c) => c.name)).toEqual(['하윤 (고침)']);
  });

  it('최근 저장 순으로 늘어놓는다', () => {
    const list = mergeCharacters(
      [draft('a', '하윤', '2026-11-01T00:00:00Z')],
      [draft('b', '세라', '2026-11-03T00:00:00Z'), draft('c', '도윤', '2026-11-02T00:00:00Z')],
    );
    expect(list.map((c) => c.key)).toEqual(['b', 'c', 'a']);
  });
});
