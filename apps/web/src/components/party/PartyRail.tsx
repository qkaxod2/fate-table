import { term } from '@fate/glossary';
import type { Character } from '@fate/rules-engine';
import { FatePointToken } from '../fate/FatePointToken';
import styles from './PartyRail.module.css';

export interface PartyMember {
  character: Character;
  image?: string;
  status?: string;
  active?: boolean;
}

export function PartyRail({ members }: { members: PartyMember[] }) {
  return (
    <aside className={styles.rail} aria-label="파티">
      <div className={styles.head}>PARTY · FATE</div>
      {members.map(({ character: c, image, status, active }) => (
        <div
          key={c.id}
          className={styles.member}
          data-active={active || undefined}
          data-out={c.takenOut || undefined}
        >
          {image && <img className={styles.avatar} src={image} alt="" />}
          <div className={styles.info}>
            <div className={styles.name}>
              {c.name}
              {status && <span className={styles.status}>{status}</span>}
            </div>
            <div className={styles.meters}>
              {!c.isNpc && <FatePointToken count={c.fatePoints} />}
              <span className={styles.stress} aria-label={term('stress')}>
                {c.stress.map((used, i) => (
                  <span key={i} className={styles.box} data-used={used || undefined}>
                    {i + 1}
                  </span>
                ))}
              </span>
            </div>
            {Object.keys(c.consequences).length > 0 && (
              <div className={styles.cons}>
                {term('consequence')}{' '}
                {Object.keys(c.consequences)
                  .map((k) => term(k as 'mild'))
                  .join(' · ')}
              </div>
            )}
          </div>
        </div>
      ))}
    </aside>
  );
}
