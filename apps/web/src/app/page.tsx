import { term } from '@fate/glossary';
import Link from 'next/link';
import { AccountChip } from '@/components/account/AccountChip';
import { ClientOnly } from '@/components/ui/ClientOnly';
import { asset } from '@/lib/asset';
import { MyRoomsList } from './rooms/MyRoomsList';
import styles from './page.module.css';

/** 속표지의 차례: 튜토리얼 다음에 갈 수 있는 곳 */
const CONTENTS = [
  {
    href: '/create/',
    title: '캐릭터 만들기',
    desc: '컨셉과 약점을 한 줄씩 적으면 내 캐릭터가 생겨요.',
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

const NUMERALS = ['i', 'ii', 'iii'];

/** 책갈피: 해 본 사람이 돌아갈 곳 */
const SHELF = [
  { href: '/rooms/', title: '내 방', desc: '들어갔던 방 다시 열기' },
  { href: '/gallery/', title: '내 그림', desc: '방에서 그린 그림 모음' },
];

/** 표지 아래에 핀으로 꽂아 둔 규칙 카드 세 장: 이 게임에서 알아야 할 것 전부 */
const RULE_CARDS = [
  { label: term('aspect'), text: '캐릭터와 장면을 한 줄로', note: '"사방에 번지는 불길"' },
  { label: term('fatePoint'), text: '쓰면 +2, 곤란을 받으면 하나 더', note: '동전 3개로 시작해요' },
  { label: term('fateDice'), text: '넷을 굴려 접근법 수치에 더해요', note: '＋ ○ － ＋' },
];

export default function Landing() {
  return (
    <main className={styles.desk}>
      <ClientOnly>
        <AccountChip />
      </ClientOnly>
      <div className={styles.spread}>
        {/* 왼쪽: 표지. 튜토리얼 첫 장면 그림 위에 제목 딱지를 붙였다 */}
        <div className={styles.cover} aria-hidden>
          <img className={styles.coverArt} src={asset('/try/bg.jpg')} alt="" />
          <img
            className={`${styles.coverHero} ${styles.h1}`}
            src={asset('/try/scout.webp')}
            alt=""
          />
          <img
            className={`${styles.coverHero} ${styles.h2}`}
            src={asset('/try/alch.webp')}
            alt=""
          />
          <img
            className={`${styles.coverHero} ${styles.h3}`}
            src={asset('/try/knight.webp')}
            alt=""
          />
          <p className={styles.coverLabel}>
            <span>튜토리얼 · 첫 장면</span>
            불타는 곡물 창고
          </p>
          <ul className={styles.ruleCards}>
            {RULE_CARDS.map((c) => (
              <li key={c.label}>
                <span className={styles.ruleLabel}>{c.label}</span>
                <span className={styles.ruleText}>{c.text}</span>
                <span className={styles.ruleNote}>{c.note}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* 오른쪽: 속표지. 첫째로 할 일은 튜토리얼 하나 */}
        <section className={styles.titlePage}>
          <p className={styles.kicker}>기동형 페이트 온라인 TRPG</p>
          <h1 className={styles.title}>운명점 테이블</h1>
          <p className={styles.lead}>
            {term('aspect')} 한 줄과 {term('fatePoint')} 몇 개로 친구들과 이야기를 굴려요. 규칙을
            몰라도 튜토리얼 한 판이면 바로 같이 놀 수 있어요.
          </p>

          <div className={styles.start}>
            <Link href="/tutorial/" className={styles.primary}>
              튜토리얼로 시작하기
            </Link>
            <span className={styles.startNote}>5분이면 충분해요 · 가입 필요 없어요</span>
          </div>

          <nav className={styles.contents} aria-label="차례">
            <h2 className={styles.contentsHead}>차례</h2>
            <ol>
              {CONTENTS.map((c, i) => (
                <li key={c.href}>
                  <Link href={c.href} className={styles.entry}>
                    <span className={styles.num} aria-hidden>
                      {NUMERALS[i]}
                    </span>
                    <span className={styles.entryText}>
                      <strong>{c.title}</strong>
                      <span>{c.desc}</span>
                    </span>
                    <span className={styles.leader} aria-hidden />
                    <span className={styles.go} aria-hidden>
                      →
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          </nav>

          {/* 책갈피: 이미 해 본 사람이 돌아갈 곳 */}
          <nav className={styles.shelf} aria-label="내 기록">
            {SHELF.map((s) => (
              <Link key={s.href} href={s.href} className={styles.tab}>
                <strong>{s.title}</strong>
                <span>{s.desc}</span>
              </Link>
            ))}
          </nav>

          <div className={styles.recent}>
            <ClientOnly>
              <MyRoomsList limit={5} heading="이어서 하기" hideWhenEmpty />
            </ClientOnly>
          </div>

          <p className={styles.colophon}>
            Fate Accelerated Edition(Evil Hat Productions, CC BY 3.0)을 바탕으로 만들었어요.
          </p>
        </section>
      </div>
    </main>
  );
}
