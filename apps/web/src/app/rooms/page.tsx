import type { Metadata } from 'next';
import Link from 'next/link';
import { AccountChip } from '@/components/account/AccountChip';
import { ClientOnly } from '@/components/ui/ClientOnly';
import styles from './lobby.module.css';
import { AccountHint, MyRoomsList } from './MyRoomsList';

export const metadata: Metadata = { title: '내 방 · 운명점 테이블' };

export default function MyRoomsPage() {
  return (
    <main className={styles.main}>
      <ClientOnly>
        <AccountChip />
      </ClientOnly>
      <div className={styles.card}>
        <Link href="/" className={styles.back}>
          ← 처음으로
        </Link>
        <h1 className={styles.title}>내 방</h1>
        <p className={styles.lead}>한 번 들어간 방은 초대 코드 없이 바로 다시 들어갈 수 있어요.</p>
        <ClientOnly>
          <MyRoomsList />
          <AccountHint />
        </ClientOnly>
        <div className={styles.links}>
          <Link href="/rooms/new/">방 만들기</Link>
          <Link href="/join/">초대 코드로 참가</Link>
        </div>
      </div>
    </main>
  );
}
