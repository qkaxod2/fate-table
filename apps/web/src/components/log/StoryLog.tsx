'use client';

import { memo, useEffect, useRef, useState } from 'react';
import type { LogLine } from '@/lib/copy';
import { reducedMotion } from '@/lib/motion';
import { RichText } from '../ui/RichText';
import { Typewriter } from '../ui/Typewriter';
import styles from './StoryLog.module.css';

interface Props {
  lines: LogLine[];
  /** 되돌린 이벤트의 seq: 기록에서 뺀다 */
  undone?: ReadonlySet<number>;
  /** GM 전용: 줄마다 되돌리기 버튼 */
  onUndo?: (seq: number) => void;
  /** 보냈지만 서버가 아직 받지 않은 채팅 (흐리게 먼저 보인다) */
  sending?: ReadonlyArray<{ id: number; text: string; fx?: boolean }>;
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
/** 맨 아래에서 이만큼은 늘 실제로 배치한다 (그 위는 화면 밖이면 배치를 건너뛴다) */
const NEAR_LINES = 40;

const NO_SENDING: NonNullable<Props['sending']> = [];

/**
 * 기록이 수백 줄로 길어져도 입력할 때마다 다시 그리지 않게 memo로 감싼다.
 * 부모는 lines·sending·onUndo를 바뀔 때만 새로 넘긴다
 */
export const StoryLog = memo(function StoryLog({
  lines,
  undone,
  onUndo,
  sending = NO_SENDING,
  variant = 'panel',
}: Props) {
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
    // 책 본문은 감싼 글 칸이 스크롤 칸이다. 아직 넘치지 않았다고 그 바깥(휴대폰 대사창)을 내리면
    // 화자 이름표가 위로 밀려 가려지므로, 넘치든 아니든 가장 가까운 스크롤 칸에서 멈춘다
    const el = scrollParent(box.current, variant === 'book');
    el?.scrollTo({ top: el.scrollHeight, behavior: jump ? 'auto' : 'smooth' });
  }, [shown.length, tab, sending.length, variant]);

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
          {tab === 'story' ? '첫 굴림부터 여기 기록' : '입장, 생성 같은 알림이 여기 모임'}
        </p>
      )}
      <ol className={styles.list}>
        {shown.map((l, i) => (
          <Line
            key={l.seq}
            seq={l.seq}
            kind={l.kind}
            text={l.text}
            fx={l.fx}
            book={variant === 'book'}
            open={variant === 'book' && l.kind === 'gm' && shown[i - 1]?.kind === 'scene'}
            typing={variant === 'book' && l.kind === 'gm' && i === shown.length - 1}
            far={i < shown.length - NEAR_LINES}
            onUndo={l.undoable !== false ? onUndo : undefined}
          />
        ))}
        {tab === 'story' &&
          sending.map((m) => (
            <li key={`s${m.id}`} className={styles.line} data-kind="chat" data-sending>
              <span>
                <RichText text={m.text} fx={m.fx} />
              </span>
            </li>
          ))}
      </ol>
    </section>
  );
});

/**
 * 기록 한 줄. 새 줄이 붙어도 앞선 줄들은 내용이 같으면 다시 그리지 않는다
 * (describe가 매번 새 객체를 만들므로 값으로 비교한다)
 */
const Line = memo(function Line({
  seq,
  kind,
  text,
  fx,
  book,
  open,
  typing,
  far,
  onUndo,
}: {
  seq: number;
  kind: LogLine['kind'];
  text: string;
  fx: LogLine['fx'];
  book: boolean;
  open: boolean;
  typing: boolean;
  /** 맨 아래에서 멀리 떨어진 줄: 화면 밖이면 배치를 건너뛴다 */
  far: boolean;
  onUndo: ((seq: number) => void) | undefined;
}) {
  const line: LogLine = fx ? { seq, kind, text, fx } : { seq, kind, text };
  return (
    <li
      className={styles.line}
      data-kind={kind}
      data-open={open || undefined}
      data-far={far || undefined}
    >
      {book ? (
        <BookLine line={line} typing={typing} />
      ) : (
        <span>{kind === 'chat' || kind === 'gm' ? <RichText text={text} fx={fx} /> : text}</span>
      )}
      {onUndo && (
        <button
          type="button"
          className={styles.undo}
          title="이 일 되돌리기"
          aria-label="되돌리기"
          onClick={() => onUndo(seq)}
        >
          ↶
        </button>
      )}
    </li>
  );
});

function BookLine({ line, typing }: { line: LogLine; typing: boolean }) {
  if (line.kind === 'gm')
    return (
      <span>
        <span className={styles.margin}>GM</span>
        {typing ? (
          <Typewriter text={line.text} fx={line.fx} />
        ) : (
          <RichText text={line.text} fx={line.fx} />
        )}
      </span>
    );
  if (line.kind === 'chat') {
    const [who, said] = splitSpeaker(line.text);
    return (
      <span>
        {who && <span className={styles.margin}>{who}</span>}
        <span className={styles.said}>
          <RichText text={said} fx={line.fx} />
        </span>
      </span>
    );
  }
  return <span>{line.text}</span>;
}

/** 스스로 스크롤되는 가장 가까운 칸. 문서 자체는 고르지 않는다 */
function scrollParent(from: HTMLElement | null, nearest = false): HTMLElement | null {
  for (let el = from; el && el !== document.body; el = el.parentElement) {
    const y = getComputedStyle(el).overflowY;
    if ((y === 'auto' || y === 'scroll') && (nearest || el.scrollHeight > el.clientHeight))
      return el;
  }
  return null;
}
