import { describe, expect, it } from 'vitest';
import { aspect, GM, P1, P2, pc, Table, withCharacters } from './helpers';

/** 확정 전에 낸 +2 카드를 다시 빼면, 낸 값(운명점·무료 발동·부스트)이 그대로 돌아온다 */
describe('invoke.revoke', () => {
  function table() {
    const t = new Table(withCharacters(pc('a', 'u1', { fatePoints: 2 }), pc('b', 'u2')));
    t.run(GM, { type: 'scene.start', payload: { name: '창고' } });
    return t;
  }
  function overcome(t: Table) {
    t.nextDice(0, 0, 0, 0).run(P1, {
      type: 'roll.request',
      payload: { characterId: 'a', action: 'overcome', approach: 'careful', difficulty: 2 },
    });
    return t.state.activeRollId!;
  }
  const add = (t: Table, a: ReturnType<typeof aspect>) =>
    t.push({ type: 'aspect.added', actorId: 'gm', visibility: 'public', payload: { aspect: a } });

  it('gives the fate point back and lets the aspect be paid for again', () => {
    const t = table();
    add(t, aspect('불길'));
    const rollId = overcome(t);
    const invoke = () =>
      t.run(P1, {
        type: 'invoke.apply',
        payload: {
          rollId,
          side: 'active',
          aspectId: '불길',
          mode: 'bonus',
          paidWith: 'fate_point',
        },
      });
    invoke();
    expect(t.state.characters.a!.fatePoints).toBe(1);
    t.run(P1, { type: 'invoke.revoke', payload: { rollId, side: 'active', aspectId: '불길' } });
    const side = t.state.rolls[rollId]!.active;
    expect(side.modifiers).toEqual([]);
    expect(side.paidInvokes).toEqual([]);
    expect(t.state.characters.a!.fatePoints).toBe(2);
    invoke();
    expect(t.state.characters.a!.fatePoints).toBe(1);
  });

  it('puts a free invoke back on the card', () => {
    const t = table();
    add(t, aspect('대들보', { freeInvokes: 1 }));
    const rollId = overcome(t);
    t.run(P1, {
      type: 'invoke.apply',
      payload: {
        rollId,
        side: 'active',
        aspectId: '대들보',
        mode: 'bonus',
        paidWith: 'free_invoke',
      },
    });
    expect(t.state.aspects['대들보']!.freeInvokes).toBe(0);
    t.run(P1, { type: 'invoke.revoke', payload: { rollId, side: 'active', aspectId: '대들보' } });
    expect(t.state.aspects['대들보']!.freeInvokes).toBe(1);
    expect(t.state.characters.a!.fatePoints).toBe(2);
  });

  it('brings a used boost back', () => {
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
    const boost = Object.values(t.state.aspects).find((a) => a.kind === 'boost')!;
    const rollId = overcome(t);
    t.run(P1, {
      type: 'invoke.apply',
      payload: {
        rollId,
        side: 'active',
        aspectId: boost.id,
        mode: 'bonus',
        paidWith: 'free_invoke',
      },
    });
    expect(t.state.aspects[boost.id]).toBeUndefined();
    t.run(P1, { type: 'invoke.revoke', payload: { rollId, side: 'active', aspectId: boost.id } });
    expect(t.state.aspects[boost.id]).toEqual(boost);
  });

  it('takes back the fate point the opponent got from their own aspect', () => {
    const t = table();
    add(t, aspect('겁쟁이', { ownerType: 'character', ownerId: 'b', kind: 'trouble' }));
    t.run(P1, {
      type: 'roll.request',
      payload: { characterId: 'a', action: 'attack', approach: 'forceful', targetId: 'b' },
    });
    const rollId = t.state.activeRollId!;
    t.run(P2, { type: 'roll.defend', payload: { rollId, approach: 'quick' } });
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
    t.run(P1, { type: 'invoke.revoke', payload: { rollId, side: 'active', aspectId: '겁쟁이' } });
    expect(t.state.characters.a!.fatePoints).toBe(2);
    expect(t.state.characters.b!.fatePoints).toBe(fpB);
  });

  it('refuses when the aspect was not played, or the roll is final', () => {
    const t = table();
    add(t, aspect('불길'));
    const rollId = overcome(t);
    expect(() =>
      t.run(P1, { type: 'invoke.revoke', payload: { rollId, side: 'active', aspectId: '불길' } }),
    ).toThrow();
    t.run(P1, {
      type: 'invoke.apply',
      payload: { rollId, side: 'active', aspectId: '불길', mode: 'bonus', paidWith: 'fate_point' },
    });
    expect(() =>
      t.run(P2, { type: 'invoke.revoke', payload: { rollId, side: 'active', aspectId: '불길' } }),
    ).toThrow();
    t.run(P1, { type: 'roll.finalize', payload: { rollId, reduceForBoost: false } });
    expect(() =>
      t.run(P1, { type: 'invoke.revoke', payload: { rollId, side: 'active', aspectId: '불길' } }),
    ).toThrow();
  });
});
