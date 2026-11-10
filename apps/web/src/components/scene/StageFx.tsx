'use client';

import { useEffect, type RefObject } from 'react';
import { term } from '@fate/glossary';
import { reducedMotion } from '@/lib/motion';
import type { StageFxKind } from './stageBeat';
import styles from './StageFx.module.css';

/** 무대가 흔들리는 세기 (px)와 길이 (ms) */
const SHAKE: Partial<Record<StageFxKind, [number, number]>> = {
  shake: [9, 620],
  hit: [5, 320],
  down: [4, 420],
  conflict: [3, 300],
};

function jitter(px: number): Keyframe[] {
  const k: Keyframe[] = [];
  for (let i = 0; i < 9; i++) {
    const f = px * (1 - i / 9);
    const x = (i % 2 ? -1 : 1) * f;
    const y = (i % 3 === 0 ? 1 : -1) * f * 0.45;
    k.push({ translate: `${x.toFixed(1)}px ${y.toFixed(1)}px` });
  }
  k.push({ translate: '0 0' });
  return k;
}

/**
 * 무대 전체에 거는 짧은 효과: 흔들림 · 번쩍 · 어둠 · 맞음(붉은 테) · 쓰러짐(검은 테) · 갈등 시작(띠).
 * 겹친 막 하나와, 무대를 잠깐 흔드는 Web Animation으로 그린다. 움직임 줄이기를 켜면 흔들지 않는다.
 */
export function StageFx({
  fx,
  stage,
}: {
  fx: { seq: number; kind: StageFxKind } | null;
  stage: RefObject<HTMLElement | null>;
}) {
  const seq = fx?.seq;
  const kind = fx?.kind;
  useEffect(() => {
    if (seq == null || !kind || reducedMotion()) return;
    const s = SHAKE[kind];
    if (!s) return;
    const a = stage.current?.animate(jitter(s[0]), { duration: s[1], easing: 'linear' });
    return () => a?.cancel();
  }, [seq, kind, stage]);
  if (!fx) return null;
  return (
    <div key={fx.seq} className={styles.fx} data-kind={fx.kind} aria-hidden>
      {fx.kind === 'conflict' && <p className={styles.banner}>{term('conflict')}</p>}
    </div>
  );
}
