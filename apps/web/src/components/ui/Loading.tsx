import styles from './Loading.module.css';

const FACES = ['+', '−', '', '+'];

/**
 * 기다리는 동안 보여 주는 표시. 페이트 주사위 넷이 차례로 뒤집힌다.
 * 금방 끝나는 기다림에는 깜빡이지 않도록 잠깐 뒤에 스르르 나타난다.
 */
export function Loading({ label }: { label: string }) {
  return (
    <div className={styles.loading} role="status" aria-live="polite">
      <span className={styles.dice} aria-hidden>
        {FACES.map((f, i) => (
          <span key={i} className={styles.die}>
            {f}
          </span>
        ))}
      </span>
      <span className={styles.label}>{label}</span>
    </div>
  );
}

/** 목록이 오기 전 자리: 줄 모양 뼈대가 은은하게 빛을 훑는다 */
export function SkeletonRows({ count = 3, label }: { count?: number; label: string }) {
  return (
    <div className={styles.rows} role="status" aria-label={label}>
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className={styles.row} />
      ))}
    </div>
  );
}
