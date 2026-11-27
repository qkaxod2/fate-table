import { initialState, type RoomEvent, type RoomState } from '@fate/rules-engine';
import { describe as group, expect, it } from 'vitest';
import { describe } from '../src/lib/copy';

const pc = (id: string, ownerId: string, name: string) =>
  ({ id, name, isNpc: false, ownerId }) as RoomState['characters'][string];

const room: RoomState = {
  ...initialState(),
  members: {
    gm: { userId: 'gm', nickname: '마스터', role: 'gm' },
    p1: { userId: 'p1', nickname: '닉네임', role: 'player' },
  } as unknown as RoomState['members'],
  characters: { knight: pc('knight', 'p1', '아르센') },
};

const chat = (actorId: string, payload: Record<string, unknown>) =>
  ({ seq: 1, type: 'chat.posted', actorId, payload, visibility: 'public' }) as RoomEvent;

group('채팅 기록의 말한 사람', () => {
  it('플레이어가 캐릭터로 한 말은 캐릭터 이름으로 적는다', () => {
    expect(describe(chat('p1', { text: '가자!' }), room)?.text).toBe('아르센: 가자!');
  });

  it('잡담과 귓속말은 닉네임으로 적는다', () => {
    expect(describe(chat('p1', { text: 'ㅋㅋ', ooc: true }), room)?.text).toBe('닉네임: ㅋㅋ');
    expect(describe(chat('p1', { text: '몰래', whisper: 'gm' }), room)?.text).toBe(
      '닉네임 → GM: 몰래',
    );
  });

  it('캐릭터가 없는 플레이어와 GM은 닉네임으로 적는다', () => {
    expect(describe(chat('gm', { text: '시작할게요' }), room)?.text).toBe('마스터: 시작할게요');
    expect(describe(chat('gm', { text: '흥', as: '두목' }), room)?.text).toBe('두목: 흥');
  });
});
