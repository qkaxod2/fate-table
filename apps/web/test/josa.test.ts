import { describe, expect, it } from 'vitest';
import { josa } from '@/lib/josa';

describe('josa', () => {
  it('받침에 맞는 조사를 고른다', () => {
    expect(josa('세라', '이/가')).toBe('세라가');
    expect(josa('하윤', '이/가')).toBe('하윤이');
    expect(josa('불길', '으로/로')).toBe('불길로');
    expect(josa('특성', '으로/로')).toBe('특성으로');
  });

  it('숫자는 읽는 소리로 본다', () => {
    expect(josa('준수 +2', '이에요/예요')).toBe('준수 +2예요');
    expect(josa('양호 +3', '이에요/예요')).toBe('양호 +3이에요');
  });

  it('따옴표·괄호 안의 마지막 글자로 판단한다', () => {
    expect(josa('"그을린 팔"', '은/는')).toBe('"그을린 팔"은');
    expect(josa('"부러진 갈비뼈"', '은/는')).toBe('"부러진 갈비뼈"는');
    expect(josa('「맹세를 어길 수 없다」', '이에요/예요')).toBe('「맹세를 어길 수 없다」예요');
  });
});
