/** 받침을 보고 조사를 고른다: josa('세라', '이/가') → '세라가' */
type Pair = '이/가' | '은/는' | '을/를' | '과/와' | '으로/로' | '이에요/예요';

function lastJong(word: string): number | null {
  // 따옴표·괄호로 감싼 말은 안쪽 마지막 글자로 판단한다 ("부러진 갈비뼈"는 → 뼈)
  const ch = word.trim().replace(/["'”’」』)\]]+$/u, '').at(-1);
  if (!ch) return null;
  const code = ch.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28;
  // 숫자는 읽는 소리로 (일·칠·팔은 ㄹ 받침, 영·삼·육은 다른 받침), 영문은 받침 없다고 본다
  if ('178'.includes(ch)) return 8;
  if ('036'.includes(ch)) return 1;
  return 0;
}

export function josa(word: string, pair: Pair): string {
  const [withJong, without] = pair.split('/') as [string, string];
  const jong = lastJong(word);
  if (jong === null) return word;
  // '으로'는 ㄹ 받침(8) 뒤에서도 '로'
  const has = pair === '으로/로' ? jong !== 0 && jong !== 8 : jong !== 0;
  return word + (has ? withJong : without);
}
