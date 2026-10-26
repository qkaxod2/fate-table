'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import styles from './Dock.module.css';

/**
 * 목차형 행동을 담는 자리. 넓은 화면에서는 책 맨 아래에 그대로 놓이고,
 * 좁은 화면(1100px 이하)에서는 화면 아래에 붙은 띠가 된다. 띠의 높이를 --dock-h로 알려서
 * 판정 예고 카드와 책 본문이 그만큼 비켜 선다.
 */
export function Dock({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const root = document.documentElement;
    const set = () =>
      root.style.setProperty('--dock-h', `${Math.ceil(el.getBoundingClientRect().height)}px`);
    const ro = new ResizeObserver(set);
    ro.observe(el);
    set();
    return () => {
      ro.disconnect();
      root.style.removeProperty('--dock-h');
    };
  }, []);
  return (
    <div ref={ref} className={styles.dock} data-actions-dock="">
      {children}
    </div>
  );
}
