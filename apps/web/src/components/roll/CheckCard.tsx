import { term } from '@fate/glossary';
import { formatRating, sumDice, type RollState } from '@fate/rules-engine';
import { Children, type ReactNode, type Ref } from 'react';
import styles from './CheckCard.module.css';

export interface CheckSide {
  /** 이름 · 접근법 수치 */
  label: ReactNode;
  /** 주사위 (DiceTray · PendingDice) */
  dice: ReactNode;
  /** 합계. 아직 모르면(굴러가는 중·봉인) 비워 둔다 */
  total?: number | null;
  /** 합계 풀이: "주사위 +1 · 완력 +3 · 발동 +2" */
  sum?: string | null;
}

interface Props {
  /** 맨 위 작은 머리말 (예: "극복 판정") */
  kind: string;
  me: CheckSide;
  /** 상대가 굴려 맞서면 그 쪽, 아니면 넘어야 할 난이도 */
  opp: CheckSide | { difficulty: number };
  /** 판정 띠 (OutcomeBanner) */
  verdict?: ReactNode;
  /** 띠 아래 한 줄 (특기 적용 · 기다림 · 확정 버튼 등) */
  children?: ReactNode;
  /** 서버 결과를 기다리며 굴러가는 중 */
  pending?: boolean;
  /** 기다리던 카드를 이어받아서 다시 떠오르지 않는다 */
  continued?: boolean;
  panelRef?: Ref<HTMLDivElement>;
}

const signed = (n: number) => `${n >= 0 ? '+' : ''}${n}`;

/** 합계 풀이 한 줄: "주사위 +1 · 완력 +3 · 발동 +2" */
export function sumLine(side: RollState['active']): string | null {
  if (!side.dice) return null;
  return [
    `주사위 ${signed(sumDice(side.dice))}`,
    `${term(side.approach)} ${signed(side.rating)}`,
    ...side.modifiers.map(
      (m) => `${m.source.startsWith('stunt:') ? term('stunt') : term('invoke')} ${signed(m.value)}`,
    ),
  ].join(' · ');
}

/**
 * 판정 기록 카드 (design-system.md 20절). 굴리기 전 예고 카드와 같은 종이·겹테두리에
 * 내 쪽 | vs | 상대 쪽을 한 축(가운데)으로 놓는다. 주사위 → 합계 → 이름 순으로 위에서 아래로 읽고,
 * 판정 띠가 그 아래 가로로 찍힌다. 판정 4색은 띠 안에서만 쓴다.
 */
export function CheckCard({
  kind,
  me,
  opp,
  verdict,
  children,
  pending,
  continued,
  panelRef,
}: Props) {
  const versus = 'dice' in opp;
  return (
    <div
      ref={panelRef}
      className={styles.card}
      data-roll-panel={pending ? undefined : ''}
      data-pending={pending || undefined}
      data-continued={continued || undefined}
    >
      <p className={styles.kind}>{kind}</p>
      <div className={styles.face}>
        <div className={styles.dice} data-side="me" data-fx={pending ? undefined : 'roll-dice'}>
          {me.dice}
        </div>
        <div className={styles.total} data-side="me">
          {me.total == null ? (
            <b className={styles.unknown} aria-label="합계를 기다리는 중">
              ?
            </b>
          ) : (
            <b key={me.total} className={styles.stamp} data-fx={pending ? undefined : 'roll-total'}>
              {signed(me.total)}
              <small>{formatRating(me.total).split(' ')[0]}</small>
            </b>
          )}
        </div>
        <div className={styles.label} data-side="me">
          {me.label}
          {me.sum && <small>{me.sum}</small>}
        </div>

        <i className={styles.vs} aria-hidden>
          vs
        </i>

        {versus ? (
          <>
            <div className={styles.dice} data-side="op">
              {opp.dice}
            </div>
            <div className={styles.total} data-side="op">
              {opp.total == null ? (
                <b className={styles.unknown} aria-label="상대 합계를 기다리는 중">
                  ?
                </b>
              ) : (
                <b key={opp.total} className={styles.stamp}>
                  {signed(opp.total)}
                  <small>{formatRating(opp.total).split(' ')[0]}</small>
                </b>
              )}
            </div>
            <div className={styles.label} data-side="op">
              {opp.label}
              {opp.sum && <small>{opp.sum}</small>}
            </div>
          </>
        ) : (
          <>
            <div className={styles.dice} data-side="op">
              <span className={styles.bar}>넘어야 할 수치</span>
            </div>
            <div className={styles.total} data-side="op">
              <b>
                {signed(opp.difficulty)}
                <small>{formatRating(opp.difficulty).split(' ')[0]}</small>
              </b>
            </div>
            <div className={styles.label} data-side="op">
              난이도
            </div>
          </>
        )}
      </div>
      {verdict}
      {Children.toArray(children).length > 0 && <div className={styles.foot}>{children}</div>}
    </div>
  );
}
