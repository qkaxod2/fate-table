import { term } from '@fate/glossary';
import type { Aspect } from '@fate/rules-engine';
import { useEffect, useRef, useState } from 'react';
import { tap } from '@/fx/sfx';
import { josa } from '@/lib/josa';
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
  /** 플레이어가 스스로 제안한 강요를 GM이 정할 때: 누가 제안했는지 */
  proposedBy?: string;
}

/** GM이 보낸 강요 카드. 수락하면 운명점 +1, 거절하면 −1 */
export function CompelOffer({
  aspect,
  text,
  fatePoints,
  onAccept,
  onRefuse,
  targetId,
  proposedBy,
}: Props) {
  // GM이 제안을 거절하는 데는 운명점이 들지 않는다
  const canRefuse = proposedBy ? true : fatePoints > 0;
  const head = proposedBy ? `${proposedBy}의 ${term('compel')} 제안` : `GM의 ${term('compel')}`;
  const card = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [sending, setSending] = useState(false);
  // 건네받는 순간 키보드 초점이 카드로 온다 (Tab으로 수락·거절)
  useEffect(() => box.current?.focus({ preventScroll: true }), []);

  /**
   * 수락하면 강요 카드에서 운명점이 파티 줄의 내 토큰으로 날아가고,
   * 거절하면 내 토큰에서 하나가 빠져나와 카드로 날아가 사라진다. 다 날아간 뒤 명령을 보낸다.
   */
  const answer = (accept: boolean) => {
    if (sending) return;
    setSending(true);
    const mine = targetId ? document.querySelector(`[data-fx-fp="${CSS.escape(targetId)}"]`) : null;
    const [from, to] = accept ? [card.current, mine] : [mine, card.current];
    void flyBadge(from, to, '◆', { duration: 520, className: 'fx-badge fx-token' }).then(() => {
      tap(10);
      if (accept) onAccept();
      else onRefuse();
    });
  };
  return (
    <div ref={box} className={styles.offer} role="dialog" aria-label={head} tabIndex={-1}>
      <div className={styles.head}>{head}</div>
      <div ref={card} className={styles.card}>
        <AspectCard aspect={aspect} />
      </div>
      <p className={styles.text}>{text}</p>
      {proposedBy ? (
        <p className={styles.explain}>
          받아들이면 그대로 일이 꼬이고 {josa(proposedBy, '이/가')} {term('fatePoint')} +1을 받는다.
          거절해도 잃는 건 없다.
        </p>
      ) : (
        <p className={styles.explain}>
          수락: 일이 꼬이는 대신 {term('fatePoint')} +1. 거절: {term('fatePoint')} −1. 지금{' '}
          {fatePoints}개.
        </p>
      )}
      <div className={styles.buttons}>
        <button
          type="button"
          className={styles.refuse}
          disabled={!canRefuse || sending}
          onClick={() => answer(false)}
        >
          거절하기
          {!proposedBy && <small>{term('fatePoint')} −1</small>}
        </button>
        <button
          type="button"
          className={styles.accept}
          disabled={sending}
          onClick={() => answer(true)}
        >
          받아들이기
          <small>{term('fatePoint')} +1</small>
        </button>
      </div>
      {!canRefuse && !proposedBy && (
        <p className={styles.explain}>{josa(term('fatePoint'), '이/가')} 없어 거절 불가</p>
      )}
    </div>
  );
}
