import type { Metadata } from 'next';
import { TryTable } from './TryTable';

export const metadata: Metadata = {
  title: '바로 해보기 · 운명점 테이블',
};

export default function TryPage() {
  return <TryTable />;
}
