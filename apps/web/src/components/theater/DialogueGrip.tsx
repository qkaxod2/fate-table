'use client';

import { useEffect, useRef } from 'react';
import styles from './theater.module.css';

const KEY = 'fate:dialogue-h';
const MIN = 96;
const STEP = 32;

/** 글 칸이 쓸 수 있는 가장 큰 높이: 화면의 60% (위쪽 제목·도구는 남긴다) */
const maxH = () => Math.max(MIN, Math.round(window.innerHeight * 0.6));
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
 * 대사창 윗변의 손잡이. 위아래로 끌면 글 칸(이야기 기록)이 커지거나 작아지고, 고른 높이는 기억한다.
 * 두 번 누르면 기본 높이로 돌아간다. 키보드로는 ↑↓, Home(기본).
 * 높이는 대사창의 `--say-h`로 넘기며, 대사창 안의 `.text`가 그 값을 쓴다.
 */
export function DialogueGrip() {
  const ref = useRef<HTMLDivElement>(null);
  /** 끌어서 정한 높이 (없으면 화면에 맞춘 기본 높이). 끄는 동안 자주 바뀌므로 상태 대신 DOM에 바로 쓴다 */
  const hRef = useRef<number | null>(null);

  const apply = (h: number | null) => {
    hRef.current = h;
    const grip = ref.current;
    const box = grip?.parentElement;
    if (!grip || !box) return;
    if (h === null) {
      box.style.removeProperty('--say-h');
      grip.removeAttribute('aria-valuenow');
    } else {
      box.style.setProperty('--say-h', `${h}px`);
      grip.setAttribute('aria-valuenow', String(h));
    }
  };

  useEffect(() => {
    const saved = readSaved();
    if (saved) apply(clamp(saved));
  }, []);

  /** 지금 글 칸의 실제 높이 (아직 끌지 않았으면 기본값으로 그려진 높이) */
  const current = () => {
    const text = ref.current?.parentElement?.querySelector<HTMLElement>(`.${styles.text}`);
    return hRef.current ?? text?.offsetHeight ?? 200;
  };

  const set = (next: number | null) => {
    const v = next === null ? null : clamp(next);
    apply(v);
    save(v);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const startY = e.clientY;
    const startH = current();
    let last = startH;
    const move = (ev: PointerEvent) => {
      last = clamp(startH + (startY - ev.clientY));
      apply(last);
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      save(last);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };

  return (
    <div
      ref={ref}
      className={styles.grip}
      role="separator"
      aria-orientation="horizontal"
      aria-label="이야기 칸 높이 (끌어서 조절, 두 번 누르면 원래대로)"
      aria-valuemin={MIN}
      tabIndex={0}
      title="끌어서 이야기 칸 높이 조절 · 두 번 누르면 원래대로"
      onPointerDown={onPointerDown}
      onDoubleClick={() => set(null)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowUp') set(current() + STEP);
        else if (e.key === 'ArrowDown') set(current() - STEP);
        else if (e.key === 'Home') set(null);
        else return;
        e.preventDefault();
      }}
    />
  );
}
