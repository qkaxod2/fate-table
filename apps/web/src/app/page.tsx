import { term } from '@fate/glossary';
import { formatRating } from '@fate/rules-engine';
import Link from 'next/link';
import { AccountChip } from '@/components/account/AccountChip';
import { ClientOnly } from '@/components/ui/ClientOnly';
import { MyRoomsList } from './rooms/MyRoomsList';
import styles from './page.module.css';

const RUNGS = [8, 7, 6, 5, 4, 3, 2, 1, 0, -1, -2];

const PATHS = [
  {
    href: '/create/',
    title: '캐릭터 만들기',
    desc: '컨셉과 약점을 한 줄씩 적으면 나만의 캐릭터가 생겨요.',
  },
  {
    href: '/rooms/new/',
    title: '방 만들기',
    desc: 'GM이 되어 방을 열고, 초대 링크로 일행을 불러요.',
  },
  {
    href: '/join/',
    title: '초대 코드로 참가',
    desc: 'GM에게 받은 코드를 넣고 바로 테이블에 앉아요.',
  },
];

export default function Landing() {
  return (
    <main className={styles.main}>
      <ClientOnly>
        <AccountChip />
      </ClientOnly>
      <section className={styles.hero}>
        <p className={styles.kicker}>기동형 페이트 온라인 테이블</p>
        <h1 className={styles.title}>운명점을 주고받는 테이블</h1>
        <p className={styles.lead}>
          {term('aspect')}과 {term('fatePoint')}이 중심이 되는 TRPG 테이블이에요. 규칙을 몰라도
          튜토리얼 한 판이면 바로 함께할 수 있어요.
        </p>
        <div className={styles.start}>
          <Link href="/tutorial/" className={styles.primary}>
            튜토리얼로 시작하기
          </Link>
          <span className={styles.startNote}>5분이면 충분해요</span>
        </div>

        <ul className={styles.paths}>
          {PATHS.map((p) => (
            <li key={p.href}>
              <Link href={p.href} className={styles.path}>
                <strong>{p.title}</strong>
                <span>{p.desc}</span>
              </Link>
            </li>
          ))}
        </ul>
        <p className={styles.more}>
          <Link href="/rooms/">내 방 목록</Link>
          <Link href="/gallery/">내 그림</Link>
        </p>

        <div className={styles.myRooms}>
          <ClientOnly>
            <MyRoomsList limit={5} heading="최근에 들어간 방" hideWhenEmpty />
          </ClientOnly>
        </div>

        <figure className={styles.ladderBox}>
          <figcaption className={styles.ladderHead}>
            {term('ladder')}
            <span>주사위 결과는 이 단계 이름으로 불러요</span>
          </figcaption>
          <ul className={styles.ladder} aria-label={term('ladder')}>
            {RUNGS.map((n) => (
              <li key={n} className={styles.rung} data-sign={n > 0 ? '+' : n < 0 ? '-' : '0'}>
                {formatRating(n)}
              </li>
            ))}
          </ul>
        </figure>
        <p className={styles.credit}>
          Fate Accelerated Edition(Evil Hat Productions, CC BY 3.0)을 바탕으로 만들었어요.
        </p>
      </section>
    </main>
  );
}
