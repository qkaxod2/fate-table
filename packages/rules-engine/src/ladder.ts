import { LADDER_LABELS } from '@fate/glossary';

export const LADDER = LADDER_LABELS;

/** 범위 밖은 "전설+2", "최악-1"처럼 표기 */
export function ladderLabel(n: number): string {
  if (n > 8) return `${LADDER[8]}+${n - 8}`;
  if (n < -2) return `${LADDER[-2]}${n + 2}`;
  return LADDER[n]!;
}

export function formatRating(n: number): string {
  return `${ladderLabel(n)} ${n >= 0 ? '+' : ''}${n}`;
}
