import { describe, expect, it } from 'vitest';
import { absorbOptions, concedeReward, isValidAbsorb } from '../src/index';
import { pc } from './helpers';

describe('absorbOptions', () => {
  it('#13 takes 3 shifts on the 3-box first', () => {
    expect(absorbOptions(3, pc('a', 'u1'))[0]).toEqual({
      stressBox: 3,
      consequences: [],
      remaining: 0,
    });
  });

  it('#14 uses a consequence when the 3-box is already checked', () => {
    const plans = absorbOptions(5, pc('a', 'u1', { stress: [false, false, true] }));
    expect(plans[0]).toEqual({ stressBox: 1, consequences: ['moderate'], remaining: 0 });
    expect(plans.every((p) => p.stressBox !== 3)).toBe(true);
  });

  it('#15 leaves only taken out / concede when nothing can absorb the hit', () => {
    // 최대 흡수량은 3 + 2 + 4 + 6 = 15
    expect(absorbOptions(15, pc('a', 'u1')).length).toBeGreaterThan(0);
    expect(absorbOptions(16, pc('a', 'u1'))).toEqual([]);
  });

  it('#25 prefers the least costly combination', () => {
    const plans = absorbOptions(4, pc('a', 'u1'));
    expect(plans.slice(0, 3)).toEqual([
      { stressBox: 2, consequences: ['mild'], remaining: 0 },
      { stressBox: 3, consequences: ['mild'], remaining: 0 },
      { stressBox: null, consequences: ['moderate'], remaining: 0 },
    ]);
  });

  it('skips filled consequence slots', () => {
    const c = pc('a', 'u1', { consequences: { mild: { aspectId: 'm', recovering: false } } });
    expect(absorbOptions(4, c).some((p) => p.consequences.includes('mild'))).toBe(false);
  });

  it('validates a hand-picked plan', () => {
    const c = pc('a', 'u1', { stress: [true, false, false] });
    expect(isValidAbsorb(2, c, { stressBox: 1, consequences: [] })).toBe(false);
    expect(isValidAbsorb(2, c, { stressBox: 2, consequences: [] })).toBe(true);
    expect(isValidAbsorb(5, c, { stressBox: 2, consequences: ['mild'] })).toBe(false);
  });

  it('pays 1 + consequences taken for conceding', () => {
    expect(concedeReward(0)).toBe(1);
    expect(concedeReward(2)).toBe(3);
  });
});
