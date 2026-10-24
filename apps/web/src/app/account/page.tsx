import type { Metadata } from 'next';
import { ClientOnly } from '@/components/ui/ClientOnly';
import { AccountPanel } from './AccountPanel';

export const metadata: Metadata = { title: '계정 · 운명점 테이블' };

export default function AccountPage() {
  return (
    <ClientOnly>
      <AccountPanel />
    </ClientOnly>
  );
}
