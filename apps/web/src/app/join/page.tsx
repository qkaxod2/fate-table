import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ClientOnly } from '@/components/ui/ClientOnly';
import { JoinForm } from './JoinForm';

export const metadata: Metadata = { title: '방 참가 · 운명점 테이블' };

export default function JoinPage() {
  return (
    <Suspense>
      <ClientOnly>
        <JoinForm />
      </ClientOnly>
    </Suspense>
  );
}
