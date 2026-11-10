'use client';

import styles from './MobileTabs.module.css';

export type RoomTab = 'stage' | 'story' | 'me';

const ICON: Record<RoomTab, string> = {
  stage: 'M3 5h18v12H3zM8 21h8',
  story: 'M4 5h16v11H9l-5 4z',
  me: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c1-4 4-6 8-6s7 2 8 6',
};

/**
 * 좁은 화면(1100px 이하)의 아래 탭: 무대 · 이야기 · 내 캐릭터.
 * 한 화면에 하나만 보여서 위아래로 오가지 않아도 된다. 넓은 화면에서는 숨는다.
 */
export function MobileTabs({
  tab,
  onTab,
  unread,
  isGm,
  locked,
}: {
  tab: RoomTab;
  onTab: (t: RoomTab) => void;
  /** 이야기 탭을 떠나 있는 동안 새로 적힌 줄 수 */
  unread: number;
  isGm: boolean;
  /** 판정·방어·강요가 떠 있어 무대에 붙잡혀 있다 */
  locked: boolean;
}) {
  const tabs: Array<[RoomTab, string]> = [
    ['stage', '무대'],
    ['story', '이야기'],
    ['me', isGm ? 'GM 도구' : '내 캐릭터'],
  ];
  return (
    <nav className={styles.bar} aria-label="화면 고르기" data-room-tabs="">
      {tabs.map(([t, label]) => (
        <button
          key={t}
          type="button"
          className={styles.tab}
          aria-current={tab === t ? 'page' : undefined}
          disabled={locked && t !== 'stage'}
          onClick={() => onTab(t)}
        >
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
            <path d={ICON[t]} />
          </svg>
          <span>{label}</span>
          {t === 'story' && unread > 0 && tab !== 'story' && (
            <span className={styles.badge} aria-label={`새 기록 ${unread}개`}>
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </button>
      ))}
    </nav>
  );
}
