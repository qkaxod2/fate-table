'use client';

import { useEffect, useRef, useState } from 'react';
import type { LogLine } from '@/lib/copy';
import { reducedMotion } from '@/lib/motion';
import { Typewriter } from '../ui/Typewriter';
import styles from './StoryLog.module.css';

interface Props {
  lines: LogLine[];
  /** 되돌린 이벤트의 seq: 기록에서 뺀다 */
  undone?: ReadonlySet<number>;
  /** GM 전용: 줄마다 되돌리기 버튼 */
  onUndo?: (seq: number) => void;
  /** 보냈지만 서버가 아직 받지 않은 채팅 (흐리게 먼저 보인다) */
  sending?: ReadonlyArray<{ id: number; text: string }>;
  /**
   * book: 책 본문처럼 조판한다. GM 대사는 문단(장면 첫 문단은 머리글자), 말은 여백에 화자,
   * 굴림·운명점 기록은 펜으로 적은 여백 메모. 마지막 GM 대사는 한 자씩 적힌다.
   */
  variant?: 'panel' | 'book';
}

/** "하윤: 대사" → 화자와 대사 */
function splitSpeaker(text: string): [string | null, string] {
  const m = /^([^:：]{1,16})[:：]\s*(.+)$/s.exec(text);
  return m ? [m[1]!, m[2]!] : [null, text];
}

type Tab = 'story' | 'system';

/** 이야기(굴림·대사·채팅)와 시스템(입장·생성·되돌리기 같은 알림)을 탭으로 나눈다 */
export function StoryLog({ lines, undone, onUndo, sending = [], variant = 'panel' }: Props) {
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

  const box = useRef<HTMLElement>(null);
  const lastTab = useRef(tab);
  useEffect(() => {
    // 새 줄이 오면 부드럽게 따라 내려가고, 탭을 바꿨을 땐 바로 맨 아래로 간다
    const jump = lastTab.current !== tab || reducedMotion();
    lastTab.current = tab;
    // 기록을 품은 스크롤 칸(기록 자신이나 방의 오른쪽 열)만 내린다. 페이지 전체가 스크롤되는
    // 좁은 화면에서 scrollIntoView를 쓰면 화면이 통째로 기록까지 끌려 내려갔다
    const el = scrollParent(box.current);
    el?.scrollTo({ top: el.scrollHeight, behavior: jump ? 'auto' : 'smooth' });
  }, [shown.length, tab, sending.length]);

  const open = (t: Tab) => {
    setSeen((x) => ({ ...x, [tab]: lastSeq(tab), [t]: lastSeq(t) }));
    setTab(t);
  };

  return (
    <section
      ref={box}
      className={styles.log}
      data-variant={variant}
      aria-label="이야기 기록"
      aria-live="polite"
    >
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
            {t === 'story' ? '이야기' : '알림'}
            {t === other && unread > 0 && (
              <span key={unread} className={styles.badge}>
                {unread}
              </span>
            )}
          </button>
        ))}
      </div>
      {shown.length === 0 && sending.length === 0 && (
        <p className={styles.empty}>
          {tab === 'story' ? '첫 굴림이 여기 기록돼요.' : '입장·생성 같은 알림이 여기 모여요.'}
        </p>
      )}
      <ol className={styles.list}>
        {shown.map((l, i) => (
          <li
            key={l.seq}
            className={styles.line}
            data-kind={l.kind}
            data-open={
              (variant === 'book' && l.kind === 'gm' && shown[i - 1]?.kind === 'scene') || undefined
            }
          >
            {variant === 'book' ? (
              <BookLine line={l} typing={l.kind === 'gm' && i === shown.length - 1} />
            ) : (
              <span>{l.text}</span>
            )}
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
    </section>
  );
}

function BookLine({ line, typing }: { line: LogLine; typing: boolean }) {
  if (line.kind === 'gm')
    return (
      <span>
        <span className={styles.margin}>GM</span>
        {typing ? <Typewriter text={line.text} /> : line.text}
      </span>
    );
  if (line.kind === 'chat') {
    const [who, said] = splitSpeaker(line.text);
    return (
      <span>
        {who && <span className={styles.margin}>{who}</span>}
        <span className={styles.said}>{said}</span>
      </span>
    );
  }
  return <span>{line.text}</span>;
}

/** 스스로 스크롤되는 가장 가까운 칸. 문서 자체는 고르지 않는다 */
function scrollParent(from: HTMLElement | null): HTMLElement | null {
  for (let el = from; el && el !== document.body; el = el.parentElement) {
    const y = getComputedStyle(el).overflowY;
    if ((y === 'auto' || y === 'scroll') && el.scrollHeight > el.clientHeight) return el;
  }
  return null;
}
