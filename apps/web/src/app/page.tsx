import { term } from '@fate/glossary';
import { formatRating } from '@fate/rules-engine';
import styles from './page.module.css';

const RUNGS = [8, 7, 6, 5, 4, 3, 2, 1, 0, -1, -2];

export default function Landing() {
  return (
    <main className={styles.main}>
      <section className={styles.hero}>
        <h1 className={styles.title}>운명점을 주고받는 테이블</h1>
        <p className={styles.lead}>
          {term('aspect')}과 {term('fatePoint')}이 중심이 되는 기동형 페이트 전용 온라인
          테이블이에요.
        </p>
        <ul className={styles.ladder} aria-label={term('ladder')}>
          {RUNGS.map((n) => (
            <li key={n} className={styles.rung}>
              {formatRating(n)}
            </li>
          ))}
        </ul>
        <p className={styles.credit}>
          Fate Accelerated Edition(Evil Hat Productions, CC BY 3.0)을 바탕으로 만들었어요.
        </p>
      </section>
    </main>
  );
}
