import { asset } from '@/lib/asset';
import styles from './LobbyBackdrop.module.css';

/**
 * 로비 화면 뒤에 남는 타이틀 화면의 장면 (design-system.md 34절).
 * 타이틀에서 한 단계 들어왔다는 것을 그림으로 잇는다. 글이 놓이는 왼쪽은 탁자색으로 덮는다.
 */
export function LobbyBackdrop() {
  return (
    <div className={styles.backdrop} aria-hidden>
      <img src={asset('/try/bg.jpg')} alt="" />
    </div>
  );
}
