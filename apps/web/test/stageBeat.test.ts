import { initialState, type RoomEvent, type RoomState } from '@fate/rules-engine';
import { describe, expect, it } from 'vitest';
import { beatOf, moodOf } from '../src/components/scene/stageBeat';

const pc = (id: string, ownerId: string, name = id) =>
  ({ id, name, isNpc: false, ownerId }) as RoomState['characters'][string];

function room(): RoomState {
  const s = initialState();
  return {
    ...s,
    members: {
      gm: { userId: 'gm', nickname: 'GM', role: 'gm' },
      p1: { userId: 'p1', nickname: '하윤', role: 'player' },
    } as unknown as RoomState['members'],
    characters: {
      knight: pc('knight', 'p1', '하윤'),
      boss: { ...pc('boss', 'gm', '도적 두목'), isNpc: true, ownerId: null },
    },
  };
}

const chat = (seq: number, actorId: string, text: string, as?: string) =>
  ({
    seq,
    type: 'chat.posted',
    actorId,
    payload: as ? { text, as } : { text },
    visibility: 'public',
  }) as RoomEvent;

const nobody = { userId: 'me', character: null };

describe('무대의 박자', () => {
  it('플레이어 말은 그 플레이어의 캐릭터가 한다', () => {
    const b = beatOf(chat(1, 'p1', '가자!'), room(), [], nobody);
    expect(b).toMatchObject({ characterId: 'knight', kind: 'say', text: '가자!' });
  });

  it('GM이 NPC 이름으로 말하면 그 NPC가, 그냥 말하면 아무도 서지 않는다', () => {
    expect(beatOf(chat(1, 'gm', '흥', '도적 두목'), room(), [], nobody)?.characterId).toBe('boss');
    expect(beatOf(chat(2, 'gm', '다들 준비됐나요?'), room(), [], nobody)).toBeNull();
  });

  it('강요 수락은 강요받은 캐릭터의 박자', () => {
    const offer = {
      seq: 1,
      type: 'compel.offered',
      actorId: 'gm',
      payload: { compelId: 'c1', aspectId: 'a', targetId: 'knight', text: '맹세' },
      visibility: 'public',
    } as RoomEvent;
    const yes = {
      seq: 2,
      type: 'compel.accepted',
      actorId: 'p1',
      payload: { compelId: 'c1' },
      visibility: 'public',
    } as RoomEvent;
    expect(beatOf(yes, room(), [offer, yes], nobody)).toMatchObject({
      characterId: 'knight',
      kind: 'compel',
    });
  });

  it('말투로 표정을 짐작한다', () => {
    expect(moodOf('뭐라고?!')).toContain('surprised');
    expect(moodOf('ㅋㅋ 좋네')).toContain('smile');
    expect(moodOf('용서 못 해!!')).toContain('angry');
    expect(moodOf('그래.')).toEqual([]);
  });
});
