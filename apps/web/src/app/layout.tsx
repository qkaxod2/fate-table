import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { RouteTracker } from '@/components/nav/RouteTracker';
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import './globals.css';

// 마비옛체(넥슨 무료 글꼴, 상업 이용 · 웹 임베딩 허용). 굵기가 하나뿐이라 100~900 전체를 이 파일로 받아
// 브라우저가 가짜 굵게를 만들지 않게 한다.
const mabinogi = localFont({
  src: './fonts/MabinogiClassic.woff2',
  weight: '100 900',
  display: 'swap',
  variable: '--f-mabinogi',
});

// 마루 부리(네이버, OFL). 이야기 본문 · 대사 · 특성 문구. 무거워서 미리 받지 않는다.
const maruBuri = localFont({
  src: [
    { path: './fonts/MaruBuri-Regular.woff2', weight: '400' },
    { path: './fonts/MaruBuri-Bold.woff2', weight: '700' },
  ],
  display: 'swap',
  preload: false,
  variable: '--f-maruburi',
});

export const metadata: Metadata = {
  title: '운명점 테이블',
  description: '기동형 페이트 전용 온라인 TRPG 테이블',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" data-genre="paper" className={`${mabinogi.variable} ${maruBuri.variable}`} suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Cinzel:wght@600;800&family=Cinzel+Decorative:wght@900&family=IBM+Plex+Mono&display=swap"
        />
      </head>
      <body>
        <RouteTracker />
        {children}
      </body>
    </html>
  );
}
