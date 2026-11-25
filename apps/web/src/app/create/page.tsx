import type { Metadata } from 'next';
import { CreationWizard } from './CreationWizard';

export const metadata: Metadata = {
  title: '캐릭터 만들기 · NC ROOM',
};

export default function CreatePage() {
  return <CreationWizard />;
}
