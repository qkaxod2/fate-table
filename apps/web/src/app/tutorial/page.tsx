import type { Metadata } from 'next';
import { TryTable } from './TryTable';

export const metadata: Metadata = {
  title: '튜토리얼 · 운명점 테이블',
};

export default function TutorialPage() {
  return <TryTable />;
}
