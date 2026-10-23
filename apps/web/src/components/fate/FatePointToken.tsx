import { term } from '@fate/glossary';
import styles from './FatePointToken.module.css';

export function FatePointToken({ count, max = 5 }: { count: number; max?: number }) {
  const shown = Math.max(count, Math.min(max, 3));
  return (
    <span className={styles.row} role="img" aria-label={`${term('fatePoint')} ${count}`}>
      {Array.from({ length: shown }, (_, i) => (
        <span key={i} className={styles.token} data-empty={i >= count || undefined} />
      ))}
    </span>
  );
}
