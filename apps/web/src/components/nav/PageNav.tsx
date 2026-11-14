'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { historyDepth } from './history';
import styles from './PageNav.module.css';

/**
 * 모든 하위 화면 왼쪽 위의 길잡이: "← 뒤로 · 로비".
 * 뒤로는 사이트 안에서 온 길이 있으면 브라우저 뒤로가기와 똑같이, 없으면 fallback 화면으로 간다.
 */
export function PageNav({
  fallback = '/',
  backLabel = '뒤로',
  className,
  tone = 'paper',
}: {
  /** 사이트 안에서 온 길이 없을 때 뒤로 단추가 갈 곳 */
  fallback?: string;
  backLabel?: string;
  className?: string;
  /** paper: 종이 위 먹 글자 · stage: 어두운 무대 위 밝은 글자 */
  tone?: 'paper' | 'stage';
}) {
  const router = useRouter();
  const back = () => {
    if (historyDepth() > 0) router.back();
    else router.push(fallback);
  };
  return (
    <nav aria-label="화면 이동" className={`${styles.nav} ${className ?? ''}`} data-tone={tone}>
      <button type="button" className={styles.link} onClick={back}>
        ← {backLabel}
      </button>
      <span className={styles.dot} aria-hidden>
        ·
      </span>
      <Link href="/" className={styles.link}>
        로비
      </Link>
    </nav>
  );
}
