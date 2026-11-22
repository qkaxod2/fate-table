import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ClientOnly } from '@/components/ui/ClientOnly';
import { ScreenLoader } from './ScreenView';

export const metadata: Metadata = { title: '큰 화면 · 운명점 테이블' };

export default function ScreenPage() {
  return (
    <Suspense>
      <ClientOnly>
        <ScreenLoader />
      </ClientOnly>
    </Suspense>
  );
}
