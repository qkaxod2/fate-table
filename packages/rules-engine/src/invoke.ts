import { chanceAtLeast, sumDice } from './dice';
import { opposition, outcomeOf, resolveRoll, sideTotal } from './resolve';
import type { Aspect, Dice, Outcome, RollSide, RollState } from './types';

export type InvokeMode = 'bonus' | 'reroll';
export type PaidWith = 'fate_point' | 'free_invoke';
export type InvokeSide = 'active' | 'defense';

/** 발동하는 쪽. NPC면 fatePoints에 GM 풀을 넘긴다. */
export interface Payer {
  characterId: string;
  fatePoints: number;
}

export interface InvokeInput {
  side: InvokeSide;
  aspectId: string;
  mode: InvokeMode;
  paidWith: PaidWith;
  /** mode=reroll일 때 서버가 새로 굴린 주사위 */
  newDice?: Dice;
}

export type InvokeError =
  | 'NOT_ENOUGH_FATE_POINTS'
  | 'ASPECT_ALREADY_INVOKED'
  | 'HIDDEN'
  | 'NO_FREE_INVOKES'
  | 'ROLL_NOT_OPEN';

function sideOf(roll: RollState, side: InvokeSide): RollSide | null {
  return side === 'active' ? roll.active : roll.defense;
}

/**
 * 규칙: 같은 굴림에서 같은 특성은 운명점으로 한 번만 발동할 수 있다.
 * 무료 발동은 예외로 겹쳐 쓸 수 있다. 숨겨진 특성은 발동할 수 없다.
 */
export function canInvoke(
  roll: RollState,
  aspect: Aspect,
  payer: Payer,
  side: InvokeSide = 'active',
  paidWith: PaidWith = 'fate_point',
): { ok: true } | { ok: false; code: InvokeError } {
  const s = sideOf(roll, side);
  if (roll.status !== 'open' || !s) return { ok: false, code: 'ROLL_NOT_OPEN' };
  if (aspect.hidden) return { ok: false, code: 'HIDDEN' };
  if (paidWith === 'free_invoke') {
    return aspect.freeInvokes > 0 ? { ok: true } : { ok: false, code: 'NO_FREE_INVOKES' };
  }
  if (s.paidInvokes.includes(aspect.id)) return { ok: false, code: 'ASPECT_ALREADY_INVOKED' };
  if (payer.fatePoints < 1) return { ok: false, code: 'NOT_ENOUGH_FATE_POINTS' };
  return { ok: true };
}

export interface InvokePreview {
  aspectId: string;
  mode: InvokeMode;
  free: boolean;
  /** bonus: 확정 결과. reroll: 결과를 미리 알 수 없어 null */
  outcomeAfter: Outcome | null;
  improves: boolean;
  /** reroll일 때 지금보다 좋은 결과가 나올 확률 (0~1) */
  improveChance?: number;
}

const RANK: Record<Outcome, number> = { fail: 0, tie: 1, success: 2, style: 3 };

/** 발동 트레이에 보여줄 선택지. 결과를 바꾸는 카드(improves)를 강조하는 데 쓴다. */
export function previewInvokes(
  roll: RollState,
  aspects: Aspect[],
  payer: Payer,
  side: InvokeSide = 'active',
): InvokePreview[] {
  const s = sideOf(roll, side);
  if (roll.status !== 'open' || !s?.dice) return [];
  const sign = side === 'active' ? 1 : -1;
  const shifts = resolveRoll(roll).shifts * sign;
  const now = outcomeOf(shifts);
  const otherTotal = side === 'active' ? opposition(roll) : sideTotal(roll.active);
  const withoutDice = sideTotal(s) - sumDice(s.dice);

  const out: InvokePreview[] = [];
  for (const a of aspects) {
    const free = a.freeInvokes > 0;
    const paidWith: PaidWith = free ? 'free_invoke' : 'fate_point';
    if (!canInvoke(roll, a, payer, side, paidWith).ok) continue;
    const after = outcomeOf(shifts + 2);
    out.push({
      aspectId: a.id,
      mode: 'bonus',
      free,
      outcomeAfter: after,
      improves: RANK[after] > RANK[now],
    });
    // 다시 굴려서 지금보다 한 단계라도 좋아질 확률
    const nextRankShifts =
      now === 'fail' ? 0 : now === 'tie' ? 1 : now === 'success' ? 3 : Infinity;
    const needed = otherTotal + nextRankShifts - withoutDice;
    const chance = Number.isFinite(needed) ? chanceAtLeast(needed) : 0;
    out.push({
      aspectId: a.id,
      mode: 'reroll',
      free,
      outcomeAfter: null,
      improves: chance > 0,
      improveChance: chance,
    });
  }
  return out;
}

/** 굴림 상태에만 반영. 운명점·무료 발동 차감은 리듀서가 처리한다. */
export function applyInvoke(roll: RollState, inv: InvokeInput): RollState {
  const s = sideOf(roll, inv.side);
  if (!s) throw new Error('no such side');
  const next: RollSide = {
    ...s,
    paidInvokes: inv.paidWith === 'fate_point' ? [...s.paidInvokes, inv.aspectId] : s.paidInvokes,
  };
  if (inv.mode === 'bonus') {
    next.modifiers = [...s.modifiers, { source: `aspect:${inv.aspectId}`, value: 2 }];
  } else {
    if (!inv.newDice) throw new Error('reroll requires newDice');
    next.dice = inv.newDice;
  }
  return inv.side === 'active' ? { ...roll, active: next } : { ...roll, defense: next };
}
