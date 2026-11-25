import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ClientOnly } from '@/components/ui/ClientOnly';
import { ScreenLoader } from './ScreenView';

export const metadata: Metadata = { title: '큰 화면 · NC ROOM' };

export default function ScreenPage() {
  return (
    <Suspense>
      <ClientOnly>
        <ScreenLoader />
      </ClientOnly>
    </Suspense>
  );
}
