'use client';

import { useState, type ReactNode } from 'react';
import { reducedMotion, revealOnNarrow } from '@/lib/motion';
import styles from './RollSheet.module.css';

/**
 * 판정 카드와 발동 카드 줄을 함께 담는 자리.
 * 넓은 화면에서는 아무 상자도 만들지 않아(display: contents) 무대 가운데·테이블에 그대로 놓이고,
 * 좁은 화면에서 굴림이 진행 중이면 화면 아래 바텀 시트가 된다. 시트는 접어 둘 수 있다.
 */
export function RollSheet({
  active,
  resetKey,
  summary,
  children,
}: {
  /** 시트로 띄울 굴림이 진행 중인지 */
  active: boolean;
  /** 바뀌면(새 굴림) 접어 둔 시트를 다시 편다 */
  resetKey: string;
  /** 접었을 때 보이는 한 줄 */
  summary: ReactNode;
  children: ReactNode;
}) {
  const [min, setMin] = useState(false);
  const [seen, setSeen] = useState(resetKey);
  if (seen !== resetKey) {
    setSeen(resetKey);
    setMin(false);
  }
  return (
    <div className={styles.zone} data-sheet={active ? (min ? 'min' : 'open') : undefined}>
      {active && (
        <div className={styles.grip}>
          <span className={styles.summary}>{summary}</span>
          <button
            type="button"
            className={styles.toggle}
            aria-expanded={!min}
            onClick={() => setMin((m) => !m)}
          >
            {min ? '펼치기 ▴' : '접기 ▾'}
          </button>
        </div>
      )}
      {children}
    </div>
  );
}

/**
 * 결과가 나오면 판정 카드가 보이게 한다. 바텀 시트 안에 있으면 시트가 이미 화면 아래에 떠 있으니
 * 무대(두 사람이 맞선 모습)가 시트 위로 보이도록 맨 위로 올리고, 아니면 revealOnNarrow로 카드까지 내려간다.
 */
export function revealRoll(el: Element | null): void {
  if (!el) return;
  if (el.closest('[data-sheet]') && window.matchMedia('(max-width: 1100px)').matches) {
    window.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' });
    return;
  }
  revealOnNarrow(el);
}
