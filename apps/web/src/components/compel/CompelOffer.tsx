import { term } from '@fate/glossary';
import type { Aspect } from '@fate/rules-engine';
import { AspectCard } from '../aspect/AspectCard';
import styles from './CompelOffer.module.css';

interface Props {
  aspect: Aspect;
  text: string;
  fatePoints: number;
  onAccept: () => void;
  onRefuse: () => void;
}

/** GM이 보낸 강요 카드. 수락하면 운명점 +1, 거절하면 −1 */
export function CompelOffer({ aspect, text, fatePoints, onAccept, onRefuse }: Props) {
  const canRefuse = fatePoints > 0;
  return (
    <div className={styles.offer} role="dialog" aria-label={term('compel')}>
      <div className={styles.head}>COMPEL · GM의 {term('compel')}</div>
      <AspectCard aspect={aspect} />
      <p className={styles.text}>{text}</p>
      <p className={styles.explain}>
        받아들이면 일이 꼬이는 대신 {term('fatePoint')} 1을 받아요. 거절하려면 {term('fatePoint')}{' '}
        1을 내야 해요.
      </p>
      <div className={styles.buttons}>
        <button type="button" className={styles.refuse} disabled={!canRefuse} onClick={onRefuse}>
          거절 · −1
        </button>
        <button type="button" className={styles.accept} onClick={onAccept}>
          수락 · +1
        </button>
      </div>
      {!canRefuse && (
        <p className={styles.explain}>{term('fatePoint')}이 없어서 거절할 수 없어요.</p>
      )}
    </div>
  );
}
