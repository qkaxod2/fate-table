import {
  APPROACHES,
  type Action,
  type Approach,
  type Aspect,
  type Character,
  type Stunt,
} from './types';

export type CharacterIssue =
  'APPROACH_SPREAD' | 'TOO_MANY_STUNTS' | 'MISSING_HIGH' | 'MISSING_TROUBLE';

const STANDARD_SPREAD = [3, 2, 2, 1, 1, 0];
export const MAX_STUNTS = 5;

/** 특기 3개까지는 무료, 넘을 때마다 재충전 −1 (최소 1) */
export function refreshFor(stuntCount: number): number {
  return Math.max(1, 3 - Math.max(0, stuntCount - 3));
}

/**
 * PC 생성 규칙 검사. 접근법은 +3×1, +2×2, +1×2, +0×1.
 * aspects를 넘기면 핵심 컨셉·약점 유무도 검사한다. NPC는 자유 형식이라 검사하지 않는다.
 */
export function validateCharacter(
  c: Character,
  aspects?: Aspect[],
): { ok: true } | { ok: false; issues: CharacterIssue[] } {
  if (c.isNpc) return { ok: true };
  const issues: CharacterIssue[] = [];
  const spread = APPROACHES.map((a) => c.approaches[a]).sort((x, y) => y - x);
  if (spread.some((v, i) => v !== STANDARD_SPREAD[i])) issues.push('APPROACH_SPREAD');
  if (c.stunts.length > MAX_STUNTS) issues.push('TOO_MANY_STUNTS');
  if (aspects) {
    const mine = aspects.filter((a) => a.ownerType === 'character' && a.ownerId === c.id);
    if (!mine.some((a) => a.kind === 'high')) issues.push('MISSING_HIGH');
    if (!mine.some((a) => a.kind === 'trouble')) issues.push('MISSING_TROUBLE');
  }
  return issues.length ? { ok: false, issues } : { ok: true };
}

export function startOfSessionFatePoints(c: Character): number {
  return Math.max(c.fatePoints, c.refresh);
}

/** 이 행동·접근법 조합에 적용할 수 있는 +2 특기 */
export function stuntBonuses(c: Character, action: Action, approach: Approach): Stunt[] {
  return c.stunts.filter(
    (s) => s.kind === 'bonus' && s.bonus?.action === action && s.bonus.approach === approach,
  );
}

export function blankCharacter(
  id: string,
  name: string,
  ownerId: string | null,
  isNpc = false,
): Character {
  return {
    id,
    name,
    isNpc,
    ownerId,
    approaches: { careful: 0, clever: 0, flashy: 0, forceful: 0, quick: 0, sneaky: 0 },
    stunts: [],
    refresh: 3,
    fatePoints: 3,
    stress: [false, false, false],
    consequences: {},
  };
}
