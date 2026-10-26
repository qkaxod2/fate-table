import { term } from '@fate/glossary';
import { chanceAtLeast, formatRating, type Action, type Approach } from '@fate/rules-engine';
import styles from './RollPreview.module.css';

interface Props {
  name: string;
  action: Action;
  approach: Approach;
  /** 접근법 수치 + 맞는 특기 */
  rating: number;
  stunt?: number;
  /** 넘어야 할 수치. 상대가 방어로 맞서면 null */
  difficulty: number | null;
  opponent?: string;
  /** 굴린 뒤 특성을 발동해 뒤집을 수 있는지 */
  canInvoke?: boolean;
  disabled?: boolean;
  focus?: boolean;
  onRoll: () => void;
}

/** 굴리기 전 판정 예고: 내 수치 vs 넘을 수치, 이길 가능성, 밀랍 봉인(굴린다) */
export function RollPreview({
  name,
  action,
  approach,
  rating,
  stunt = 0,
  difficulty,
  opponent,
  canInvoke = false,
  disabled,
  focus,
  onRoll,
}: Props) {
  const mine = rating + stunt;
  // 성공 = 상대보다 높음. 주사위 합이 (상대 − 내 수치 + 1) 이상이어야 한다
  const win = difficulty === null ? null : chanceAtLeast(difficulty - mine + 1);
  return (
    <div className={styles.card} data-tour="roll" data-focus={focus || undefined}>
      <p className={styles.kind}>{term(action)} 판정</p>
      <div className={styles.vs}>
        <div>
          <b>
            {mine >= 0 ? '+' : ''}
            {mine}
          </b>
          <span>
            {name} · {term(approach)}
            {stunt > 0 && ` · ${term('stunt')} +${stunt}`}
          </span>
        </div>
        <i>vs</i>
        <div>
          {difficulty === null ? (
            <>
              <b>?</b>
              <span>
                {opponent ?? '상대'} · {term('defend')}
              </span>
            </>
          ) : (
            <>
              <b>
                {difficulty >= 0 ? '+' : ''}
                {difficulty}
              </b>
              <span>난이도 · {formatRating(difficulty).split(' ')[0]}</span>
            </>
          )}
        </div>
      </div>
      <p className={styles.odds}>
        {win !== null ? (
          <>
            이길 가능성 <b>{Math.round(win * 100)}%</b>
          </>
        ) : (
          '상대도 주사위를 굴려 맞서요'
        )}
        {canInvoke && ' · 굴린 뒤 특성 카드로 뒤집을 수 있어요'}
      </p>
      <button type="button" className={styles.seal} disabled={disabled} onClick={onRoll}>
        굴린다
        <kbd>Space</kbd>
      </button>
    </div>
  );
}
