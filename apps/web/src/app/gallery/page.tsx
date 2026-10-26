import type { Metadata } from 'next';
import Link from 'next/link';
import { MyGallery } from '@/components/media/MyGallery';
import { ClientOnly } from '@/components/ui/ClientOnly';
import styles from '../rooms/lobby.module.css';

export const metadata: Metadata = { title: '내 그림 · 운명점 테이블' };

export default function MyGalleryPage() {
  return (
    <main className={styles.main}>
      <div className={`${styles.card} ${styles.wide}`}>
        <Link href="/" className={styles.back}>
          ← 처음으로
        </Link>
        <h1 className={styles.title}>내 그림</h1>
        <p className={styles.lead}>
          방에서 그린 초상화 · 스탠딩 · 배경은 이 브라우저에 저절로 담겨요. 다른 방에서 그림 창을
          열면 다시 고를 수 있고, PNG 파일로 받아 둘 수도 있어요.
        </p>
        <ClientOnly>
          <MyGallery />
        </ClientOnly>
      </div>
    </main>
  );
}
