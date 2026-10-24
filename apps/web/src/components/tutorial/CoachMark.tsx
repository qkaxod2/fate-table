import Link from 'next/link';
import styles from './CoachMark.module.css';

export interface Coach {
  step: number;
  total: number;
  title: string;
  body: string;
  keys?: string[];
  /** 다 끝냈을 때: STEP 대신 CLEAR를 보이고 점들이 차례로 반짝인다 */
  clear?: boolean;
  /** 다음으로 갈 곳 (예: 캐릭터 만들기) */
  links?: { href: string; label: string }[];
}

interface Props {
  coach: Coach;
  onHide: () => void;
}

/** 튜토리얼 단계 안내. 무대 가운데 위쪽에 크게 띄운다. */
export function CoachMark({ coach, onHide }: Props) {
  return (
    <div
      className={styles.coach}
      role="status"
      aria-live="polite"
      data-coach
      data-clear={coach.clear || undefined}
    >
      <div className={styles.head}>
        <span className={styles.step}>
          {coach.clear ? 'CLEAR' : `STEP ${coach.step} / ${coach.total}`}
        </span>
        <ol className={styles.dots} aria-hidden>
          {Array.from({ length: coach.total }, (_, i) => (
            <li key={i} data-on={i < coach.step || undefined} />
          ))}
        </ol>
        <button type="button" className={styles.hide} onClick={onHide}>
          안내 숨기기
        </button>
      </div>
      <p className={styles.title}>{coach.title}</p>
      <p className={styles.body}>{coach.body}</p>
      {coach.keys && coach.keys.length > 0 && (
        <p className={styles.keys}>
          단축키{' '}
          {coach.keys.map((k) => (
            <kbd key={k}>{k}</kbd>
          ))}
        </p>
      )}
      {coach.links && coach.links.length > 0 && (
        <p className={styles.links}>
          {coach.links.map((l) => (
            <Link key={l.href} href={l.href}>
              {l.label}
            </Link>
          ))}
        </p>
      )}
    </div>
  );
}
