import {
  CONSEQUENCE_SLOTS,
  CONSEQUENCE_VALUE,
  type Character,
  type ConsequenceSlot,
} from './types';

export interface AbsorbPlan {
  stressBox: 1 | 2 | 3 | null;
  consequences: ConsequenceSlot[];
  remaining: number;
}

const SLOT_RANK: Record<ConsequenceSlot, number> = { mild: 1, moderate: 2, severe: 3 };

function subsets<T>(items: T[]): T[][] {
  return items.reduce<T[][]>((acc, item) => acc.concat(acc.map((s) => [...s, item])), [[]]);
}

/**
 * 피해를 완전히 흡수하는 조합만 돌려준다.
 * 규칙: 한 번의 피해에 스트레스 칸은 하나만, 칸 번호만큼 흡수. 후유증은 여러 개 동시 사용 가능.
 * 정렬(최소 손실 우선): 후유증 개수 → 가장 무거운 후유증 슬롯 → 스트레스 칸 번호.
 * 빈 배열이면 탈락 또는 양보만 가능하다.
 */
export function absorbOptions(shifts: number, c: Character): AbsorbPlan[] {
  if (shifts <= 0) return [{ stressBox: null, consequences: [], remaining: 0 }];
  const boxes: Array<1 | 2 | 3 | null> = [null];
  c.stress.forEach((used, i) => {
    if (!used) boxes.push((i + 1) as 1 | 2 | 3);
  });
  const freeSlots = CONSEQUENCE_SLOTS.filter((s) => !c.consequences[s]);

  const plans: AbsorbPlan[] = [];
  for (const box of boxes) {
    for (const cons of subsets(freeSlots)) {
      const absorbed = (box ?? 0) + cons.reduce((a, s) => a + CONSEQUENCE_VALUE[s], 0);
      if (absorbed < shifts) continue;
      // 더 적은 자원으로 이미 막히는 조합은 낭비이므로 제외 (스트레스 칸 하나 또는 후유증 하나를 빼도 충분한 경우)
      if (box !== null && absorbed - box >= shifts) continue;
      if (cons.some((s) => absorbed - CONSEQUENCE_VALUE[s] >= shifts)) continue;
      plans.push({ stressBox: box, consequences: cons, remaining: 0 });
    }
  }
  const heaviest = (p: AbsorbPlan) => Math.max(0, ...p.consequences.map((s) => SLOT_RANK[s]));
  return plans.sort(
    (a, b) =>
      a.consequences.length - b.consequences.length ||
      heaviest(a) - heaviest(b) ||
      (a.stressBox ?? 0) - (b.stressBox ?? 0),
  );
}

/** 계획이 실제로 피해를 흡수하는지, 쓸 수 있는 칸·슬롯인지 검사 */
export function isValidAbsorb(
  shifts: number,
  c: Character,
  plan: Omit<AbsorbPlan, 'remaining'>,
): boolean {
  if (plan.stressBox !== null && c.stress[plan.stressBox - 1]) return false;
  if (new Set(plan.consequences).size !== plan.consequences.length) return false;
  if (plan.consequences.some((s) => c.consequences[s])) return false;
  const absorbed =
    (plan.stressBox ?? 0) + plan.consequences.reduce((a, s) => a + CONSEQUENCE_VALUE[s], 0);
  return absorbed >= shifts;
}

/** 양보 보상: 운명점 1 + 이번 갈등에서 받은 후유증 수 */
export function concedeReward(consequencesTakenThisConflict: number): number {
  return 1 + consequencesTakenThisConflict;
}
