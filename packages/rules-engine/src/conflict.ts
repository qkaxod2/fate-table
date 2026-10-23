import type { Character } from './types';

/** 물리 갈등은 신속, 정신 갈등은 신중 순서(내림차순). 동률은 이름순. */
export function turnOrder(kind: 'physical' | 'mental', participants: Character[]): string[] {
  const key = kind === 'physical' ? 'quick' : 'careful';
  return [...participants]
    .sort((a, b) => b.approaches[key] - a.approaches[key] || a.name.localeCompare(b.name, 'ko'))
    .map((c) => c.id);
}

export const CONTEST_VICTORIES_TO_WIN = 3;
