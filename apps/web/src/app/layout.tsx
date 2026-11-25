import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { RouteTracker } from '@/components/nav/RouteTracker';
import './globals.css';

// 마비옛체(넥슨 무료 글꼴, 상업 이용 · 웹 임베딩 허용). 굵기가 하나뿐이라 100~900 전체를 이 파일로 받아
// 브라우저가 가짜 굵게를 만들지 않게 한다.
const mabinogi = localFont({
  src: './fonts/MabinogiClassic.woff2',
  weight: '100 900',
  display: 'swap',
  variable: '--f-mabinogi',
});

export const metadata: Metadata = {
  title: '운명점 테이블',
  description: '기동형 페이트 전용 온라인 TRPG 테이블',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" data-genre="paper" className={mabinogi.variable} suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Cinzel:wght@600;800&family=Cinzel+Decorative:wght@900&family=IBM+Plex+Sans+KR:wght@400;500;600;700&family=IBM+Plex+Mono&family=Noto+Serif+KR:wght@500;700&display=swap"
        />
      </head>
      <body>
        <RouteTracker />
        {children}
      </body>
    </html>
  );
}
