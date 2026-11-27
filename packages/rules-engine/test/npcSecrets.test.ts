import { describe, expect, it } from 'vitest';
import { GM, P1, pc, Table, withCharacters } from './helpers';

const npc = {
  name: '검은 사제',
  isNpc: true,
  approaches: { careful: 1, clever: 3, flashy: 2, forceful: 0, quick: 2, sneaky: 1 },
  stunts: [],
  highConcept: '전생교의 숨은 교주',
  trouble: '예언에 눈이 멀었다',
  aspects: ['신도들의 맹목'],
};

function table() {
  const t = new Table((s) => ({
    ...withCharacters(pc('a', 'u1', { fatePoints: 3 }))(s),
    gmPool: 3,
  }));
  t.run(GM, { type: 'scene.start', payload: { name: '지하 제단' } });
  t.run(GM, { type: 'character.create', payload: npc });
  const id = Object.values(t.state.characters).find((c) => c.isNpc)!.id;
  return { t, id };
}

const aspectsOf = (t: Table, id: string) =>
  Object.values(t.state.aspects).filter((a) => a.ownerType === 'character' && a.ownerId === id);

describe('NPC aspects stay with the GM', () => {
  it('creates every NPC aspect hidden and sends it only to the GM', () => {
    const { t, id } = table();
    const aspects = aspectsOf(t, id);
    expect(aspects).toHaveLength(3);
    expect(aspects.every((a) => a.hidden)).toBe(true);
    const added = t.log.filter((e) => e.type === 'aspect.added' && e.payload.aspect.ownerId === id);
    expect(added.map((e) => e.visibility)).toEqual(['gm', 'gm', 'gm']);
  });

  it('keeps a PC high concept public', () => {
    const t = new Table();
    t.run(P1, { type: 'character.create', payload: { ...npc, name: '하늘', isNpc: false } });
    expect(Object.values(t.state.aspects).every((a) => !a.hidden)).toBe(true);
  });

  it('reveals the aspect when the GM invokes it for the NPC', () => {
    const { t, id } = table();
    t.nextDice(0, 0, 0, 0).run(GM, {
      type: 'roll.request',
      payload: { characterId: id, action: 'attack', approach: 'forceful', targetId: 'a' },
    });
    const rollId = t.state.activeRollId!;
    t.nextDice(0, 0, 0, 0).run(P1, { type: 'roll.defend', payload: { rollId, approach: 'quick' } });
    const high = aspectsOf(t, id).find((a) => a.kind === 'high')!;
    const evs = t.run(GM, {
      type: 'invoke.apply',
      payload: { rollId, side: 'active', aspectId: high.id, mode: 'bonus', paidWith: 'fate_point' },
    });
    expect(evs.map((e) => e.type)).toEqual(['aspect.revealed', 'invoke.applied']);
    expect(evs[0]!.visibility).toBe('public');
    expect(t.state.aspects[high.id]!.hidden).toBe(false);
  });

  it('does not let a player invoke a hidden NPC aspect against it', () => {
    const { t, id } = table();
    t.nextDice(0, 0, 0, 0).run(P1, {
      type: 'roll.request',
      payload: { characterId: 'a', action: 'attack', approach: 'forceful', targetId: id },
    });
    const rollId = t.state.activeRollId!;
    t.nextDice(0, 0, 0, 0).run(GM, { type: 'roll.defend', payload: { rollId, approach: 'quick' } });
    const high = aspectsOf(t, id).find((a) => a.kind === 'high')!;
    expect(() =>
      t.run(P1, {
        type: 'invoke.apply',
        payload: {
          rollId,
          side: 'active',
          aspectId: high.id,
          mode: 'bonus',
          paidWith: 'fate_point',
        },
      }),
    ).toThrow('NOT_FOUND');
  });
});
