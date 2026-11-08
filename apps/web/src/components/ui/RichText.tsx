'use client';

import { Fragment, type ReactNode } from 'react';
import { parseRich, type RichSegment } from '@fate/rules-engine';
import styles from './RichText.module.css';

/**
 * 꾸민 글(**굵게**, *기울임*, GM의 [글리치]·[뒤집기])을 그린다. 조각을 글자로만 넣으므로
 * 적은 내용이 HTML로 해석되는 일은 없다.
 */
export function RichText({ text, fx }: { text: string; fx?: boolean | undefined }) {
  return <RichSegments segs={parseRich(text, { gm: !!fx })} />;
}

export function RichSegments({ segs }: { segs: readonly RichSegment[] }) {
  // 이어진 뒤집기 조각은 한 덩어리로 돌린다 (조각마다 돌면 글 순서가 뒤섞인다)
  const runs: Array<{ flip: boolean; segs: RichSegment[] }> = [];
  for (const s of segs) {
    const last = runs.at(-1);
    if (last && last.flip === !!s.flip) last.segs.push(s);
    else runs.push({ flip: !!s.flip, segs: [s] });
  }
  return (
    <>
      {runs.map((r, i) =>
        r.flip ? (
          <span key={i} className={styles.flip}>
            {r.segs.map(piece)}
          </span>
        ) : (
          <Fragment key={i}>{r.segs.map(piece)}</Fragment>
        ),
      )}
    </>
  );
}

function piece(s: RichSegment, i: number) {
  // 글리치가 가장 안쪽: 잔상(::before/::after)이 굵기·기울기를 함께 물려받는다
  let node: ReactNode = s.glitch ? (
    <span className={styles.glitch} data-text={s.text}>
      {s.text}
    </span>
  ) : (
    s.text
  );
  if (s.bold) node = <strong className={styles.bold}>{node}</strong>;
  if (s.italic) node = <em className={styles.italic}>{node}</em>;
  return <Fragment key={i}>{node}</Fragment>;
}

/** 앞에서 n글자까지만 (타자기처럼 한 글자씩 보일 때) */
export function sliceSegments(segs: readonly RichSegment[], from: number, to = Infinity) {
  const out: RichSegment[] = [];
  let at = 0;
  for (const s of segs) {
    const chars = Array.from(s.text);
    const a = Math.max(from - at, 0);
    const b = Math.min(to - at, chars.length);
    if (b > a) out.push({ ...s, text: chars.slice(a, b).join('') });
    at += chars.length;
  }
  return out;
}
