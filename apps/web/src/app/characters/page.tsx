import type { Metadata } from 'next';
import Link from 'next/link';
import { AccountChip } from '@/components/account/AccountChip';
import { PageNav } from '@/components/nav/PageNav';
import { ClientOnly } from '@/components/ui/ClientOnly';
import styles from '../rooms/lobby.module.css';
import { CharacterShelf } from './CharacterShelf';
import own from './characters.module.css';

export const metadata: Metadata = { title: '내 캐릭터 · 운명점 테이블' };

export default function MyCharactersPage() {
  return (
    <main className={styles.main}>
      <ClientOnly>
        <AccountChip />
      </ClientOnly>
      <div className={`${styles.card} ${styles.wide}`}>
        <PageNav />
        <div className={own.head}>
          <h1 className={styles.title}>내 캐릭터</h1>
          <Link href="/create/" className={own.create}>
            새 캐릭터 만들기
          </Link>
        </div>
        <p className={styles.lead}>
          캐릭터 만들기에서 저장한 시트. 방의 캐릭터 데려오기에서 그대로 불러온다. 고친 내용은
          다음에 데려갈 때부터 들어가고, 이미 방에 있는 캐릭터는 그 방에서 쌓인 기록과 함께 그대로
          남는다.
        </p>
        <ClientOnly>
          <CharacterShelf />
        </ClientOnly>
      </div>
    </main>
  );
}
