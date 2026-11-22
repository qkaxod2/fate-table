import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ClientOnly } from '@/components/ui/ClientOnly';
import { ReplayLoader } from './ReplayView';

export const metadata: Metadata = { title: '리플레이 · 운명점 테이블' };

export default function ReplayPage() {
  return (
    <Suspense>
      <ClientOnly>
        <ReplayLoader />
      </ClientOnly>
    </Suspense>
  );
}
