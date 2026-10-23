import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: '튜토리얼로 이동 · 운명점 테이블',
  robots: { index: false },
};

// 예전 주소(/try/)로 들어온 사람을 튜토리얼로 보낸다 (정적 내보내기라 서버 리다이렉트가 없다)
export default function TryRedirect() {
  return (
    <main style={{ padding: 32, textAlign: 'center' }}>
      <meta httpEquiv="refresh" content="0; url=../tutorial/" />
      <Link href="/tutorial/">튜토리얼로 이동</Link>
    </main>
  );
}
