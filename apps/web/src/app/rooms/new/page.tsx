import type { Metadata } from 'next';
import { ClientOnly } from '@/components/ui/ClientOnly';
import { NewRoomForm } from './NewRoomForm';

export const metadata: Metadata = { title: '방 만들기 · NC ROOM' };

export default function NewRoomPage() {
  return (
    <ClientOnly>
      <NewRoomForm />
    </ClientOnly>
  );
}
