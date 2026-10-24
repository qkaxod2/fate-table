import { term } from '@fate/glossary';
import type { Aspect } from '@fate/rules-engine';
import { useRef, useState } from 'react';
import { flyBadge } from '@/lib/motion';
import { AspectCard } from '../aspect/AspectCard';
import styles from './CompelOffer.module.css';

interface Props {
  aspect: Aspect;
  text: string;
  fatePoints: number;
  onAccept: () => void;
  onRefuse: () => void;
  /** 운명점이 날아갈 캐릭터 (파티 줄의 토큰). 없으면 날리지 않는다 */
  targetId?: string;
}

/** GM이 보낸 강요 카드. 수락하면 운명점 +1, 거절하면 −1 */
export function CompelOffer({ aspect, text, fatePoints, onAccept, onRefuse, targetId }: Props) {
  const canRefuse = fatePoints > 0;
  const card = useRef<HTMLDivElement>(null);
  const [sending, setSending] = useState(false);

  /**
   * 수락하면 강요 카드에서 운명점이 파티 줄의 내 토큰으로 날아가고,
   * 거절하면 내 토큰에서 하나가 빠져나와 카드로 날아가 사라진다. 다 날아간 뒤 명령을 보낸다.
   */
  const answer = (accept: boolean) => {
    if (sending) return;
    setSending(true);
    const mine = targetId ? document.querySelector(`[data-fx-fp="${CSS.escape(targetId)}"]`) : null;
    const [from, to] = accept ? [card.current, mine] : [mine, card.current];
    void flyBadge(from, to, '◆', { duration: 520, className: 'fx-badge fx-token' }).then(() =>
      accept ? onAccept() : onRefuse(),
    );
  };
  return (
    <div className={styles.offer} role="dialog" aria-label={term('compel')}>
      <div className={styles.head}>COMPEL · GM의 {term('compel')}</div>
      <div ref={card}>
        <AspectCard aspect={aspect} />
      </div>
      <p className={styles.text}>{text}</p>
      <p className={styles.explain}>
        받아들이면 일이 꼬이는 대신 {term('fatePoint')} 1을 받아요. 거절하려면 {term('fatePoint')}{' '}
        1을 내야 해요.
      </p>
      <div className={styles.buttons}>
        <button
          type="button"
          className={styles.refuse}
          disabled={!canRefuse || sending}
          onClick={() => answer(false)}
        >
          거절 · −1
        </button>
        <button
          type="button"
          className={styles.accept}
          disabled={sending}
          onClick={() => answer(true)}
        >
          수락 · +1
        </button>
      </div>
      {!canRefuse && (
        <p className={styles.explain}>{term('fatePoint')}이 없어서 거절할 수 없어요.</p>
      )}
    </div>
  );
}
