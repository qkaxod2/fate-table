import { term } from '@fate/glossary';
import type { Character, ConsequenceSlot } from '@fate/rules-engine';
import styles from './FoePlate.module.css';

const SLOTS: ReadonlyArray<readonly [ConsequenceSlot, number]> = [
  ['mild', 2],
  ['moderate', 4],
  ['severe', 6],
];

/** 무대 위쪽의 상대 이름표. 불투명 종이에 먹 글자, 찬 칸은 주홍 면 + ✕ */
export function FoePlate({
  character: c,
  image,
  note,
  compact,
}: {
  character: Character;
  image?: string;
  /** 이름 아래 한 줄 (예: 핵심 컨셉) */
  note?: string;
  /** 판정 중: 한 줄로 접혀 판정 카드 자리를 비켜 준다 */
  compact?: boolean;
}) {
  return (
    <section
      className={styles.plate}
      aria-label={`${c.name} 상태`}
      data-out={c.takenOut || undefined}
      data-compact={compact || undefined}
    >
      <div className={styles.head}>
        {image && <img src={image} alt="" />}
        <div>
          <b>{c.name}</b>
          {c.takenOut ? <small>{term('takenOut')}</small> : note && <small>{note}</small>}
        </div>
      </div>
      <span className={styles.label}>{term('stress')}</span>
      <div className={styles.row}>
        {c.stress.map((used, i) => (
          <span key={i} className={`${styles.slot} ${styles.sq}`} data-used={used || undefined}>
            {i + 1}
          </span>
        ))}
      </div>
      <span className={styles.label}>{term('consequence')}</span>
      <div className={styles.row}>
        {SLOTS.map(([slot, n]) => (
          <span
            key={slot}
            className={styles.slot}
            data-used={c.consequences[slot] ? true : undefined}
          >
            {term(slot)} {n}
          </span>
        ))}
      </div>
    </section>
  );
}
