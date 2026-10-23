import type { Metadata } from 'next';
import { ClientOnly } from '@/components/ui/ClientOnly';
import { NewRoomForm } from './NewRoomForm';

export const metadata: Metadata = { title: '방 만들기 · 운명점 테이블' };

export default function NewRoomPage() {
  return (
    <ClientOnly>
      <NewRoomForm />
    </ClientOnly>
  );
}
