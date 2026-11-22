import { describe, expect, it } from 'vitest';
import { CommandError, resolveRoll } from '../src/index';
import { aspect, GM, P1, P2, pc, Table, withCharacters } from './helpers';

function table() {
  const t = new Table((s) => ({
    ...withCharacters(
      pc('a', 'u1', { fatePoints: 2 }),
      pc('b', 'u2', { fatePoints: 2 }),
      pc('npc', 'gm', { isNpc: true, ownerId: null }),
    )(s),
    aspects: {
      oath: aspect('oath', { text: '맹세를 어길 수 없다', ownerType: 'character', ownerId: 'a' }),
      bTrait: aspect('bt', { text: '남의 약점', ownerType: 'character', ownerId: 'b' }),
      fog: aspect('fog', { text: '짙은 안개' }),
    },
  }));
  t.run(GM, { type: 'scene.start', payload: { name: '부두' } });
  return t;
}

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    if (e instanceof CommandError) return e.code;
    throw e;
  }
  return undefined;
}

describe('self-compel', () => {
  it('a player proposes, the GM accepts and the player gets a fate point', () => {
    const t = table();
    t.run(P1, {
      type: 'compel.propose',
      payload: { aspectId: 'oath', characterId: 'a', text: '맹세 때문에 문을 열어 준다' },
    });
    const c = Object.values(t.state.compels)[0]!;
    expect(c).toMatchObject({ targetId: 'a', proposed: true });
    // 제안한 사람이 스스로 받아들일 수는 없다
    expect(
      codeOf(() =>
        t.run(P1, { type: 'compel.respond', payload: { compelId: c.id, accept: true } }),
      ),
    ).toBe('INVALID');
    expect(
      codeOf(() => t.run(P1, { type: 'compel.decide', payload: { compelId: c.id, accept: true } })),
    ).toBe('FORBIDDEN_ROLE');
    t.run(GM, { type: 'compel.decide', payload: { compelId: c.id, accept: true } });
    expect(t.state.characters.a!.fatePoints).toBe(3);
    expect(t.state.compels).toEqual({});
  });

  it('the GM can turn it down without cost', () => {
    const t = table();
    t.run(P1, {
      type: 'compel.propose',
      payload: { aspectId: 'fog', characterId: 'a', text: '안개 속에서 길을 잃는다' },
    });
    const c = Object.values(t.state.compels)[0]!;
    t.run(GM, { type: 'compel.decide', payload: { compelId: c.id, accept: false } });
    expect(t.state.characters.a!.fatePoints).toBe(2);
    expect(t.state.compels).toEqual({});
  });

  it('only for your own character and your own or scene aspects', () => {
    const t = table();
    const propose = (aspectId: string, characterId: string) =>
      codeOf(() =>
        t.run(P1, { type: 'compel.propose', payload: { aspectId, characterId, text: '꼬인다' } }),
      );
    expect(propose('oath', 'b')).toBe('FORBIDDEN_ROLE');
    expect(propose('bTrait', 'a')).toBe('INVALID');
  });
});

describe('teamwork', () => {
  it('an ally adds +1 once, and the roll total includes it', () => {
    const t = table();
    t.nextDice(0, 0, 0, 0).run(P1, {
      type: 'roll.request',
      payload: { characterId: 'a', action: 'overcome', approach: 'careful', difficulty: 2 },
    });
    const rollId = t.state.activeRollId!;
    const before = resolveRoll(t.state.rolls[rollId]!).total;
    t.run(P2, { type: 'roll.help', payload: { rollId, side: 'active', helperId: 'b' } });
    expect(resolveRoll(t.state.rolls[rollId]!).total).toBe(before + 1);
    expect(
      codeOf(() =>
        t.run(P2, { type: 'roll.help', payload: { rollId, side: 'active', helperId: 'b' } }),
      ),
    ).toBe('INVALID');
    // 자기 판정은 도울 수 없다
    expect(
      codeOf(() =>
        t.run(P1, { type: 'roll.help', payload: { rollId, side: 'active', helperId: 'a' } }),
      ),
    ).toBe('INVALID');
  });
});
