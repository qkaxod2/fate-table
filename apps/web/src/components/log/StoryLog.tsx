'use client';

import { useEffect, useRef, useState } from 'react';
import type { LogLine } from '@/lib/copy';
import styles from './StoryLog.module.css';

interface Props {
  lines: LogLine[];
  /** 되돌린 이벤트의 seq: 기록에서 뺀다 */
  undone?: ReadonlySet<number>;
  /** GM 전용: 줄마다 되돌리기 버튼 */
  onUndo?: (seq: number) => void;
  /** 보냈지만 서버가 아직 받지 않은 채팅 (흐리게 먼저 보인다) */
  sending?: ReadonlyArray<{ id: number; text: string }>;
}

type Tab = 'story' | 'system';

/** 이야기(굴림·대사·채팅)와 시스템(입장·생성·되돌리기 같은 알림)을 탭으로 나눈다 */
export function StoryLog({ lines, undone, onUndo, sending = [] }: Props) {
  const [tab, setTab] = useState<Tab>('story');
  const [seen, setSeen] = useState<Record<Tab, number>>({ story: 0, system: 0 });
  const live = lines.filter((l) => !undone?.has(l.seq));
  const byTab: Record<Tab, LogLine[]> = {
    story: live.filter((l) => l.kind !== 'system'),
    system: live.filter((l) => l.kind === 'system'),
  };
  const shown = byTab[tab];
  const lastSeq = (t: Tab) => byTab[t].at(-1)?.seq ?? 0;
  const other: Tab = tab === 'story' ? 'system' : 'story';
  const unread = byTab[other].filter((l) => l.seq > seen[other]).length;

  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [shown.length, tab, sending.length]);

  const open = (t: Tab) => {
    setSeen((x) => ({ ...x, [tab]: lastSeq(tab), [t]: lastSeq(t) }));
    setTab(t);
  };

  return (
    <section className={styles.log} aria-label="이야기 기록" aria-live="polite">
      <div className={styles.tabs} role="tablist">
        {(['story', 'system'] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            className={styles.tab}
            onClick={() => open(t)}
          >
            {t === 'story' ? 'STORY' : 'SYSTEM'}
            {t === other && unread > 0 && <span className={styles.badge}>{unread}</span>}
          </button>
        ))}
      </div>
      {shown.length === 0 && sending.length === 0 && (
        <p className={styles.empty}>
          {tab === 'story' ? '첫 굴림이 여기 기록돼요.' : '입장·생성 같은 알림이 여기 모여요.'}
        </p>
      )}
      <ol className={styles.list}>
        {shown.map((l) => (
          <li key={l.seq} className={styles.line} data-kind={l.kind}>
            <span>{l.text}</span>
            {onUndo && l.undoable !== false && (
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
        {tab === 'story' &&
          sending.map((m) => (
            <li key={`s${m.id}`} className={styles.line} data-kind="chat" data-sending>
              <span>{m.text}</span>
            </li>
          ))}
      </ol>
      <div ref={end} />
    </section>
  );
}
