'use client';

import { useEffect, useRef, useState } from 'react';
import type { LogLine } from '@/lib/copy';
import { RichText } from '../ui/RichText';
import styles from './VnBox.module.css';

type Tab = 'story' | 'system' | 'chat';

const TABS: Array<[Tab, string]> = [
  ['story', '이야기'],
  ['system', '시스템'],
  ['chat', '잡담'],
];

/** 잡담 · 시스템 탭은 이만큼만 그린다 (전부는 오른쪽 기록에 있다) */
const KEEP = 60;

const isChatter = (l: LogLine) => l.kind === 'chat' && !!l.tag;
const isSystem = (l: LogLine) => l.kind === 'system' || l.kind === 'roll' || l.kind === 'fate';

const pick: Record<Tab, (l: LogLine) => boolean> = {
  // 이야기: 장면 · GM 서술 · 캐릭터 대사에 굴림 · 운명점 같은 시스템 줄도 순서대로 낀다 (입장 같은 알림은 뺀다)
  story: (l) => l.kind !== 'system' && !isChatter(l),
  system: isSystem,
  chat: isChatter,
};

/** "하윤: 대사" → 화자와 대사 */
function splitSpeaker(text: string): [string | null, string] {
  const m = /^([^:：]{1,16})[:：]\s*(.+)$/s.exec(text);
  return m ? [m[1]!, m[2]!] : [null, text];
}

/**
 * 가운데 비주얼 노벨 대사창 (오른쪽 세로 패널이 있는 넓은 화면).
 * - 이야기: 한 줄씩 크게. 캐릭터 대사만 이름표가 붙고, 서술 · 굴림 같은 줄은 이름표 없이.
 *   ◀ ▶로 지난 줄을 넘겨 보고, 맨 끝에 있으면 새 줄을 따라간다.
 * - 시스템 · 잡담: 로그처럼 줄줄이.
 * 펼치지 않고 탭만 눌러 오간다. 새 줄이 쌓이면 탭에 숫자가 뜬다.
 */
export function VnBox({ lines, undone }: { lines: LogLine[]; undone: ReadonlySet<number> }) {
  const [tab, setTab] = useState<Tab>('story');
  // 이야기에서 보고 있는 줄 (null이면 마지막 줄을 따라간다)
  const [at, setAt] = useState<number | null>(null);
  const live = lines.filter((l) => !undone.has(l.seq));
  const by: Record<Tab, LogLine[]> = {
    story: live.filter(pick.story),
    system: live.filter(pick.system),
    chat: live.filter(pick.chat),
  };
  const lastSeq = (t: Tab) => by[t].at(-1)?.seq ?? 0;
  const [seen, setSeen] = useState<Record<Tab, number>>(() => ({
    story: lastSeq('story'),
    system: lastSeq('system'),
    chat: lastSeq('chat'),
  }));
  const unread = (t: Tab) => (t === tab ? 0 : by[t].filter((l) => l.seq > seen[t]).length);

  const open = (t: Tab) => {
    setSeen((s) => ({ ...s, [tab]: lastSeq(tab), [t]: lastSeq(t) }));
    setTab(t);
  };

  const story = by.story;
  const idx = at === null ? story.length - 1 : Math.min(at, story.length - 1);
  const go = (d: -1 | 1) => {
    const next = Math.max(0, Math.min(story.length - 1, idx + d));
    setAt(next >= story.length - 1 ? null : next);
  };

  const list = useRef<HTMLOListElement>(null);
  const listLen = tab === 'story' ? 0 : by[tab].length;
  useEffect(() => {
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [tab, listLen]);

  const cur = story[idx];
  const [who, said] = cur?.kind === 'chat' ? splitSpeaker(cur.text) : [null, cur?.text ?? ''];

  return (
    <div className={styles.box} data-tab={tab}>
      <div className={styles.bar} role="tablist" aria-label="대사창">
        {TABS.map(([t, label]) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            className={styles.tab}
            onClick={() => open(t)}
          >
            {label}
            {unread(t) > 0 && <span className={styles.badge}>{unread(t)}</span>}
          </button>
        ))}
        {tab === 'story' && story.length > 0 && (
          <span className={styles.nav}>
            <button
              type="button"
              onClick={() => go(-1)}
              disabled={idx <= 0}
              aria-label="앞 줄"
              title="앞 줄"
            >
              ◀
            </button>
            <span className={styles.count}>
              {idx + 1} / {story.length}
            </span>
            <button
              type="button"
              onClick={() => go(1)}
              disabled={at === null}
              aria-label="다음 줄"
              title="다음 줄"
            >
              ▶
            </button>
          </span>
        )}
      </div>
      {tab === 'story' ? (
        <div className={styles.stage} aria-live="polite">
          {!cur ? (
            <p className={styles.empty}>이야기가 여기 한 줄씩 나옵니다</p>
          ) : (
            <div
              key={cur.seq}
              className={styles.line}
              data-kind={cur.kind}
              data-said={!!who || undefined}
            >
              {who && <span className={styles.who}>{who}</span>}
              <p>
                <RichText text={said} fx={cur.fx} />
              </p>
            </div>
          )}
        </div>
      ) : (
        <ol ref={list} className={styles.log}>
          {by[tab].length === 0 && (
            <li className={styles.empty}>
              {tab === 'chat'
                ? '잡담 · 귓속말이 여기 모입니다'
                : '굴림 · 운명점 · 알림이 여기 모입니다'}
            </li>
          )}
          {by[tab].slice(-KEEP).map((l) => {
            const [w, t] = l.kind === 'chat' ? splitSpeaker(l.text) : [null, l.text];
            return (
              <li key={l.seq} data-kind={l.kind} data-tag={l.tag}>
                {l.tag === 'whisper' && <em>귓속말</em>}
                {w && <b>{w}</b>}
                <RichText text={t} fx={l.fx} />
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
