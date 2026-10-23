import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '운명점 테이블',
  description: '기동형 페이트 전용 온라인 TRPG 테이블',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" data-genre="paper">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Cinzel:wght@600;800&family=Cinzel+Decorative:wght@900&family=IBM+Plex+Sans+KR:wght@400;600&family=IBM+Plex+Mono&family=Noto+Serif+KR:wght@500;700&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
