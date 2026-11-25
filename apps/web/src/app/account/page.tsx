import type { Metadata } from 'next';
import { ClientOnly } from '@/components/ui/ClientOnly';
import { AccountPanel } from './AccountPanel';

export const metadata: Metadata = { title: '계정 · NC ROOM' };

export default function AccountPage() {
  return (
    <ClientOnly>
      <AccountPanel />
    </ClientOnly>
  );
}
