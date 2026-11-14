/**
 * 이름의 첫 글자 (이니셜 도장용). 이모지·결합 문자를 쪼개지 않도록 글자 단위로 자르고,
 * 앞의 공백·보이지 않는 글자는 건너뛴다.
 */
export function initialOf(name: string | undefined): string {
  const s = (name ?? '').replace(/^[\s​-‏⁠ㅤ﻿ﾠ]+/u, '');
  if (!s) return '?';
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const first = new Intl.Segmenter('ko', { granularity: 'grapheme' })
      .segment(s)
      [Symbol.iterator]()
      .next();
    if (!first.done) return first.value.segment;
  }
  return Array.from(s)[0] ?? '?';
}
