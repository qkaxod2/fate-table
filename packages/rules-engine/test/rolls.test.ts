import { describe, expect, it } from 'vitest';
import { CommandError, type Command } from '../src/index';
import { aspect, GM, P1, P2, pc, Table, withCharacters } from './helpers';

function table() {
  const t = new Table((s) => ({
    ...withCharacters(
      pc('a', 'u1', { fatePoints: 3 }),
      pc('b', 'u2', {
        fatePoints: 3,
        stunts: [
          {
            id: 'dodge',
            text: '몸놀림',
            kind: 'bonus',
            bonus: { approach: 'quick', action: 'defend', value: 2 },
          },
        ],
      }),
      pc('npc', 'gm', { isNpc: true, ownerId: null }),
    )(s),
    aspects: { fog: aspect('fog', { text: '짙은 안개' }) },
  }));
  t.run(GM, { type: 'scene.start', payload: { name: '안개 낀 부두' } });
  return t;
}

/** a가 b를 공격하고 b가 막아 두 결과가 공개된 상태 */
function opposed(t: Table, attacker = P1, defender = P2, from = 'a', to = 'b') {
  t.nextDice(1, 0, 0, 0).run(attacker, {
    type: 'roll.request',
    payload: { characterId: from, action: 'attack', approach: 'forceful', targetId: to },
  });
  const rollId = t.state.activeRollId!;
  t.nextDice(0, 0, 0, 0).run(defender, {
    type: 'roll.defend',
    payload: { rollId, approach: 'quick' },
  });
  return rollId;
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

describe('defense side adjusts after the reveal', () => {
  it('lets the defender invoke and use a stunt, then the attacker finalizes', () => {
    const t = table();
    const rollId = opposed(t);
    // 공격 1+1=2, 방어 0+1=1
    t.run(P2, {
      type: 'invoke.apply',
      payload: { rollId, side: 'defense', aspectId: 'fog', mode: 'bonus', paidWith: 'fate_point' },
    });
    t.run(P2, { type: 'stunt.apply', payload: { rollId, side: 'defense', stuntId: 'dodge' } });
    expect(t.state.characters.b!.fatePoints).toBe(2);
    expect(t.state.rolls[rollId]!.defense!.modifiers.map((m) => m.value)).toEqual([2, 2]);

    t.run(P2, { type: 'roll.defense_ready', payload: { rollId } });
    t.run(P1, { type: 'roll.finalize', payload: { rollId, reduceForBoost: false } });
    // 2 - (1 + 4) = -3
    expect(t.state.rolls[rollId]!.result).toMatchObject({ shifts: -3, outcome: 'fail' });
    expect(t.state.pendingDamage[rollId]).toBeUndefined();
  });

  it('holds the attacker until the defender is done', () => {
    const t = table();
    const rollId = opposed(t);
    const finalize: Command = { type: 'roll.finalize', payload: { rollId, reduceForBoost: false } };
    expect(codeOf(() => t.run(P1, finalize))).toBe('AWAITING_DEFENSE');
    // 남의 방어를 대신 끝낼 수는 없다
    expect(codeOf(() => t.run(P1, { type: 'roll.defense_ready', payload: { rollId } }))).toBe(
      'FORBIDDEN_ROLE',
    );
    t.run(P2, { type: 'roll.defense_ready', payload: { rollId } });
    t.run(P1, finalize);
    expect(t.state.rolls[rollId]!.status).toBe('final');
  });

  it('refuses defense changes after done, until the attacker changes the roll', () => {
    const t = table();
    const rollId = opposed(t);
    t.run(P2, { type: 'roll.defense_ready', payload: { rollId } });
    const defenseStunt: Command = {
      type: 'stunt.apply',
      payload: { rollId, side: 'defense', stuntId: 'dodge' },
    };
    expect(codeOf(() => t.run(P2, defenseStunt))).toBe('INVALID');

    // 공격자가 발동하면 방어자가 다시 대응할 수 있다
    t.run(P1, {
      type: 'invoke.apply',
      payload: { rollId, side: 'active', aspectId: 'fog', mode: 'bonus', paidWith: 'fate_point' },
    });
    expect(t.state.rolls[rollId]!.defenseReady).toBe(false);
    expect(
      codeOf(() =>
        t.run(P1, { type: 'roll.finalize', payload: { rollId, reduceForBoost: false } }),
      ),
    ).toBe('AWAITING_DEFENSE');
    t.run(P2, defenseStunt);
    t.run(P2, { type: 'roll.defense_ready', payload: { rollId } });
    t.run(P1, { type: 'roll.finalize', payload: { rollId, reduceForBoost: false } });
    expect(t.state.rolls[rollId]!.status).toBe('final');
  });

  it('makes the GM wait for a PC defender, unless the GM answers for them', () => {
    const t = table();
    const rollId = opposed(t, GM, P2, 'npc', 'b');
    const finalize: Command = { type: 'roll.finalize', payload: { rollId, reduceForBoost: false } };
    expect(codeOf(() => t.run(GM, finalize))).toBe('AWAITING_DEFENSE');
    // 자리를 비운 플레이어 대신 GM이 조정 완료를 누를 수 있다
    t.run(GM, { type: 'roll.defense_ready', payload: { rollId } });
    t.run(GM, finalize);
    expect(t.state.rolls[rollId]!.status).toBe('final');
  });

  it('does not wait when the defender is on the same side', () => {
    const t = table();
    t.run(GM, {
      type: 'character.create',
      payload: {
        name: '졸개',
        isNpc: true,
        approaches: { careful: 1, clever: 1, flashy: 1, forceful: 1, quick: 1, sneaky: 1 },
        stunts: [],
        highConcept: '부두 깡패',
        aspects: [],
      },
    });
    const minion = Object.values(t.state.characters).find((c) => c.name === '졸개')!;
    const rollId = opposed(t, GM, GM, 'npc', minion.id);
    t.run(GM, { type: 'roll.finalize', payload: { rollId, reduceForBoost: false } });
    expect(t.state.rolls[rollId]!.status).toBe('final');
  });
});

describe('scene change closes unfinished rolls', () => {
  it('cancels an open roll at scene end and refuses to finalize it in the next scene', () => {
    const t = table();
    const rollId = opposed(t);
    t.run(GM, { type: 'scene.start', payload: { name: '다음 장면' } });
    expect(t.state.rolls[rollId]!.status).toBe('cancelled');
    expect(t.state.activeRollId).toBeNull();
    for (const [actor, cmd] of [
      [P1, { type: 'roll.finalize', payload: { rollId, reduceForBoost: false } }],
      [
        P1,
        {
          type: 'invoke.apply',
          payload: {
            rollId,
            side: 'active',
            aspectId: 'fog',
            mode: 'bonus',
            paidWith: 'fate_point',
          },
        },
      ],
      [P2, { type: 'roll.defense_ready', payload: { rollId } }],
    ] as const) {
      expect(codeOf(() => t.run(actor, cmd as Command))).toBe('ROLL_NOT_OPEN');
    }
  });

  it('refuses a defense against an attack from an ended scene', () => {
    const t = table();
    t.run(P1, {
      type: 'roll.request',
      payload: { characterId: 'a', action: 'attack', approach: 'forceful', targetId: 'b' },
    });
    const rollId = t.state.activeRollId!;
    t.run(GM, { type: 'scene.end', payload: {} });
    expect(
      codeOf(() => t.run(P2, { type: 'roll.defend', payload: { rollId, approach: 'quick' } })),
    ).toBe('ROLL_NOT_OPEN');
  });

  it('keeps finished rolls and also cancels at session end without a scene', () => {
    const t = table();
    t.run(GM, { type: 'session.start', payload: {} });
    t.run(P1, {
      type: 'roll.request',
      payload: { characterId: 'a', action: 'overcome', approach: 'careful', difficulty: 1 },
    });
    const done = t.state.activeRollId!;
    t.run(P1, { type: 'roll.finalize', payload: { rollId: done, reduceForBoost: false } });
    t.run(GM, { type: 'scene.end', payload: {} });
    t.run(P1, {
      type: 'roll.request',
      payload: { characterId: 'a', action: 'overcome', approach: 'careful', difficulty: 1 },
    });
    const open = t.state.activeRollId!;
    t.run(GM, { type: 'session.end', payload: {} });
    expect(t.state.rolls[done]!.status).toBe('final');
    expect(t.state.rolls[open]!.status).toBe('cancelled');
  });

  it('undoing the scene end brings the roll back', () => {
    const t = table();
    const rollId = opposed(t);
    t.run(GM, { type: 'scene.end', payload: {} });
    const endSeq = t.state.seq;
    t.run(GM, { type: 'event.undo', payload: { targetSeq: endSeq } });
    expect(t.state.rolls[rollId]!.status).toBe('open');
  });
});
