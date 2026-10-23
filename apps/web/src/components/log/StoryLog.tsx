'use client';

import { useEffect, useRef } from 'react';
import type { LogLine } from '@/lib/copy';
import styles from './StoryLog.module.css';

export function StoryLog({ lines }: { lines: LogLine[] }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [lines.length]);

  return (
    <section className={styles.log} aria-label="이야기 기록" aria-live="polite">
      <div className={styles.head}>STORY LOG</div>
      {lines.length === 0 && <p className={styles.empty}>첫 굴림이 여기 기록돼요.</p>}
      <ol className={styles.list}>
        {lines.map((l) => (
          <li key={l.seq} className={styles.line} data-kind={l.kind}>
            {l.text}
          </li>
        ))}
      </ol>
      <div ref={end} />
    </section>
  );
}
