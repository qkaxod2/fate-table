'use client';

import { useEffect, useRef } from 'react';
import type { LogLine } from '@/lib/copy';
import styles from './StoryLog.module.css';

interface Props {
  lines: LogLine[];
  /** 되돌린 이벤트의 seq: 줄을 그어 보여 준다 */
  undone?: ReadonlySet<number>;
  /** GM 전용: 줄마다 되돌리기 버튼 */
  onUndo?: (seq: number) => void;
}

export function StoryLog({ lines, undone, onUndo }: Props) {
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
          <li
            key={l.seq}
            className={styles.line}
            data-kind={l.kind}
            data-undone={undone?.has(l.seq) || undefined}
          >
            <span>{l.text}</span>
            {onUndo && !undone?.has(l.seq) && l.undoable !== false && (
              <button
                type="button"
                className={styles.undo}
                title="이 일을 되돌려요"
                aria-label="되돌리기"
                onClick={() => onUndo(l.seq)}
              >
                ↶
              </button>
            )}
          </li>
        ))}
      </ol>
      <div ref={end} />
    </section>
  );
}
