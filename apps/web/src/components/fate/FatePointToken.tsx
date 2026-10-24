'use client';

import { term } from '@fate/glossary';
import { useEffect, useRef, useState } from 'react';
import styles from './FatePointToken.module.css';

/** 운명점 토큰 줄. 개수가 바뀌면 바뀐 토큰이 튀고, 옆에 +1 / −1이 떠오른다 */
export function FatePointToken({ count, max = 5 }: { count: number; max?: number }) {
  const shown = Math.max(count, Math.min(max, 3));
  const prev = useRef(count);
  const [bump, setBump] = useState<{ delta: number; n: number } | null>(null);
  useEffect(() => {
    const delta = count - prev.current;
    prev.current = count;
    if (delta === 0) return;
    setBump((b) => ({ delta, n: (b?.n ?? 0) + 1 }));
    const t = window.setTimeout(() => setBump(null), 900);
    return () => window.clearTimeout(t);
  }, [count]);
  return (
    <span
      className={styles.row}
      role="img"
      aria-label={`${term('fatePoint')} ${count}`}
      data-bump={bump ? (bump.delta > 0 ? 'up' : 'down') : undefined}
    >
      {Array.from({ length: shown }, (_, i) => (
        <span
          key={i}
          className={styles.token}
          data-empty={i >= count || undefined}
          data-changed={
            (bump &&
              (bump.delta > 0
                ? i >= count - bump.delta && i < count
                : i >= count && i < count - bump.delta)) ||
            undefined
          }
        />
      ))}
      {bump && (
        <span key={bump.n} className={styles.delta}>
          {bump.delta > 0 ? `+${bump.delta}` : `−${-bump.delta}`}
        </span>
      )}
    </span>
  );
}
