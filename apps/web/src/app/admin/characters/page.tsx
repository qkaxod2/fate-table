import type { Metadata } from 'next';
import { LobbyBackdrop } from '@/components/lobby/LobbyBackdrop';
import { AccountChip } from '@/components/account/AccountChip';
import { PageNav } from '@/components/nav/PageNav';
import { ClientOnly } from '@/components/ui/ClientOnly';
import styles from '../../rooms/lobby.module.css';
import { AllCharacters } from './AllCharacters';

export const metadata: Metadata = {
  title: '전체 캐릭터 · 운명점 테이블',
  robots: { index: false, follow: false },
};

export default function AdminCharactersPage() {
  return (
    <main className={styles.main} data-ink="night">
      <LobbyBackdrop />
      <ClientOnly>
        <AccountChip />
      </ClientOnly>
      <div className={`${styles.card} ${styles.wide}`}>
        <PageNav fallback="/characters/" />
        <h1 className={styles.title}>전체 캐릭터</h1>
        <p className={styles.lead}>
          운영자 전용. 모든 사용자가 계정에 저장한 캐릭터시트를 읽기 전용으로 본다. 한 브라우저에만
          저장한 캐릭터는 서버에 없어서 여기에 나오지 않는다.
        </p>
        <ClientOnly>
          <AllCharacters />
        </ClientOnly>
      </div>
    </main>
  );
}
