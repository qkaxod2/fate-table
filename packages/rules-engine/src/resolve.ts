import { sumDice } from './dice';
import type { Action, Outcome, RollSide, RollState } from './types';

export function outcomeOf(shifts: number): Outcome {
  if (shifts < 0) return 'fail';
  if (shifts === 0) return 'tie';
  if (shifts < 3) return 'success';
  return 'style';
}

export function sideTotal(side: RollSide): number {
  if (!side.dice) throw new Error('dice are sealed');
  return sumDice(side.dice) + side.rating + side.modifiers.reduce((a, m) => a + m.value, 0);
}

export function opposition(roll: RollState): number {
  if (roll.defense) return sideTotal(roll.defense);
  return roll.difficulty ?? 0;
}

/** 능동 측 기준 결과. 방어자 관점 결과는 outcomeOf(-shifts). */
export function resolveRoll(roll: RollState): { total: number; shifts: number; outcome: Outcome } {
  const total = sideTotal(roll.active);
  const shifts = total - opposition(roll);
  return { total, shifts, outcome: outcomeOf(shifts) };
}

export function outcomeFor(roll: RollState, side: 'active' | 'defense'): Outcome {
  const { shifts } = resolveRoll(roll);
  return outcomeOf(side === 'active' ? shifts : -shifts);
}

export type Reward =
  | { type: 'success_at_minor_cost' }
  | { type: 'success_at_serious_cost_option' }
  | { type: 'boost'; to: 'self' | 'opponent' }
  | { type: 'new_aspect'; freeInvokes: 1 | 2 }
  | { type: 'free_invoke_on_existing'; count: 1 | 2 }
  | { type: 'opponent_free_invoke_option' }
  | { type: 'damage'; shifts: number }
  | { type: 'damage_or_boost'; shifts: number };

/** 행동 × 결과 → 보상 (design-system.md 6절 문구표와 1:1) */
export function rewardsFor(action: Action, outcome: Outcome, shifts: number): Reward[] {
  switch (action) {
    case 'overcome':
      if (outcome === 'fail') return [{ type: 'success_at_serious_cost_option' }];
      if (outcome === 'tie') return [{ type: 'success_at_minor_cost' }];
      if (outcome === 'style') return [{ type: 'boost', to: 'self' }];
      return [];
    case 'create_advantage':
      if (outcome === 'fail') return [{ type: 'opponent_free_invoke_option' }];
      if (outcome === 'tie') return [{ type: 'boost', to: 'self' }];
      if (outcome === 'success') return [{ type: 'new_aspect', freeInvokes: 1 }];
      return [{ type: 'new_aspect', freeInvokes: 2 }];
    case 'attack':
      if (outcome === 'fail') return [];
      if (outcome === 'tie') return [{ type: 'boost', to: 'self' }];
      if (outcome === 'success') return [{ type: 'damage', shifts }];
      return [{ type: 'damage_or_boost', shifts }];
    case 'defend':
      // 방어자 관점 결과. 동점이면 상대가 동점 결과(부스트 등)를 얻는다.
      if (outcome === 'tie') return [{ type: 'boost', to: 'opponent' }];
      if (outcome === 'style') return [{ type: 'boost', to: 'self' }];
      return [];
  }
}
