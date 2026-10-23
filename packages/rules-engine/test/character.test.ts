import { describe, expect, it } from 'vitest';
import { refreshFor, stuntBonuses, turnOrder, validateCharacter } from '../src/index';
import { aspect, pc } from './helpers';

describe('character rules', () => {
  it('#16 rejects a non-standard approach spread', () => {
    const c = pc('a', 'u1', {
      approaches: { careful: 3, clever: 3, flashy: 2, forceful: 1, quick: 1, sneaky: 0 },
    });
    expect(validateCharacter(c)).toEqual({ ok: false, issues: ['APPROACH_SPREAD'] });
  });

  it('requires a high concept and trouble when aspects are given', () => {
    const c = pc('a', 'u1');
    expect(validateCharacter(c, [])).toEqual({
      ok: false,
      issues: ['MISSING_HIGH', 'MISSING_TROUBLE'],
    });
    const aspects = [
      aspect('h', { ownerType: 'character', ownerId: 'a', kind: 'high' }),
      aspect('t', { ownerType: 'character', ownerId: 'a', kind: 'trouble' }),
    ];
    expect(validateCharacter(c, aspects)).toEqual({ ok: true });
  });

  it('#17 lowers refresh for each stunt beyond three', () => {
    expect(refreshFor(3)).toBe(3);
    expect(refreshFor(4)).toBe(2);
    expect(refreshFor(5)).toBe(1);
    expect(refreshFor(9)).toBe(1);
  });

  it('finds matching +2 stunts', () => {
    const c = pc('a', 'u1', {
      stunts: [
        {
          id: 's',
          text: '검술',
          kind: 'bonus',
          bonus: { approach: 'forceful', action: 'attack', value: 2 },
        },
      ],
    });
    expect(stuntBonuses(c, 'attack', 'forceful')).toHaveLength(1);
    expect(stuntBonuses(c, 'attack', 'quick')).toHaveLength(0);
  });

  it('#18 orders physical conflicts by quick', () => {
    const mk = (id: string, quick: number) =>
      pc(id, 'u', {
        approaches: { careful: 0, clever: 0, flashy: 0, forceful: 0, quick, sneaky: 0 },
      });
    expect(turnOrder('physical', [mk('a', 3), mk('b', 1), mk('c', 2)])).toEqual(['a', 'c', 'b']);
  });
});
