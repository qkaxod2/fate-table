import { term } from '@fate/glossary';
import type { Aspect, Character, ConsequenceSlot } from '@fate/rules-engine';
import { FatePointToken } from '../fate/FatePointToken';
import styles from './MySheet.module.css';

const SLOTS: ReadonlyArray<readonly [ConsequenceSlot, number]> = [
  ['mild', 2],
  ['moderate', 4],
  ['severe', 6],
];

export interface Companion {
  character: Character;
  image?: string;
}

/** 책 첫머리: 내 캐릭터 기록지(초상·운명점·스트레스·후유증)와 동료 한 줄 */
export function MySheet({
  character: c,
  aspects,
  image,
  companions = [],
}: {
  character: Character;
  /** 방의 특성 전체 (state.aspects): 핵심 컨셉·약점·후유증 문구를 찾는다 */
  aspects: Readonly<Record<string, Aspect>>;
  image?: string;
  companions?: Companion[];
}) {
  const mine = Object.values(aspects).filter(
    (a) => a.ownerType === 'character' && a.ownerId === c.id,
  );
  const high = mine.find((a) => a.kind === 'high')?.text;
  const trouble = mine.find((a) => a.kind === 'trouble')?.text;
  return (
    <section
      className={styles.sheet}
      aria-label={`${c.name} 기록지`}
      data-out={c.takenOut || undefined}
    >
      <div className={styles.me}>
        {image && <img className={styles.portrait} src={image} alt="" />}
        <div className={styles.body}>
          <h2 className={styles.name}>{c.name}</h2>
          {(high || trouble) && (
            <p className={styles.concept}>
              {high}
              {trouble && (
                <>
                  {high && ' · '}
                  {term('trouble')}: {trouble}
                </>
              )}
            </p>
          )}
          <div className={styles.stats}>
            <div className={styles.stat}>
              <span className={styles.label}>{term('fatePoint')}</span>
              <span data-fx-fp={c.id} className={styles.coins}>
                <FatePointToken count={c.fatePoints} />
              </span>
            </div>
            <div className={styles.stat}>
              <span className={styles.label}>{term('stress')}</span>
              <span className={styles.boxes}>
                {c.stress.map((used, i) => (
                  <span key={i} className={styles.box} data-used={used || undefined}>
                    {i + 1}
                  </span>
                ))}
              </span>
            </div>
            <div className={styles.stat}>
              <span className={styles.label}>{term('consequence')}</span>
              <span className={styles.cons}>
                {SLOTS.map(([slot, n]) => {
                  const taken = c.consequences[slot];
                  return (
                    <span
                      key={slot}
                      className={styles.slot}
                      data-used={taken ? true : undefined}
                      title={taken ? aspects[taken.aspectId]?.text : undefined}
                    >
                      {term(slot)} {n}
                    </span>
                  );
                })}
              </span>
            </div>
          </div>
        </div>
      </div>
      {companions.length > 0 && (
        <ul className={styles.companions}>
          {companions.map(({ character: o, image: img }) => (
            <li key={o.id} data-out={o.takenOut || undefined}>
              {img && <img src={img} alt="" />}
              <span>{o.name}</span>
              <span data-fx-fp={o.id} className={styles.smallCoins}>
                <FatePointToken count={o.fatePoints} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
