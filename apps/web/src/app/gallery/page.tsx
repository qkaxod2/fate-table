import { LobbyBackdrop } from '@/components/lobby/LobbyBackdrop';
import type { Metadata } from 'next';
import { PageNav } from '@/components/nav/PageNav';
import { MyGallery } from '@/components/media/MyGallery';
import { ClientOnly } from '@/components/ui/ClientOnly';
import styles from '../rooms/lobby.module.css';

export const metadata: Metadata = { title: '내 그림 · NC ROOM' };

export default function MyGalleryPage() {
  return (
    <main className={styles.main} data-ink="night">
      <LobbyBackdrop />
      <div className={`${styles.card} ${styles.wide}`}>
        <PageNav />
        <h1 className={styles.title}>내 그림</h1>
        <p className={styles.lead}>
          방에서 그린 초상화, 스탠딩, 배경이 이 브라우저에 저절로 모인다. 다른 방의 그림 창에서 다시
          고르거나 PNG로 내려받을 수 있다.
        </p>
        <ClientOnly>
          <MyGallery />
        </ClientOnly>
      </div>
    </main>
  );
}
