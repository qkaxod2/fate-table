'use client';

import { RICH_TAGS } from '@fate/rules-engine';
import type { KeyboardEvent, RefObject } from 'react';
import styles from './FormatBar.module.css';

type Field = HTMLInputElement | HTMLTextAreaElement;

interface Mark {
  id: 'bold' | 'italic' | 'glitch' | 'flip';
  open: string;
  close: string;
  label: string;
  title: string;
  gm?: true;
}

const MARKS: readonly Mark[] = [
  { id: 'bold', open: '**', close: '**', label: 'B', title: '굵게 **글자** (Ctrl+B)' },
  { id: 'italic', open: '*', close: '*', label: 'I', title: '기울임 *글자* (Ctrl+I)' },
  {
    id: 'glitch',
    open: RICH_TAGS.glitch[0],
    close: RICH_TAGS.glitch[1],
    label: '글리치',
    title: 'GM 연출: 글자 지직거림',
    gm: true,
  },
  {
    id: 'flip',
    open: RICH_TAGS.flip[0],
    close: RICH_TAGS.flip[1],
    label: '뒤집기',
    title: 'GM 연출: 글자 뒤집기',
    gm: true,
  },
];

/**
 * 고른 글자를 표시로 감싼다 (이미 감싸져 있으면 벗긴다). 고른 게 없으면 표시 한 쌍을 넣고
 * 그 사이에 커서를 둔다.
 */
function toggle(el: Field, value: string, set: (v: string) => void, m: Mark) {
  const a = el.selectionStart ?? value.length;
  const b = el.selectionEnd ?? a;
  const wrapped =
    value.slice(a - m.open.length, a) === m.open && value.slice(b, b + m.close.length) === m.close;
  let next: string;
  let sel: [number, number];
  if (wrapped && a !== b) {
    next = value.slice(0, a - m.open.length) + value.slice(a, b) + value.slice(b + m.close.length);
    sel = [a - m.open.length, b - m.open.length];
  } else {
    next = value.slice(0, a) + m.open + value.slice(a, b) + m.close + value.slice(b);
    sel = [a + m.open.length, b + m.open.length];
  }
  set(next);
  requestAnimationFrame(() => {
    el.focus();
    el.setSelectionRange(...sel);
  });
}

interface Props {
  field: RefObject<Field | null>;
  value: string;
  onChange: (v: string) => void;
  /** GM이면 글리치·뒤집기 연출 버튼도 보인다 */
  gm?: boolean;
}

/** 입력창 옆의 작은 꾸밈 버튼들 */
export function FormatBar({ field, value, onChange, gm }: Props) {
  return (
    <div className={styles.bar} role="toolbar" aria-label="글자 꾸미기">
      {MARKS.filter((m) => gm || !m.gm).map((m) => (
        <button
          key={m.id}
          type="button"
          className={styles.btn}
          data-mark={m.id}
          title={m.title}
          aria-label={m.title}
          // 누를 때 입력창의 선택이 풀리지 않게
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => field.current && toggle(field.current, value, onChange, m)}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

/** Ctrl/⌘+B, Ctrl/⌘+I. 처리했으면 true */
export function formatShortcut(
  e: KeyboardEvent<Field>,
  value: string,
  onChange: (v: string) => void,
): boolean {
  if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return false;
  const key = e.key.toLowerCase();
  const m = MARKS.find(
    (x) => (key === 'b' && x.id === 'bold') || (key === 'i' && x.id === 'italic'),
  );
  if (!m) return false;
  e.preventDefault();
  toggle(e.currentTarget, value, onChange, m);
  return true;
}
