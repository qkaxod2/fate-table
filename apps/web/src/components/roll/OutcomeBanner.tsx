import type { CSSProperties } from 'react';
import { formatRating, type Action, type Outcome } from '@fate/rules-engine';
import { JUDGE, OUTCOME_COPY } from '@/lib/copy';
import styles from './OutcomeBanner.module.css';

/** 대성공 때 판정 글자에서 터져 나가는 금빛 불티 (자리는 고정이라 매번 같은 모양) */
const SPARKS = Array.from({ length: 26 }, (_, i) => ({
  a: Math.round((i * 360) / 26 + ((i * 47) % 13) - 6),
  d: 110 + ((i * 37) % 110),
  s: 4 + (i % 4),
  t: (i % 5) * 30,
}));

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
      {judge.tone === 'perfect' && (
        <div className={styles.sparks} key={`sparks:${outcome}`} aria-hidden>
          {SPARKS.map((p, i) => (
            <span
              key={i}
              style={
                {
                  '--a': `${p.a}deg`,
                  '--d': `${p.d}px`,
                  '--s': `${p.s}px`,
                  animationDelay: `${420 + p.t}ms`,
                } as CSSProperties
              }
            />
          ))}
        </div>
      )}
      {/* 판정 글자는 한국어로 크게 찍는다. 발동으로 판정이 뒤집히면 글자를 새로 찍는다 */}
      <div className={styles.word} key={outcome}>
        {judge.word}
      </div>
      <div className={styles.kr}>
        <span className={styles.rule} />
        합계 {formatRating(total)}
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
