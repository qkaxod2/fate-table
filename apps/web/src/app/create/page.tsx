import type { Metadata } from 'next';
import { CreationWizard } from './CreationWizard';

export const metadata: Metadata = {
  title: '캐릭터 만들기 · 운명점 테이블',
};

export default function CreatePage() {
  return <CreationWizard />;
}
