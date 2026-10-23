import { describe, expect, it } from 'vitest';
import { canInvoke, previewInvokes, type RollState } from '../src/index';
import { aspect, dice, GM, P1, pc, Table, withCharacters } from './helpers';

function roll(over: Partial<RollState> = {}): RollState {
  return {
    id: 'r',
    action: 'overcome',
    active: {
      characterId: 'a',
      approach: 'forceful',
      rating: 1,
      dice: dice(0, 0, 0, 0),
      animSeed: 1,
      modifiers: [],
      paidInvokes: [],
    },
    defense: null,
    difficulty: 2,
    targetId: null,
    status: 'open',
    ...over,
  };
}

describe('previewInvokes (#9)', () => {
  it('highlights an aspect that turns a failure into a success', () => {
    const previews = previewInvokes(roll(), [aspect('불타는 창고')], {
      characterId: 'a',
      fatePoints: 1,
    });
    const bonus = previews.find((p) => p.mode === 'bonus')!;
    expect(bonus.outcomeAfter).toBe('success');
    expect(bonus.improves).toBe(true);
    const reroll = previews.find((p) => p.mode === 'reroll')!;
    expect(reroll.outcomeAfter).toBeNull();
    // 주사위 합 ≥ +1 이어야 동점 이상 → 31/81
    expect(reroll.improveChance).toBeCloseTo(31 / 81);
  });
});

describe('canInvoke (#10, #11)', () => {
  it('requires a fate point when there is no free invoke', () => {
    expect(canInvoke(roll(), aspect('x'), { characterId: 'a', fatePoints: 0 })).toEqual({
      ok: false,
      code: 'NOT_ENOUGH_FATE_POINTS',
    });
  });

  it('blocks a second paid invoke of the same aspect on one roll', () => {
    const r = roll({ active: { ...roll().active, paidInvokes: ['x'] } });
    expect(canInvoke(r, aspect('x'), { characterId: 'a', fatePoints: 3 })).toEqual({
      ok: false,
      code: 'ASPECT_ALREADY_INVOKED',
    });
    // 무료 발동은 겹쳐 쓸 수 있다
    expect(
      canInvoke(
        r,
        aspect('x', { freeInvokes: 1 }),
        { characterId: 'a', fatePoints: 3 },
        'active',
        'free_invoke',
      ),
    ).toEqual({ ok: true });
  });

  it('cannot invoke a hidden aspect', () => {
    expect(
      canInvoke(roll(), aspect('x', { hidden: true }), { characterId: 'a', fatePoints: 3 }).ok,
    ).toBe(false);
  });
});

describe('invoke through the engine (#12)', () => {
  function table() {
    const t = new Table(withCharacters(pc('a', 'u1', { fatePoints: 2 }), pc('b', 'u2')));
    t.run(GM, { type: 'scene.start', payload: { name: '창고' } });
    return t;
  }

  it('consumes a boost when it is used', () => {
    const t = table();
    t.run(P1, {
      type: 'aspect.add',
      payload: {
        ownerType: 'scene',
        ownerId: t.state.scene!.id,
        kind: 'boost',
        text: '틈',
        freeInvokes: 0,
        hidden: false,
      },
    });
    const boostId = Object.values(t.state.aspects).find((a) => a.kind === 'boost')!.id;
    t.nextDice(0, 0, 0, 0).run(P1, {
      type: 'roll.request',
      payload: { characterId: 'a', action: 'overcome', approach: 'careful', difficulty: 2 },
    });
    const rollId = t.state.activeRollId!;
    t.run(P1, {
      type: 'invoke.apply',
      payload: {
        rollId,
        side: 'active',
        aspectId: boostId,
        mode: 'bonus',
        paidWith: 'free_invoke',
      },
    });
    expect(t.state.aspects[boostId]).toBeUndefined();
    expect(t.state.characters.a!.fatePoints).toBe(2);
    expect(t.state.rolls[rollId]!.active.modifiers).toEqual([
      { source: `aspect:${boostId}`, value: 2 },
    ]);
  });

  it('pays a fate point and rewards the opponent when invoking their aspect against them', () => {
    const t = table();
    t.push({
      type: 'aspect.added',
      actorId: 'gm',
      visibility: 'public',
      payload: {
        aspect: aspect('겁쟁이', { ownerType: 'character', ownerId: 'b', kind: 'trouble' }),
      },
    });
    t.run(P1, {
      type: 'roll.request',
      payload: { characterId: 'a', action: 'attack', approach: 'forceful', targetId: 'b' },
    });
    const rollId = t.state.activeRollId!;
    t.run(
      { userId: 'u2', role: 'player' },
      { type: 'roll.defend', payload: { rollId, approach: 'quick' } },
    );
    const fpB = t.state.characters.b!.fatePoints;
    t.run(P1, {
      type: 'invoke.apply',
      payload: {
        rollId,
        side: 'active',
        aspectId: '겁쟁이',
        mode: 'bonus',
        paidWith: 'fate_point',
      },
    });
    expect(t.state.characters.a!.fatePoints).toBe(1);
    expect(t.state.characters.b!.fatePoints).toBe(fpB + 1);
  });

  it('rerolls with fresh server dice', () => {
    const t = table();
    t.nextDice(-1, -1, -1, -1).run(P1, {
      type: 'roll.request',
      payload: { characterId: 'a', action: 'overcome', approach: 'careful', difficulty: 0 },
    });
    const rollId = t.state.activeRollId!;
    t.push({
      type: 'aspect.added',
      actorId: 'gm',
      visibility: 'public',
      payload: { aspect: aspect('x') },
    });
    t.nextDice(1, 1, 1, 1).run(P1, {
      type: 'invoke.apply',
      payload: { rollId, side: 'active', aspectId: 'x', mode: 'reroll', paidWith: 'fate_point' },
    });
    expect(t.state.rolls[rollId]!.active.dice).toEqual([1, 1, 1, 1]);
  });
});
