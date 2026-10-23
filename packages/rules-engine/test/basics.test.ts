import { describe, expect, it } from 'vitest';
import {
  chanceAtLeast,
  FATE_DICE_DISTRIBUTION,
  formatRating,
  ladderLabel,
  outcomeOf,
  rewardsFor,
  rollFateDice,
} from '../src/index';

describe('outcomeOf (#1)', () => {
  it.each([
    [-1, 'fail'],
    [0, 'tie'],
    [2, 'success'],
    [3, 'style'],
  ] as const)('%i → %s', (shifts, outcome) => expect(outcomeOf(shifts)).toBe(outcome));
});

describe('ladder (#2)', () => {
  it('names values on and beyond the ladder', () => {
    expect(ladderLabel(3)).toBe('양호');
    expect(ladderLabel(-2)).toBe('최악');
    expect(ladderLabel(10)).toBe('전설+2');
    expect(ladderLabel(-3)).toBe('최악-1');
    expect(formatRating(3)).toBe('양호 +3');
  });
});

describe('dice (#3)', () => {
  it('maps rng indices to faces', () => {
    const seq = [0, 1, 2, 1];
    let i = 0;
    expect(rollFateDice(() => seq[i++]!)).toEqual([-1, 0, 1, 0]);
  });

  it('has a correct 4dF distribution', () => {
    const total = Object.values(FATE_DICE_DISTRIBUTION).reduce((a, b) => a + b, 0);
    expect(total).toBe(81);
    expect(chanceAtLeast(-4)).toBe(1);
    expect(chanceAtLeast(5)).toBe(0);
  });
});

describe('rewardsFor (#4-8)', () => {
  it('overcome tie → success at a minor cost', () => {
    expect(rewardsFor('overcome', 'tie', 0)).toEqual([{ type: 'success_at_minor_cost' }]);
  });
  it('create advantage with style → new aspect with 2 free invokes', () => {
    expect(rewardsFor('create_advantage', 'style', 3)).toEqual([
      { type: 'new_aspect', freeInvokes: 2 },
    ]);
  });
  it('attack tie → boost', () => {
    expect(rewardsFor('attack', 'tie', 0)).toEqual([{ type: 'boost', to: 'self' }]);
  });
  it('attack with style → damage or trade one shift for a boost', () => {
    expect(rewardsFor('attack', 'style', 4)).toEqual([{ type: 'damage_or_boost', shifts: 4 }]);
  });
  it('defend with style → boost', () => {
    expect(rewardsFor('defend', 'style', 3)).toEqual([{ type: 'boost', to: 'self' }]);
  });
});
