'use client';

// 자료(핸드아웃): GM이 띄워 준 단서 · 편지 · 지도. 받으면 한 장이 펼쳐지고, 자료함에서 다시 본다.
import type { Handout, RoomState } from '@fate/rules-engine';
import { useState } from 'react';
import { Leaf } from '@/components/book/Leaf';
import { RichText } from '@/components/ui/RichText';
import styles from './Handout.module.css';

/** 목록 미리보기: 꾸밈 기호와 줄바꿈을 걷어낸 한 줄 */
const plain = (t: string) =>
  t
    .replace(/\*\*|\*|\[(?:글리치|뒤집기)\]|\[\/(?:글리치|뒤집기)\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** 받은 사람 줄: 모두 / 이름들 (GM 화면에서만 의미가 있다) */
export function audienceOf(h: Handout, state: RoomState): string {
  if (h.shownTo === 'all') return '모두';
  return h.shownTo.map((u) => state.members[u]?.nickname ?? '누군가').join(', ');
}

function Paper({ h }: { h: Handout }) {
  return (
    <article className={styles.paper}>
      {h.imageUrl && (
        <a href={h.imageUrl} target="_blank" rel="noreferrer" className={styles.figure}>
          {}
          <img src={h.imageUrl} alt={h.title} />
        </a>
      )}
      {h.body && (
        <p className={styles.body}>
          <RichText text={h.body} />
        </p>
      )}
      {!h.imageUrl && !h.body && <p className={styles.empty}>제목만 있는 자료</p>}
    </article>
  );
}

/** 자료 한 장 */
export function HandoutView({
  handout,
  onClose,
  onBack,
}: {
  handout: Handout;
  onClose: () => void;
  /** 자료함에서 열었으면 목록으로 돌아가기 */
  onBack?: () => void;
}) {
  return (
    <Leaf
      title={handout.title}
      kicker="GM이 보여 준 자료"
      label={`자료: ${handout.title}`}
      onClose={onClose}
      {...(onBack
        ? {
            footer: (
              <button type="button" className={styles.back} onClick={onBack}>
                ← 자료함
              </button>
            ),
          }
        : {})}
    >
      <Paper h={handout} />
    </Leaf>
  );
}

/** 자료함: 이 방에서 나에게 보여 준 자료 (GM은 보여 준 자료 모두와 받은 사람) */
export function HandoutShelf({
  state,
  isGm,
  onClose,
  onHide,
}: {
  state: RoomState;
  isGm: boolean;
  onClose: () => void;
  onHide?: (id: string) => void;
}) {
  const items = Object.values(state.handouts ?? {}).sort((a, b) => b.seq - a.seq);
  const [openId, setOpenId] = useState<string | null>(null);
  const open = openId ? state.handouts?.[openId] : undefined;
  if (open) return <HandoutView handout={open} onClose={onClose} onBack={() => setOpenId(null)} />;
  return (
    <Leaf
      title="자료함"
      kicker={isGm ? '보여 준 자료' : 'GM이 보여 준 자료'}
      label="자료함"
      onClose={onClose}
    >
      {items.length === 0 ? (
        <p className={styles.empty}>
          {isGm
            ? '아직 보여 준 자료 없음. GM 도구 → 자료에서 만들고 보여 주기'
            : '아직 받은 자료 없음. GM이 단서나 편지를 보여 주면 여기에 모인다'}
        </p>
      ) : (
        <ul className={styles.shelf}>
          {items.map((h) => (
            <li key={h.id}>
              <button type="button" className={styles.item} onClick={() => setOpenId(h.id)}>
                <span className={styles.thumb} aria-hidden>
                  {h.imageUrl ? <img src={h.imageUrl} alt="" /> : '✉'}
                </span>
                <span className={styles.itemText}>
                  <b>{h.title}</b>
                  {isGm ? (
                    <small>받은 사람: {audienceOf(h, state)}</small>
                  ) : (
                    h.body && <small>{plain(h.body).slice(0, 60)}</small>
                  )}
                </span>
              </button>
              {isGm && onHide && (
                <button
                  type="button"
                  className={styles.hide}
                  onClick={() => onHide(h.id)}
                  aria-label={`${h.title} 거두기`}
                >
                  거두기
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Leaf>
  );
}
