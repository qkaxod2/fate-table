import type { Aspect, Character } from '@fate/rules-engine';
import { describe, expect, it } from 'vitest';
import type { CharacterDraft } from '@/lib/myCharacters';
import { characterToText, draftToText } from '@/lib/sheetText';

const approaches = { careful: 1, clever: 3, flashy: 0, forceful: 2, quick: 1, sneaky: 2 };

describe('draftToText', () => {
  it('저장한 캐릭터를 붙여 넣을 글로 옮긴다', () => {
    const d: CharacterDraft = {
      key: 'k1',
      savedAt: '2026-11-21T00:00:00Z',
      name: '세라',
      isNpc: false,
      approaches,
      highConcept: '떠돌이 연금술사',
      trouble: '빚쟁이에게 쫓긴다',
      aspects: ['스승의 낡은 공책', ''],
      stunts: [
        {
          id: 's1',
          text: '즉석 조합',
          kind: 'bonus',
          bonus: { approach: 'clever', action: 'create_advantage', value: 2 },
        },
      ],
      backstory: '북쪽 항구에서 왔다.',
    };
    expect(draftToText(d)).toBe(
      [
        '세라',
        '',
        '핵심 컨셉: 떠돌이 연금술사',
        '약점: 빚쟁이에게 쫓긴다',
        '특성: 스승의 낡은 공책',
        '',
        '접근법: 신중 +1 · 지략 +3 · 화려 +0 · 완력 +2 · 신속 +1 · 은밀 +2',
        '재충전: 3',
        '',
        '특기',
        '- 즉석 조합: 지략으로 이점 만들기할 때 +2',
        '',
        '지나온 이야기',
        '북쪽 항구에서 왔다.',
      ].join('\n'),
    );
  });
});

describe('characterToText', () => {
  it('방 안의 운명점 · 스트레스 · 후유증까지 담는다', () => {
    const asp = (id: string, kind: Aspect['kind'], text: string): Aspect => ({
      id,
      ownerType: 'character',
      ownerId: 'c1',
      kind,
      text,
      freeInvokes: 0,
      hidden: false,
    });
    const c: Character = {
      id: 'c1',
      name: '세라',
      isNpc: false,
      ownerId: 'u1',
      approaches,
      stunts: [{ id: 's1', text: '한 번 더', kind: 'once_per_session' }],
      refresh: 3,
      fatePoints: 2,
      stress: [true, false, false],
      consequences: { mild: { aspectId: 'a3', recovering: true } },
    };
    const text = characterToText(c, [
      asp('a1', 'high', '떠돌이 연금술사'),
      asp('a3', 'consequence', '그을린 팔'),
      { ...asp('x', 'high', '남의 것'), ownerId: 'c2' },
    ]);
    expect(text).toContain('핵심 컨셉: 떠돌이 연금술사');
    expect(text).not.toContain('남의 것');
    expect(text).toContain('운명점: 2 (재충전 3)');
    expect(text).toContain('스트레스: ■□□');
    expect(text).toContain('- 경상(2): 그을린 팔 (회복 중)');
    expect(text).toContain('- 중상(4): 비어 있음');
    expect(text).toContain('- 한 번 더: 세션당 1회');
    expect(text).not.toContain('지나온 이야기');
  });
});
