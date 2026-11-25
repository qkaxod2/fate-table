import type { Metadata } from 'next';
import { TryTable } from './TryTable';

export const metadata: Metadata = {
  title: '튜토리얼 · NC ROOM',
};

export default function TutorialPage() {
  return <TryTable />;
}
