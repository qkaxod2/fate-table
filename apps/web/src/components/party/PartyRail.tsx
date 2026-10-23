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

export function PartyRail({
  members,
  onSelect,
  onSheet,
  selectHint = '시트 보기',
}: {
  members: PartyMember[];
  /** 줄을 누르면 (예: 움직일 캐릭터로 고르기, 시트 열기) */
  onSelect?: (id: string) => void;
  /** 오른쪽 작은 버튼: 캐릭터 시트 열기 */
  onSheet?: (id: string) => void;
  selectHint?: string | ((id: string) => string);
}) {
  return (
    <aside className={styles.rail} aria-label="파티">
      <div className={styles.head}>PARTY · FATE</div>
      {members.map(({ character: c, image, status, active }) => (
        <div
          key={c.id}
          className={styles.member}
          {...(onSelect
            ? {
                role: 'button',
                tabIndex: 0,
                title: `${c.name} ${typeof selectHint === 'function' ? selectHint(c.id) : selectHint}`,
                onClick: () => onSelect(c.id),
                onKeyDown: (e: { key: string }) => {
                  if (e.key === 'Enter') onSelect(c.id);
                },
              }
            : {})}
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
            {c.milestone && <div className={styles.milestone}>{term('milestone')}!</div>}
          </div>
          {onSheet && (
            <button
              type="button"
              className={styles.sheetBtn}
              title={`${c.name} 시트`}
              aria-label={`${c.name} 시트`}
              onClick={(e) => {
                e.stopPropagation();
                onSheet(c.id);
              }}
            >
              시트
            </button>
          )}
        </div>
      ))}
    </aside>
  );
}
