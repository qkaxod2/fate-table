import { term } from '@fate/glossary';
import type { Character, ConsequenceSlot } from '@fate/rules-engine';
import styles from './Nameplate.module.css';

const SLOTS: ReadonlyArray<readonly [ConsequenceSlot, number]> = [
  ['mild', 2],
  ['moderate', 4],
  ['severe', 6],
];

/**
 * 무대 위 인물 발치의 이름표: 이름, 운명점 동전, 스트레스 칸, 후유증 칸.
 * 운명점은 플레이어만 (NPC는 GM 풀을 쓴다).
 */
export function Nameplate({
  character: c,
  sub,
  me,
  dataTour,
}: {
  character: Character;
  sub?: string | undefined;
  me?: boolean;
  dataTour?: string;
}) {
  return (
    <section
      className={styles.plate}
      aria-label={`${c.name} 상태`}
      data-me={me || undefined}
      data-out={c.takenOut || undefined}
      data-tour={dataTour}
    >
      <b className={styles.name}>{c.name}</b>
      {c.takenOut ? (
        <small className={styles.sub}>{term('takenOut')}</small>
      ) : (
        sub && <small className={styles.sub}>{sub}</small>
      )}
      <div className={styles.row}>
        {!c.isNpc && (
          <span
            className={styles.coins}
            aria-label={`${term('fatePoint')} ${c.fatePoints}`}
            title={`${term('fatePoint')} ${c.fatePoints}`}
          >
            {Array.from({ length: Math.min(c.fatePoints, 6) }, (_, i) => (
              <i key={i} />
            ))}
            {c.fatePoints === 0 && <em>0</em>}
            {c.fatePoints > 6 && <em>+{c.fatePoints - 6}</em>}
          </span>
        )}
        <span className={styles.boxes} aria-label={term('stress')} title={term('stress')}>
          {c.stress.map((used, i) => (
            <span key={i} data-used={used || undefined}>
              {i + 1}
            </span>
          ))}
        </span>
        <span className={styles.cons} aria-label={term('consequence')} title={term('consequence')}>
          {SLOTS.map(([slot, n]) => (
            <span key={slot} data-used={c.consequences[slot] ? true : undefined}>
              {n}
            </span>
          ))}
        </span>
      </div>
    </section>
  );
}
