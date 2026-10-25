import styles from './template.module.css';

/** 화면을 옮길 때마다 새로 그려진다: 툭 바뀌지 않고 살짝 밝아지며 들어온다 */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className={styles.page}>{children}</div>;
}
