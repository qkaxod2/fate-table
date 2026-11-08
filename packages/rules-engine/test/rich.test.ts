import { describe, expect, it } from 'vitest';
import { hasGmMarks, parseRich, validate } from '../src/index';
import { GM, P1, pc, Table, withCharacters } from './helpers';

describe('parseRich', () => {
  it('bold and italic for everyone', () => {
    expect(parseRich('아주 **굵게** 그리고 *살짝*')).toEqual([
      { text: '아주 ' },
      { text: '굵게', bold: true },
      { text: ' 그리고 ' },
      { text: '살짝', italic: true },
    ]);
    expect(parseRich('***둘 다***')).toEqual([{ text: '둘 다', bold: true, italic: true }]);
  });

  it('leaves unpaired marks as typed', () => {
    expect(parseRich('2*3 = 6')).toEqual([{ text: '2*3 = 6' }]);
    expect(parseRich('**열린 채')).toEqual([{ text: '**열린 채' }]);
    expect(parseRich('[/글리치]만', { gm: true })).toEqual([{ text: '[/글리치]만' }]);
  });

  it('GM effects only when gm', () => {
    const src = '문이 [글리치]열렸다[/글리치] [뒤집기]거꾸로[/뒤집기]';
    expect(parseRich(src)).toEqual([{ text: src }]);
    expect(parseRich(src, { gm: true })).toEqual([
      { text: '문이 ' },
      { text: '열렸다', glitch: true },
      { text: ' ' },
      { text: '거꾸로', flip: true },
    ]);
    expect(parseRich('[글리치]**쾅**[/글리치]', { gm: true })).toEqual([
      { text: '쾅', glitch: true, bold: true },
    ]);
  });

  it('never yields markup, only text', () => {
    const segs = parseRich('<img src=x onerror=alert(1)> **<b>x</b>**');
    expect(segs.map((s) => s.text).join('')).toBe('<img src=x onerror=alert(1)> <b>x</b>');
  });

  it('hasGmMarks only counts paired effects', () => {
    expect(hasGmMarks('[글리치]하나[/글리치]')).toBe(true);
    expect(hasGmMarks('[글리치] 짝 없음')).toBe(false);
    expect(hasGmMarks('**굵게**')).toBe(false);
  });
});

describe('chat.post effects', () => {
  const t = new Table(withCharacters(pc('a', 'u1')));
  it('players may format but not use GM effects', () => {
    expect(
      validate(t.state, { type: 'chat.post', payload: { text: '**좋아** *음*' } }, P1),
    ).toMatchObject({ ok: true });
    expect(
      validate(t.state, { type: 'chat.post', payload: { text: '[뒤집기]헉[/뒤집기]' } }, P1),
    ).toMatchObject({ code: 'FORBIDDEN_ROLE' });
    expect(
      validate(t.state, { type: 'chat.post', payload: { text: '[뒤집기]헉[/뒤집기]' } }, GM),
    ).toMatchObject({ ok: true });
  });
});
