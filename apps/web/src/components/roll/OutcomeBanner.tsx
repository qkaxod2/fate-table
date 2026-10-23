import { term } from '@fate/glossary';
import { formatRating, type Action, type Outcome } from '@fate/rules-engine';
import { JUDGE, OUTCOME_COPY } from '@/lib/copy';
import styles from './OutcomeBanner.module.css';

interface Props {
  action: Action;
  outcome: Outcome;
  total: number;
  /** 결과가 아직 확정 전이면 발동으로 바꿀 수 있다는 안내를 붙인다 */
  provisional?: boolean;
}

export function OutcomeBanner({ action, outcome, total, provisional }: Props) {
  const judge = JUDGE[outcome];
  return (
    <div className={styles.banner} data-tone={judge.tone} role="status">
      <div className={styles.latin} aria-hidden>
        {judge.latin}
      </div>
      <div className={styles.kr}>
        <span className={styles.rule} />
        {term(outcome)} · {formatRating(total)}
        <span className={styles.rule} />
      </div>
      <p className={styles.copy}>
        {provisional && (outcome === 'fail' || outcome === 'tie')
          ? '아직 확정 전이에요. 특성을 발동하면 결과를 바꿀 수 있어요'
          : OUTCOME_COPY[action][outcome]}
      </p>
    </div>
  );
}
