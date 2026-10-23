import type { Dice, DieFace, Rng } from './types';

const FACES: readonly DieFace[] = [-1, 0, 1];

/** 4dF. 서버에서는 rng로 crypto.randomInt를 넘긴다. */
export function rollFateDice(rng: Rng): Dice {
  return [0, 0, 0, 0].map(() => FACES[rng(3)]!) as Dice;
}

export function sumDice(dice: readonly DieFace[]): number {
  return dice.reduce<number>((acc, d) => acc + d, 0);
}

/** 4dF 합계별 경우의 수 (총 81). -4..+4 */
export const FATE_DICE_DISTRIBUTION: Readonly<Record<number, number>> = {
  [-4]: 1,
  [-3]: 4,
  [-2]: 10,
  [-1]: 16,
  0: 19,
  1: 16,
  2: 10,
  3: 4,
  4: 1,
};

/** 4dF 합계가 min 이상일 확률 */
export function chanceAtLeast(min: number): number {
  let hits = 0;
  for (let n = -4; n <= 4; n++) if (n >= min) hits += FATE_DICE_DISTRIBUTION[n]!;
  return hits / 81;
}
