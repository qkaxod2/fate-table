'use client';

import { useEffect, useState } from 'react';
import styles from './SceneFade.module.css';

const FADE_MS = 900;

/**
 * 장면 배경이 바뀌면 앞 배경을 위에 잠깐 남겨 두고 천천히 걷어 낸다 (교차 페이드).
 * 새 배경은 부모(무대)의 background에 바로 깔린다. 부모는 isolation: isolate여야 한다.
 */
export function SceneFade({ background }: { background: string }) {
  const [shown, setShown] = useState(background);
  const [prev, setPrev] = useState<string | null>(null);
  if (background !== shown) {
    setPrev(shown);
    setShown(background);
  }
  useEffect(() => {
    if (!prev) return;
    const t = window.setTimeout(() => setPrev(null), FADE_MS);
    return () => window.clearTimeout(t);
  }, [prev]);
  if (!prev) return null;
  return <div key={prev} className={styles.fade} style={{ backgroundImage: prev }} aria-hidden />;
}
