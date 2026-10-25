import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { replay, validate, type Command } from '../src/index';
import { aspect, GM, P1, P2, pc, Table, withCharacters } from './helpers';

function table() {
  return new Table(
    withCharacters(pc('a', 'u1'), pc('b', 'u2'), pc('npc', 'gm', { isNpc: true, ownerId: null })),
  );
}

describe('sessions and scenes', () => {
  it('#19 keeps fate points above refresh at session start', () => {
    const t = new Table(
      withCharacters(
        pc('a', 'u1', { fatePoints: 5, refresh: 3 }),
        pc('b', 'u2', { fatePoints: 1, refresh: 3 }),
      ),
    );
    t.run(GM, { type: 'session.start', payload: {} });
    expect(t.state.characters.a!.fatePoints).toBe(5);
    expect(t.state.characters.b!.fatePoints).toBe(3);
    expect(t.state.session?.number).toBe(1);
  });

  it('#24 resets the GM pool to the number of PCs in the scene', () => {
    const t = new Table((s) => ({
      ...withCharacters(pc('a', 'u1'), pc('b', 'u2'), pc('c', 'u3'), pc('d', 'u4'))(s),
      gmPool: 1,
    }));
    t.run(GM, { type: 'scene.start', payload: { name: '항구' } });
    expect(t.state.gmPool).toBe(4);
  });

  it('#21 clears stress, scene aspects and boosts at scene end but keeps consequences', () => {
    const t = table();
    t.run(GM, {
      type: 'scene.start',
      payload: { name: '항구', aspects: [{ text: '짙은 안개', hidden: false }] },
    });
    t.run(P1, {
      type: 'aspect.add',
      payload: {
        ownerType: 'character',
        ownerId: 'a',
        kind: 'boost',
        text: '기세',
        freeInvokes: 0,
        hidden: false,
      },
    });
    t.push({
      type: 'damage.absorbed',
      actorId: 'gm',
      visibility: 'public',
      payload: {
        rollId: 'r',
        targetId: 'a',
        stressBox: 2,
        consequences: [{ slot: 'mild', aspectId: 'cons', text: '삔 발목' }],
      },
    });
    t.run(GM, { type: 'scene.end', payload: {} });
    const a = t.state.characters.a!;
    expect(a.stress).toEqual([false, false, false]);
    expect(a.consequences.mild?.aspectId).toBe('cons');
    expect(Object.values(t.state.aspects).map((x) => x.text)).toEqual(['삔 발목']);
  });

  it('heals a recovering mild consequence after the next scene, not the current one', () => {
    const t = table();
    t.run(GM, { type: 'scene.start', payload: { name: '1' } });
    t.push({
      type: 'damage.absorbed',
      actorId: 'gm',
      visibility: 'public',
      payload: {
        rollId: 'r',
        targetId: 'a',
        stressBox: null,
        consequences: [{ slot: 'mild', aspectId: 'cons', text: '멍' }],
      },
    });
    t.run(P1, { type: 'consequence.startRecovery', payload: { characterId: 'a', slot: 'mild' } });
    t.run(GM, { type: 'scene.start', payload: { name: '2' } }); // 1번 장면 종료
    expect(t.state.characters.a!.consequences.mild).toBeDefined();
    t.run(GM, { type: 'scene.end', payload: {} }); // 2번 장면 종료
    expect(t.state.characters.a!.consequences.mild).toBeUndefined();
    expect(t.state.aspects.cons).toBeUndefined();
  });
});

describe('compels', () => {
  it('#20 cannot refuse a compel without a fate point', () => {
    const t = new Table(withCharacters(pc('a', 'u1', { fatePoints: 0 })));
    t.push({
      type: 'aspect.added',
      actorId: 'gm',
      visibility: 'public',
      payload: { aspect: aspect('t', { ownerType: 'character', ownerId: 'a', kind: 'trouble' }) },
    });
    t.run(GM, {
      type: 'compel.offer',
      payload: { aspectId: 't', targetId: 'a', text: '참지 못하고 끼어든다' },
    });
    const compelId = Object.keys(t.state.compels)[0]!;
    expect(
      validate(t.state, { type: 'compel.respond', payload: { compelId, accept: false } }, P1),
    ).toMatchObject({ ok: false, code: 'NOT_ENOUGH_FATE_POINTS' });
    t.run(P1, { type: 'compel.respond', payload: { compelId, accept: true } });
    expect(t.state.characters.a!.fatePoints).toBe(1);
  });

  it('players cannot answer compels for other characters', () => {
    const t = table();
    t.push({
      type: 'aspect.added',
      actorId: 'gm',
      visibility: 'public',
      payload: { aspect: aspect('t', { ownerType: 'character', ownerId: 'a', kind: 'trouble' }) },
    });
    t.run(GM, { type: 'compel.offer', payload: { aspectId: 't', targetId: 'a', text: '...' } });
    const compelId = Object.keys(t.state.compels)[0]!;
    expect(
      validate(t.state, { type: 'compel.respond', payload: { compelId, accept: true } }, P2),
    ).toMatchObject({ code: 'FORBIDDEN_ROLE' });
  });
});

describe('opposed attack → damage', () => {
  it('reveals both rolls together and opens the damage absorber', () => {
    const t = table();
    t.nextDice(1, 1, 0, 0).run(P1, {
      type: 'roll.request',
      payload: { characterId: 'a', action: 'attack', approach: 'forceful', targetId: 'b' },
    });
    const rollId = t.state.activeRollId!;
    expect(t.state.rolls[rollId]!.status).toBe('awaiting_defense');
    expect(t.state.rolls[rollId]!.active.dice).toBeNull(); // 아무에게도 공개되지 않음
    expect(JSON.stringify(t.log)).not.toContain('"dice"');

    t.nextDice(-1, -1, 0, 0).run(P2, {
      type: 'roll.defend',
      payload: { rollId, approach: 'sneaky' },
    });
    const r = t.state.rolls[rollId]!;
    expect(r.status).toBe('open');
    expect(r.active.dice).toEqual([1, 1, 0, 0]);

    // 방어자가 조정을 마쳐야 공격자가 확정할 수 있다
    t.run(P2, { type: 'roll.defense_ready', payload: { rollId } });
    // 공격 1+2=3, 방어 0-2=-2 → 차이 5, 대성공
    t.run(P1, { type: 'roll.finalize', payload: { rollId, reduceForBoost: true } });
    expect(t.state.rolls[rollId]!.result).toEqual({ total: 3, shifts: 5, outcome: 'style' });
    expect(t.state.pendingDamage[rollId]!.shifts).toBe(4);

    t.run(P2, {
      type: 'damage.absorb',
      payload: {
        rollId,
        takeOut: false,
        stressBox: 2,
        consequences: [{ slot: 'mild', text: '베인 상처' }],
      },
    });
    const b = t.state.characters.b!;
    expect(b.stress).toEqual([false, true, false]);
    const cons = t.state.aspects[b.consequences.mild!.aspectId]!;
    expect(cons).toMatchObject({ kind: 'consequence', text: '베인 상처', freeInvokes: 1 });
  });

  it('rejects a plan that does not absorb the hit', () => {
    const t = table();
    t.push({
      type: 'damage.pending',
      actorId: 'gm',
      visibility: 'public',
      payload: { rollId: 'r', targetId: 'b', attackerId: 'a', shifts: 4 },
    });
    expect(
      validate(
        t.state,
        {
          type: 'damage.absorb',
          payload: { rollId: 'r', takeOut: false, stressBox: 3, consequences: [] },
        },
        P2,
      ),
    ).toMatchObject({ code: 'INVALID' });
  });

  it('pays 1 + consequences taken when conceding', () => {
    const t = table();
    t.run(GM, {
      type: 'conflict.start',
      payload: { kind: 'physical', participantIds: ['a', 'b'] },
    });
    t.push({
      type: 'damage.absorbed',
      actorId: 'gm',
      visibility: 'public',
      payload: {
        rollId: 'r',
        targetId: 'b',
        stressBox: null,
        consequences: [{ slot: 'mild', aspectId: 'c1', text: 'x' }],
      },
    });
    const before = t.state.characters.b!.fatePoints;
    t.run(P2, { type: 'character.concede', payload: { characterId: 'b' } });
    expect(t.state.characters.b!.fatePoints).toBe(before + 2);
    expect(t.state.characters.b!.takenOut).toBe(true);
  });
});

describe('permissions', () => {
  it('only the GM runs GM commands', () => {
    const s = table().state;
    expect(validate(s, { type: 'scene.start', payload: { name: 'x' } }, P1)).toMatchObject({
      code: 'FORBIDDEN_ROLE',
    });
    expect(
      validate(
        s,
        {
          type: 'roll.request',
          payload: { characterId: 'b', action: 'overcome', approach: 'quick' },
        },
        P1,
      ),
    ).toMatchObject({
      code: 'FORBIDDEN_ROLE',
    });
    expect(
      validate(
        s,
        {
          type: 'roll.request',
          payload: { characterId: 'npc', action: 'overcome', approach: 'quick' },
        },
        GM,
      ),
    ).toEqual({ ok: true });
  });

  it('hidden aspects are recorded as GM-only events', () => {
    const t = table();
    const [, hidden] = t.run(GM, {
      type: 'scene.start',
      payload: { name: 'x', aspects: [{ text: '숨은 함정', hidden: true }] },
    });
    expect(hidden!.visibility).toBe('gm');
  });
});

describe('character creation', () => {
  it('creates a PC with its aspects and refresh from stunts', () => {
    const t = new Table();
    t.run(P1, {
      type: 'character.create',
      payload: {
        name: '하늘',
        isNpc: false,
        approaches: { careful: 1, clever: 3, flashy: 2, forceful: 0, quick: 2, sneaky: 1 },
        stunts: [1, 2, 3, 4].map((n) => ({
          id: `s${n}`,
          text: `특기${n}`,
          kind: 'once_per_session' as const,
        })),
        highConcept: '떠돌이 마법사',
        trouble: '호기심을 못 참는다',
        aspects: ['옛 스승의 빚'],
      },
    });
    const c = Object.values(t.state.characters)[0]!;
    expect(c).toMatchObject({ ownerId: 'u1', refresh: 2, fatePoints: 2 });
    expect(Object.values(t.state.aspects).map((a) => a.kind)).toEqual([
      'high',
      'trouble',
      'normal',
    ]);
  });

  it('rejects a broken approach spread', () => {
    const t = new Table();
    expect(() =>
      t.run(P1, {
        type: 'character.create',
        payload: {
          name: 'x',
          isNpc: false,
          approaches: { careful: 3, clever: 3, flashy: 3, forceful: 0, quick: 0, sneaky: 0 },
          stunts: [],
          highConcept: 'x',
          trouble: 'y',
          aspects: [],
        },
      }),
    ).toThrow('APPROACH_SPREAD');
  });
});

describe('contest', () => {
  it('ends when a side reaches three victories', () => {
    const t = table();
    t.run(GM, { type: 'contest.start', payload: { sides: ['a', 'b'] } });
    t.run(GM, { type: 'contest.exchange', payload: { winnerId: 'a', victories: 2 } });
    expect(t.state.contest?.victories.a).toBe(2);
    t.run(GM, { type: 'contest.exchange', payload: { winnerId: 'a', victories: 1 } });
    expect(t.state.contest).toBeNull();
  });
});

describe('undo (#22)', () => {
  it('replaying with an undone event equals replaying without it', () => {
    const t = table();
    t.run(GM, { type: 'session.start', payload: {} });
    t.run(GM, { type: 'fate.adjust', payload: { target: 'a', delta: 2 } });
    const target = t.state.seq;
    t.run(GM, { type: 'fate.adjust', payload: { target: 'b', delta: 1 } });
    t.run(GM, { type: 'event.undo', payload: { targetSeq: target } });

    const base = new Table(
      withCharacters(pc('a', 'u1'), pc('b', 'u2'), pc('npc', 'gm', { isNpc: true, ownerId: null })),
    ).state;
    const withUndo = replay(t.log, base);
    const without = replay(
      t.log.filter((e) => e.seq !== target && e.type !== 'event.undone'),
      base,
    );
    expect({ ...withUndo, seq: 0 }).toEqual({ ...without, seq: 0 });
    expect(withUndo.characters.a!.fatePoints).toBe(3);
    expect(t.state.characters.a!.fatePoints).toBe(3);
  });

  it('undoes every event of the same command together', () => {
    const t = table();
    t.run(GM, { type: 'session.start', payload: {} });
    t.run(GM, {
      type: 'scene.start',
      payload: { name: '창고', aspects: [{ text: '불길', hidden: false }] },
    });
    const sceneSeq = t.log.find((e) => e.type === 'scene.started')!.seq;
    const [undo] = t.run(GM, { type: 'event.undo', payload: { targetSeq: sceneSeq } });
    expect(undo!.type === 'event.undone' && undo!.payload.seqs).toEqual([sceneSeq, sceneSeq + 1]);
    expect(t.state.scene).toBeNull();
    expect(Object.values(t.state.aspects)).toHaveLength(0);
  });

  it('undoing an undo redoes it', () => {
    const t = table();
    t.run(GM, { type: 'fate.adjust', payload: { target: 'a', delta: 2 } });
    const target = t.state.seq;
    t.run(GM, { type: 'event.undo', payload: { targetSeq: target } });
    expect(t.state.characters.a!.fatePoints).toBe(3);
    t.run(GM, { type: 'event.undo', payload: { targetSeq: t.state.seq } });
    expect(t.state.characters.a!.fatePoints).toBe(5);
  });

  it('refuses to undo twice or to undo a join', () => {
    const t = table();
    t.run(GM, { type: 'fate.adjust', payload: { target: 'a', delta: 1 } });
    t.run(GM, { type: 'event.undo', payload: { targetSeq: 1 } });
    expect(() => t.run(GM, { type: 'event.undo', payload: { targetSeq: 1 } })).toThrow();
    t.push({
      type: 'room.member_joined',
      actorId: 'u1',
      payload: { userId: 'u1', nickname: 'x', role: 'player' },
      visibility: 'public',
    });
    expect(() => t.run(GM, { type: 'event.undo', payload: { targetSeq: t.state.seq } })).toThrow();
    expect(() => t.run(P1, { type: 'event.undo', payload: { targetSeq: 1 } })).toThrow();
  });
});

describe('conflict turns', () => {
  it('lets the player whose turn it is pass the turn, but nobody else', () => {
    const t = table();
    t.run(GM, { type: 'conflict.start', payload: { kind: 'mental', participantIds: ['a', 'b'] } });
    const first = t.state.conflict!.order[0]!;
    const [owner, other] = first === 'a' ? [P1, P2] : [P2, P1];
    expect(() => t.run(other, { type: 'conflict.next', payload: {} })).toThrow();
    t.run(owner, { type: 'conflict.next', payload: {} });
    expect(t.state.conflict!.index).toBe(1);
    t.run(GM, { type: 'conflict.next', payload: {} });
    expect(t.state.conflict).toMatchObject({ index: 0, round: 2 });
  });
});

describe('milestones', () => {
  it('lets a player grow only with a milestone, once', () => {
    const t = table();
    const grown = { careful: 4, clever: 2, flashy: 2, forceful: 1, quick: 1, sneaky: 0 };
    const update = {
      type: 'character.update',
      payload: { id: 'a', patch: { approaches: grown } },
    } as const;
    expect(() => t.run(P1, update)).toThrow();
    t.run(GM, { type: 'milestone.grant', payload: { characterIds: ['a'], size: 'minor' } });
    expect(() => t.run(P1, update)).toThrow();
    const swapped = { careful: 0, clever: 2, flashy: 2, forceful: 1, quick: 1, sneaky: 3 };
    t.run(P1, { type: 'character.update', payload: { id: 'a', patch: { approaches: swapped } } });
    expect(t.state.characters.a!.approaches.sneaky).toBe(3);
    expect(t.state.characters.a!.milestone).toBeUndefined();
    t.run(GM, { type: 'milestone.grant', payload: { characterIds: ['a'], size: 'significant' } });
    t.run(P1, {
      type: 'character.update',
      payload: { id: 'a', patch: { approaches: { ...swapped, sneaky: 4 } } },
    });
    expect(t.state.characters.a!.approaches.sneaky).toBe(4);
  });
});

describe('zones', () => {
  it('moves, renames, links and unlinks zones', () => {
    const t = table();
    t.run(GM, {
      type: 'scene.start',
      payload: {
        name: '항구',
        zones: [
          { name: '부두', x: 10, y: 10 },
          { name: '창고', x: 80, y: 60 },
        ],
      },
    });
    const [z1, z2] = Object.keys(t.state.scene!.zones);
    t.run(GM, { type: 'zone.link', payload: { from: z1!, to: z2! } });
    expect(t.state.scene!.zones[z2!]!.links).toEqual([z1]);
    t.run(GM, { type: 'zone.update', payload: { zoneId: z1!, name: '선착장', x: 30 } });
    expect(t.state.scene!.zones[z1!]).toMatchObject({ name: '선착장', x: 30, y: 10 });
    t.run(GM, { type: 'zone.unlink', payload: { from: z2!, to: z1! } });
    expect(t.state.scene!.zones[z1!]!.links).toEqual([]);
    t.run(P1, { type: 'token.move', payload: { characterId: 'a', zoneId: z2! } });
    expect(t.state.tokens.a).toBe(z2);
    expect(() =>
      t.run(P1, { type: 'token.move', payload: { characterId: 'b', zoneId: z2! } }),
    ).toThrow();
  });
});

describe('invariants (#23)', () => {
  const commandArb: fc.Arbitrary<{ actor: 'gm' | 'u1' | 'u2'; command: Command }> = fc.oneof(
    fc.record({
      actor: fc.constant('gm' as const),
      command: fc.record({
        type: fc.constant('fate.adjust' as const),
        payload: fc.record({
          target: fc.constantFrom('a', 'b', 'gm_pool'),
          delta: fc.integer({ min: -5, max: 5 }),
        }),
      }),
    }),
    fc.record({
      actor: fc.constant('gm' as const),
      command: fc.constant({
        type: 'scene.start',
        payload: { name: 's', aspects: [{ text: 'x', hidden: false }] },
      } as Command),
    }),
    fc.record({
      actor: fc.constant('gm' as const),
      command: fc.constant({ type: 'scene.end', payload: {} } as Command),
    }),
    fc.record({
      actor: fc.constantFrom('u1' as const, 'u2' as const),
      command: fc.record({
        type: fc.constant('roll.request' as const),
        payload: fc.record({
          characterId: fc.constantFrom('a', 'b'),
          action: fc.constant('overcome' as const),
          approach: fc.constant('careful' as const),
          difficulty: fc.integer({ min: 0, max: 4 }),
        }),
      }) as fc.Arbitrary<Command>,
    }),
    fc.record({
      actor: fc.constantFrom('u1' as const, 'u2' as const),
      command: fc.record({
        type: fc.constant('invoke.apply' as const),
        payload: fc.record({
          rollId: fc.constant('LAST'),
          side: fc.constant('active' as const),
          aspectId: fc.constant('ANY'),
          mode: fc.constantFrom('bonus' as const, 'reroll' as const),
          paidWith: fc.constantFrom('fate_point' as const, 'free_invoke' as const),
        }),
      }) as fc.Arbitrary<Command>,
    }),
  );

  it('fate points and free invokes never go negative', () => {
    fc.assert(
      fc.property(
        fc.array(commandArb, { maxLength: 40 }),
        fc.array(fc.integer({ min: -1, max: 1 }), { minLength: 4 }),
        (steps, faces) => {
          const t = table().nextDice(...faces);
          for (const { actor, command } of steps) {
            let cmd = command;
            if (cmd.type === 'invoke.apply') {
              const aspectId = Object.keys(t.state.aspects)[0];
              if (!t.state.activeRollId || !aspectId) continue;
              cmd = { ...cmd, payload: { ...cmd.payload, rollId: t.state.activeRollId, aspectId } };
            }
            const a = actor === 'gm' ? GM : { userId: actor, role: 'player' as const };
            try {
              t.run(a, cmd);
            } catch {
              // 거부된 명령은 상태를 바꾸지 않는다
            }
            for (const c of Object.values(t.state.characters))
              expect(c.fatePoints).toBeGreaterThanOrEqual(0);
            for (const asp of Object.values(t.state.aspects))
              expect(asp.freeInvokes).toBeGreaterThanOrEqual(0);
            expect(t.state.gmPool).toBeGreaterThanOrEqual(0);
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
