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

/** 알림 탭은 이만큼만 그리고 그 앞은 "이전 알림"으로 접는다 */
const SYSTEM_KEEP = 150;

export type LogItem = { line: LogLine } | { fold: { id: number; title: string; count: number } };

/**
 * 지난 장면은 한 줄로 접는다. 기록이 수천 줄로 길어져도 지금 장면만 실제로 그린다.
 * 장면은 '장면 시작' 줄에서 나뉜다. 펼친 장면(open)과 마지막 장면은 그대로 둔다.
 */
export function foldScenes(lines: readonly LogLine[], open: ReadonlySet<number>): LogItem[] {
  const starts: number[] = [];
  lines.forEach((l, i) => {
    if (l.kind === 'scene' && l.text.startsWith('장면 시작')) starts.push(i);
  });
  if (starts.length < 2) return lines.map((line) => ({ line }));
  const out: LogItem[] = [];
  // 첫 장면 앞(세션 시작 등)은 첫 장면과 함께 접는다
  const bounds = [0, ...starts.slice(1), lines.length];
  for (let b = 0; b < bounds.length - 1; b++) {
    const part = lines.slice(bounds[b], bounds[b + 1]);
    const head = part.find((l) => l.kind === 'scene' && l.text.startsWith('장면 시작'));
    const id = (head ?? part[0])!.seq;
    const last = b === bounds.length - 2;
    if (last || open.has(id)) {
      for (const line of part) out.push({ line });
      continue;
    }
    const title = head ? head.text.replace(/^장면 시작:\s*/, '') : '장면 전';
    out.push({ fold: { id, title, count: part.length } });
  }
  return out;
}

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
  // 펼쳐 본 지난 장면 (장면 첫 줄의 seq)
  const [openScenes, setOpenScenes] = useState<ReadonlySet<number>>(() => new Set());
  const [allSystem, setAllSystem] = useState(false);
  const [seen, setSeen] = useState<Record<Tab, number>>({ story: 0, system: 0 });
  const live = lines.filter((l) => !undone?.has(l.seq));
  const byTab: Record<Tab, LogLine[]> = {
    story: live.filter((l) => l.kind !== 'system'),
    system: live.filter((l) => l.kind === 'system'),
  };
  const shown = byTab[tab];
  const items: LogItem[] =
    tab === 'story'
      ? foldScenes(shown, openScenes)
      : [
          ...(!allSystem && shown.length > SYSTEM_KEEP
            ? [{ fold: { id: -1, title: '이전 알림', count: shown.length - SYSTEM_KEEP } }]
            : []),
          ...(allSystem ? shown : shown.slice(-SYSTEM_KEEP)).map((line) => ({ line })),
        ];
  const unfold = (id: number) => {
    if (id === -1) setAllSystem(true);
    else setOpenScenes((cur) => new Set(cur).add(id));
  };
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
        {items.map((it, i) => {
          if ('fold' in it)
            return (
              <li key={`f${it.fold.id}`} className={styles.fold}>
                <button
                  type="button"
                  onClick={() => unfold(it.fold.id)}
                  title="눌러서 펼치기"
                  aria-label={`${it.fold.title} 펼치기, ${it.fold.count}줄`}
                >
                  <span aria-hidden>▸</span> {it.fold.title}
                  <small>{it.fold.count}줄</small>
                </button>
              </li>
            );
          const l = it.line;
          const prev = items[i - 1];
          return (
            <Line
              key={l.seq}
              seq={l.seq}
              kind={l.kind}
              text={l.text}
              fx={l.fx}
              tag={l.tag}
              book={variant === 'book'}
              open={
                variant === 'book' &&
                l.kind === 'gm' &&
                !!prev &&
                'line' in prev &&
                prev.line.kind === 'scene'
              }
              typing={variant === 'book' && l.kind === 'gm' && i === items.length - 1}
              far={i < items.length - NEAR_LINES}
              onUndo={l.undoable !== false ? onUndo : undefined}
            />
          );
        })}
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
  tag,
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
  tag?: LogLine['tag'];
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
      data-tag={tag}
      title={
        tag === 'whisper' ? '귓속말: 나와 GM만 봄' : tag === 'ooc' ? '잡담 (캐릭터 밖)' : undefined
      }
    >
      {tag && (
        <span className={styles.tag} aria-hidden>
          {tag === 'whisper' ? '귓속말' : '잡담'}
        </span>
      )}
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
