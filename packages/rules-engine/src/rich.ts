/**
 * 채팅·대사 글자 꾸미기.
 *
 * - `**굵게**`, `*기울임*` : 누구나
 * - `[글리치]…[/글리치]`, `[뒤집기]…[/뒤집기]` : GM 연출 (서버도 GM만 받는다)
 *
 * HTML로 바꾸지 않고 글자 조각 목록으로만 나눈다. 화면은 조각을 글자로만 그리므로
 * 무엇을 적어도 태그가 되지 않는다. 짝이 맞지 않는 표시는 적은 그대로 남는다.
 */

export interface RichStyle {
  bold?: true;
  italic?: true;
  glitch?: true;
  flip?: true;
}

export interface RichSegment extends RichStyle {
  text: string;
}

type Mark = keyof RichStyle;

/** GM만 쓸 수 있는 연출 */
export const GM_MARKS: ReadonlySet<Mark> = new Set<Mark>(['glitch', 'flip']);

export const RICH_TAGS = {
  glitch: ['[글리치]', '[/글리치]'],
  flip: ['[뒤집기]', '[/뒤집기]'],
} as const;

type Token =
  | { kind: 'text'; text: string }
  | { kind: 'mark'; mark: Mark; role: 'toggle' | 'open' | 'close'; raw: string };

const TOKEN = /\*\*|\*|\[\/?(?:글리치|뒤집기)\]/g;
const TAG_MARK: Record<string, Mark> = { 글리치: 'glitch', 뒤집기: 'flip' };

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let at = 0;
  for (const m of src.matchAll(TOKEN)) {
    if (m.index > at) out.push({ kind: 'text', text: src.slice(at, m.index) });
    const raw = m[0];
    if (raw === '**') out.push({ kind: 'mark', mark: 'bold', role: 'toggle', raw });
    else if (raw === '*') out.push({ kind: 'mark', mark: 'italic', role: 'toggle', raw });
    else {
      const close = raw[1] === '/';
      const mark = TAG_MARK[raw.slice(close ? 2 : 1, -1)]!;
      out.push({ kind: 'mark', mark, role: close ? 'close' : 'open', raw });
    }
    at = m.index + raw.length;
  }
  if (at < src.length) out.push({ kind: 'text', text: src.slice(at) });
  return out;
}

/**
 * 글을 꾸밈 조각으로 나눈다. gm이 아니면 GM 연출 표시는 글자로 남긴다
 * (예전 기록이나 서버를 거치지 않은 글이 연출을 흉내 내지 못하게).
 */
export function parseRich(src: string, opts: { gm?: boolean } = {}): RichSegment[] {
  const tokens = tokenize(src);
  // 짝 찾기: 같은 종류의 여는 표시와 닫는 표시만 짝이 된다
  const paired = new Set<number>();
  const openAt: Partial<Record<Mark, number>> = {};
  tokens.forEach((t, i) => {
    if (t.kind !== 'mark') return;
    if (GM_MARKS.has(t.mark) && !opts.gm) return;
    const o = openAt[t.mark];
    if (t.role === 'open') openAt[t.mark] = i;
    else if (o !== undefined && (t.role === 'close' || t.role === 'toggle')) {
      paired.add(o).add(i);
      delete openAt[t.mark];
    } else if (t.role === 'toggle') openAt[t.mark] = i;
  });

  const segs: RichSegment[] = [];
  const on: RichStyle = {};
  const push = (text: string) => {
    if (!text) return;
    const last = segs.at(-1);
    if (last && sameStyle(last, on)) last.text += text;
    else segs.push({ text, ...on });
  };
  tokens.forEach((t, i) => {
    if (t.kind === 'text') return push(t.text);
    if (!paired.has(i)) return push(t.raw);
    if (on[t.mark]) delete on[t.mark];
    else on[t.mark] = true;
  });
  return segs;
}

function sameStyle(a: RichStyle, b: RichStyle): boolean {
  return (
    !!a.bold === !!b.bold &&
    !!a.italic === !!b.italic &&
    !!a.glitch === !!b.glitch &&
    !!a.flip === !!b.flip
  );
}

/** 이 글에 GM 연출이 실제로 걸리는지 (짝이 맞는 연출 표시가 있는지) */
export function hasGmMarks(src: string): boolean {
  return parseRich(src, { gm: true }).some((s) => s.glitch || s.flip);
}
