import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ClientOnly } from '@/components/ui/ClientOnly';
import { RoomLoader } from './RoomLoader';

export const metadata: Metadata = { title: '테이블 · NC ROOM' };

export default function RoomPage() {
  return (
    <Suspense>
      <ClientOnly>
        <RoomLoader />
      </ClientOnly>
    </Suspense>
  );
}
