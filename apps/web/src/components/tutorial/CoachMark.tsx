import Link from 'next/link';
import styles from './CoachMark.module.css';

export interface Coach {
  step: number;
  total: number;
  /** STEP 앞에 붙는 장 이름 (예: "1장 · 극복") */
  chapter?: string;
  title: string;
  body: string;
  /** 쉬운 예시나 지금 할 일. 본문 아래 따로 강조해 보여 준다 */
  example?: string;
  /** 하나씩 짚어 주는 목록 (결과 4단계, 굴림 계산 순서 등) */
  points?: string[];
  /** 설명만 하는 단계: 읽고 이 버튼을 눌러 넘어간다 */
  next?: { label: string; onClick: () => void };
  keys?: string[];
  /** 다 끝냈을 때: STEP 대신 CLEAR를 보이고 점들이 차례로 반짝인다 */
  clear?: boolean;
  /** 다음으로 갈 곳 (예: 캐릭터 만들기) */
  links?: { href: string; label: string }[];
}

interface Props {
  coach: Coach;
  onHide: () => void;
  /** 숨기기 버튼 문구 (튜토리얼 진행 중에는 "건너뛰기") */
  hideLabel?: string;
  /** 굴림 패널이 무대 가운데를 차지할 때: 왼쪽 파티 칸 위로 비켜 선다 (넓은 화면) */
  dock?: boolean;
  /** 단계별 진행 중: 좁은 화면에서도 스크롤해도 안내가 화면 위에 붙어 있게 */
  pinned?: boolean;
}

/** 튜토리얼 단계 안내. 무대 가운데 위쪽에 크게 띄운다. */
export function CoachMark({
  coach,
  onHide,
  hideLabel = '안내 숨기기',
  dock = false,
  pinned = false,
}: Props) {
  return (
    <div
      className={styles.coach}
      role="status"
      aria-live="polite"
      data-coach
      data-clear={coach.clear || undefined}
      data-dock={dock || undefined}
      data-pinned={pinned || undefined}
    >
      <div className={styles.head}>
        {coach.chapter && <span className={styles.chapter}>{coach.chapter}</span>}
        <span className={styles.step}>
          {coach.clear ? 'CLEAR' : `STEP ${coach.step} / ${coach.total}`}
        </span>
        <ol className={styles.dots} aria-hidden>
          {Array.from({ length: coach.total }, (_, i) => (
            <li key={i} data-on={i < coach.step || undefined} />
          ))}
        </ol>
        <button type="button" className={styles.hide} onClick={onHide}>
          {hideLabel}
        </button>
      </div>
      <p className={styles.title}>{coach.title}</p>
      <p className={styles.body}>{coach.body}</p>
      {coach.points && coach.points.length > 0 && (
        <ul className={styles.points}>
          {coach.points.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      {coach.example && <p className={styles.example}>{coach.example}</p>}
      {coach.keys && coach.keys.length > 0 && (
        <p className={styles.keys}>
          단축키{' '}
          {coach.keys.map((k) => (
            <kbd key={k}>{k}</kbd>
          ))}
        </p>
      )}
      {coach.next && (
        <p className={styles.nextRow}>
          <button type="button" className={styles.next} onClick={coach.next.onClick} autoFocus>
            {coach.next.label} →
          </button>
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
