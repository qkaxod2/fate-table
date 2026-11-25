import { LobbyBackdrop } from '@/components/lobby/LobbyBackdrop';
import type { Metadata } from 'next';
import Link from 'next/link';
import { AccountChip } from '@/components/account/AccountChip';
import { PageNav } from '@/components/nav/PageNav';
import { ClientOnly } from '@/components/ui/ClientOnly';
import styles from '../rooms/lobby.module.css';
import { AdminLink } from './AdminLink';
import { CharacterShelf } from './CharacterShelf';
import own from './characters.module.css';

export const metadata: Metadata = { title: '내 캐릭터 · NC ROOM' };

export default function MyCharactersPage() {
  return (
    <main className={styles.main} data-ink="night">
      <LobbyBackdrop />
      <ClientOnly>
        <AccountChip />
      </ClientOnly>
      <div className={`${styles.card} ${styles.wide}`}>
        <PageNav />
        <div className={own.head}>
          <h1 className={styles.title}>내 캐릭터</h1>
          <div className={own.headActions}>
            <ClientOnly>
              <AdminLink />
            </ClientOnly>
            <Link href="/create/" className={own.create}>
              새 캐릭터 만들기
            </Link>
          </div>
        </div>
        <p className={styles.lead}>
          저장한 캐릭터시트. 어느 방에서든 데려올 수 있고, 고친 내용은 다음에 데려갈 때부터
          들어간다.
        </p>
        <ClientOnly>
          <CharacterShelf />
        </ClientOnly>
      </div>
    </main>
  );
}
