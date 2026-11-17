'use client';

import { term } from '@fate/glossary';
import { formatRating, type Outcome } from '@fate/rules-engine';
import type { ReactNode } from 'react';
import { JUDGE } from '@/lib/copy';
import styles from './Duel.module.css';

const LADDER: Outcome[] = ['fail', 'tie', 'success', 'style'];

export interface DuelSide {
  name: string;
  /** 접근법 · 수치 같은 한 줄 */
  note: ReactNode;
  dice: ReactNode;
  total: number | null;
}

export interface Played {
  id: string;
  text: string;
  how: string;
  /** 있으면 눌러서 뺄 수 있다 */
  onRevoke?: (() => void) | undefined;
}

interface Props {
  kind: string;
  me: DuelSide;
  /** 상대 굴림, 또는 넘어야 할 난이도 */
  opp: DuelSide | { difficulty: number };
  outcome: Outcome | null;
  /** 확정 전: 카드를 내면 바뀔 수 있다 */
  provisional: boolean;
  /** 낼 수 있는 카드가 남았는지 (다음 칸을 점선으로 보여 준다) */
  canRaise: boolean;
  played: Played[];
  copy?: string | undefined;
  children?: ReactNode;
}

/**
 * 판정판 (design-system.md 32절, 시안 E).
 * 가운데에서 두 쪽 주사위가 맞붙고, 아래 사다리가 지금 결과를 가리킨다.
 * 낸 카드는 판 안에 꽂히고, 다시 누르면 빠진다.
 */
export function Duel({
  kind,
  me,
  opp,
  outcome,
  provisional,
  canRaise,
  played,
  copy,
  children,
}: Props) {
  const at = outcome ? LADDER.indexOf(outcome) : -1;
  return (
    <section
      className={styles.duel}
      data-roll-panel=""
      data-opposed={'difficulty' in opp ? undefined : ''}
      aria-label={kind}
    >
      <p className={styles.kind}>{kind}</p>
      <div className={styles.row}>
        <div className={styles.side}>
          <span className={styles.who}>{me.name}</span>
          <b className={styles.total}>{me.total === null ? '?' : formatRating(me.total)}</b>
          <span className={styles.note}>{me.note}</span>
        </div>
        <div className={styles.dice}>{me.dice}</div>
        <span className={styles.vs}>대</span>
        {'difficulty' in opp ? (
          <div className={styles.side}>
            <span className={styles.who}>난이도</span>
            <b className={styles.total}>{formatRating(opp.difficulty)}</b>
            <span className={styles.note}>넘어야 할 값</span>
          </div>
        ) : (
          <>
            <div className={styles.dice} data-op="">
              {opp.dice}
            </div>
            <div className={styles.side}>
              <span className={styles.who}>{opp.name}</span>
              <b className={styles.total}>{opp.total === null ? '?' : formatRating(opp.total)}</b>
              <span className={styles.note}>{opp.note}</span>
            </div>
          </>
        )}
      </div>

      <ol className={styles.ladder} aria-label="결과 사다리">
        {LADDER.map((o, i) => (
          <li
            key={o}
            data-on={i === at || undefined}
            data-tone={i === at ? JUDGE[o].tone : undefined}
            data-next={(provisional && canRaise && at >= 0 && at < 2 && i === at + 1) || undefined}
          >
            {term(o)}
          </li>
        ))}
      </ol>
      {outcome && (
        <p className={styles.verdict} role="status" key={outcome}>
          <b data-tone={JUDGE[outcome].tone}>{JUDGE[outcome].word}</b>
          {copy && <span>{copy}</span>}
        </p>
      )}

      <div className={styles.played}>
        {played.length === 0 ? (
          provisional && canRaise ? (
            <span className={styles.hint}>특성 카드를 눌러 +2를 더한다</span>
          ) : null
        ) : (
          played.map((p, i) => (
            <button
              key={`${p.id}:${i}`}
              type="button"
              className={styles.chip}
              disabled={!p.onRevoke}
              title={p.onRevoke ? '다시 누르면 뺀다' : undefined}
              onClick={p.onRevoke}
            >
              <span>{p.how}</span>
              <b>{p.text}</b>
              <em>+2</em>
            </button>
          ))
        )}
      </div>
      {children && <div className={styles.buttons}>{children}</div>}
    </section>
  );
}
