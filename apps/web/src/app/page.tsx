import { term } from '@fate/glossary';
import Link from 'next/link';
import { BrandSymbol, BrandWordmark } from '@/components/brand/BrandLogo';
import { AccountChip } from '@/components/account/AccountChip';
import { ClientOnly } from '@/components/ui/ClientOnly';
import { asset } from '@/lib/asset';
import styles from './page.module.css';
import { INTRO_BOOT, TitleIntro } from './TitleIntro';

/*
 * 첫 화면 = 게임의 타이틀 화면 (design-system.md 31절).
 * 장면 그림이 화면 전체이고, 왼쪽 아래에 제목과 세로 메뉴가 놓인다.
 * 패널·카드·타일 격자 없이 글자만으로 위계를 만든다.
 */

const MENU = [
  { href: '/tutorial/', label: '튜토리얼', note: '가입 없이 5분, 첫 굴림까지', main: true },
  { href: '/rooms/', label: '이어서 하기', note: '들어갔던 방' },
  { href: '/rooms/new/', label: '방 만들기', note: 'GM으로 방을 열고 일행 부르기' },
  { href: '/join/', label: '초대 코드로 참가', note: 'GM에게 받은 코드' },
  { href: '/create/', label: '캐릭터 만들기', note: '컨셉과 약점 한 줄씩' },
];

const TITLE = 'NC ROOM';

const SHELF = [
  { href: '/characters/', label: '내 캐릭터' },
  { href: '/gallery/', label: '내 그림' },
];

export default function Landing() {
  return (
    <main className={styles.title}>
      {/* 첫 그림보다 먼저: 타이틀 콜을 틀 차례면 화면을 가려 둔다 */}
      <script dangerouslySetInnerHTML={{ __html: INTRO_BOOT }} />
      <div className={styles.scene} aria-hidden>
        <img className={styles.bg} src={asset('/try/bg.jpg')} alt="" />
        <img className={`${styles.cast} ${styles.scout}`} src={asset('/try/scout.webp')} alt="" />
        <img className={`${styles.cast} ${styles.alch}`} src={asset('/try/alch.webp')} alt="" />
        <img className={`${styles.cast} ${styles.knight}`} src={asset('/try/knight.webp')} alt="" />
      </div>

      <TitleIntro titleId="title-call" />

      <ClientOnly>
        <AccountChip />
      </ClientOnly>

      <div className={styles.front}>
        <h1 className={styles.name} aria-label={TITLE}>
          <span id="title-call" className={styles.call} aria-hidden>
            {/* 기호 → 글자 순서로 초점이 맞는다 */}
            <span
              className={`${styles.glyph} ${styles.mark}`}
              style={{ '--i': 0 } as React.CSSProperties}
            >
              <BrandSymbol />
            </span>
            <span
              className={`${styles.glyph} ${styles.word}`}
              style={{ '--i': 3 } as React.CSSProperties}
            >
              <BrandWordmark />
            </span>
          </span>
        </h1>
        <p className={styles.lead}>
          기동형 페이트로 친구들과 이야기를 굴리는 온라인 테이블. {term('aspect')} 한 줄과{' '}
          {term('fatePoint')} 몇 개면 된다.
        </p>

        <nav className={styles.menu} aria-label="시작하기">
          <ul>
            {MENU.map((m) => (
              <li key={m.href}>
                <Link href={m.href} className={styles.item} data-main={m.main || undefined}>
                  <span className={styles.label}>{m.label}</span>
                  <span className={styles.note}>{m.note}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav className={styles.shelf} aria-label="내 기록">
          {SHELF.map((s) => (
            <Link key={s.href} href={s.href}>
              {s.label}
            </Link>
          ))}
        </nav>
      </div>

      <p className={styles.colophon}>
        Fate Accelerated Edition(Evil Hat Productions, CC BY 3.0) 기반
      </p>
    </main>
  );
}
