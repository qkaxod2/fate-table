'use client';

import { useEffect, useRef } from 'react';
import styles from './theater.module.css';

const KEY = 'fate:dialogue-h';
const MIN = 120;
const STEP = 32;
/** 이만큼 넘게 움직여야 끌기로 본다 (그보다 작으면 누른 것) */
const DRAG = 4;

/** 펼친 글 칸이 쓸 수 있는 가장 큰 높이: 화면의 70% (위쪽 제목·도구는 남긴다) */
const maxH = () => Math.max(MIN, Math.round(window.innerHeight * 0.7));
const clamp = (h: number) => Math.min(maxH(), Math.max(MIN, Math.round(h)));

function readSaved(): number | null {
  try {
    const v = Number(localStorage.getItem(KEY));
    return v > 0 ? v : null;
  } catch {
    return null;
  }
}

function save(h: number | null) {
  try {
    if (h === null) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, String(h));
  } catch {
    /* 저장이 막힌 창에서는 이번 화면에서만 기억한다 */
  }
}

/**
 * 대사창 윗변의 손잡이.
 * 누르면 이야기 칸을 펼치거나 접는다 (접힌 칸은 최근 몇 줄만 보인다).
 * 위아래로 끌면 펼친 높이를 바꾸고 기억한다 (접힌 채로 끌어 올리면 펼쳐진다). 두 번 누르면 원래 높이로.
 * 키보드: Enter·Space 펼치기/접기, 펼친 채로 ↑↓ 높이, Home 원래 높이.
 * 높이는 대사창의 `--say-h`로 넘기며, 대사창 안의 `.text`가 펼쳤을 때 그 값을 쓴다.
 */
export function DialogueGrip({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  /** 끌어서 정한 높이 (없으면 기본 높이). 끄는 동안 자주 바뀌므로 상태 대신 DOM에 바로 쓴다 */
  const hRef = useRef<number | null>(null);
  /** 방금 끌기로 끝났으면 뒤따르는 click을 펼치기/접기로 치지 않는다 */
  const dragged = useRef(false);

  const apply = (h: number | null) => {
    hRef.current = h;
    const box = ref.current?.parentElement;
    if (!box) return;
    if (h === null) box.style.removeProperty('--say-h');
    else box.style.setProperty('--say-h', `${h}px`);
  };

  useEffect(() => {
    const saved = readSaved();
    if (saved) apply(clamp(saved));
  }, []);

  /** 지금 펼친 글 칸의 높이 (아직 끌지 않았으면 그려진 높이) */
  const current = () => {
    const text = ref.current?.parentElement?.querySelector<HTMLElement>(`.${styles.text}`);
    return hRef.current ?? text?.offsetHeight ?? 320;
  };

  const set = (next: number | null) => {
    const v = next === null ? null : clamp(next);
    apply(v);
    save(v);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    const el = e.currentTarget;
    const startY = e.clientY;
    let startH = 0;
    let last: number | null = null;
    dragged.current = false;
    const move = (ev: PointerEvent) => {
      const dy = startY - ev.clientY;
      if (!dragged.current) {
        if (Math.abs(dy) < DRAG) return;
        dragged.current = true;
        el.setPointerCapture(ev.pointerId);
        // 접힌 채로 끌면 펼치고, 펼친 높이에서부터 늘린다
        if (!open) onOpenChange(true);
        startH = open ? current() : (hRef.current ?? Math.round(window.innerHeight * 0.45));
      }
      last = clamp(startH + dy);
      apply(last);
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      if (last !== null) save(last);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };

  return (
    <button
      ref={ref}
      type="button"
      className={styles.grip}
      aria-expanded={open}
      aria-label={open ? '이야기 접기' : '지난 이야기 펼치기'}
      title={
        open ? '누르면 접기 · 끌어서 높이 조절' : '누르면 지난 이야기 펼치기 · 끌어 올려도 된다'
      }
      onPointerDown={onPointerDown}
      onClick={() => {
        if (dragged.current) {
          dragged.current = false;
          return;
        }
        onOpenChange(!open);
      }}
      onDoubleClick={() => open && set(null)}
      onKeyDown={(e) => {
        if (!open) return;
        if (e.key === 'ArrowUp') set(current() + STEP);
        else if (e.key === 'ArrowDown') set(current() - STEP);
        else if (e.key === 'Home') set(null);
        else return;
        e.preventDefault();
      }}
    >
      <span aria-hidden>{open ? '접기' : '펼치기'}</span>
    </button>
  );
}
