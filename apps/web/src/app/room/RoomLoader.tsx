'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Loading } from '@/components/ui/Loading';
import { forgetRoom } from '@/lib/lobby';
import { ensureSession, getSupabase } from '@/lib/supabase';
import { RemoteRoom } from '@/state/remoteRoom';
import styles from '../rooms/lobby.module.css';
import { RoomTable } from './RoomTable';

type Load =
  | { kind: 'loading' }
  | { kind: 'ready'; room: RemoteRoom; name: string; inviteCode: string }
  | { kind: 'error'; message: string };

export function RoomLoader() {
  const id = useSearchParams().get('id') ?? '';
  const [load, setLoad] = useState<Load>({ kind: 'loading' });

  useEffect(() => {
    const sb = getSupabase();
    let room: RemoteRoom | null = null;
    let cancelled = false;
    (async () => {
      if (!sb) throw new Error('서버가 연결된 배포 사이트에서만 방에 들어갈 수 있어요.');
      await ensureSession(sb);
      const { data: auth } = await sb.auth.getUser();
      const { data: info } = await sb
        .from('rooms')
        .select('name, invite_code')
        .eq('id', id)
        .maybeSingle();
      if (!info) throw new Error('이 방의 참가자가 아니에요. 초대 코드로 먼저 들어와 주세요.');
      room = new RemoteRoom(sb, id, auth.user!.id);
      await room.start();
      if (!cancelled)
        setLoad({ kind: 'ready', room, name: info.name, inviteCode: info.invite_code });
    })().catch((e: unknown) => {
      if (!cancelled)
        setLoad({ kind: 'error', message: e instanceof Error ? e.message : '방을 열지 못했어요.' });
    });
    return () => {
      cancelled = true;
      room?.stop();
    };
  }, [id]);

  if (load.kind === 'ready')
    return <OpenRoom room={load.room} name={load.name} inviteCode={load.inviteCode} />;
  return (
    <main className={styles.main}>
      <div className={styles.card}>
        {load.kind === 'loading' ? (
          <Loading label="테이블을 펼치는 중…" />
        ) : (
          <>
            <h1 className={styles.title}>들어갈 수 없어요</h1>
            <p className={styles.lead}>{load.message}</p>
            <div className={styles.links}>
              <Link href="/join/">초대 코드로 참가하기</Link>
              <Link href="/rooms/">내 방 목록</Link>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

/** 테이블을 보여 주다가, GM이 방을 지우면 닫혔다는 안내로 바꾼다 */
function OpenRoom({
  room,
  name,
  inviteCode,
}: {
  room: RemoteRoom;
  name: string;
  inviteCode: string;
}) {
  const { closed } = useSyncExternalStore(room.subscribe, room.getSnapshot, room.getSnapshot);
  useEffect(() => {
    if (!closed) return;
    room.stop();
    forgetRoom(room.roomId);
  }, [closed, room]);

  if (!closed) return <RoomTable room={room} name={name} inviteCode={inviteCode} />;
  return (
    <main className={styles.main}>
      <div className={styles.card} role="alert">
        <h1 className={styles.title}>방이 닫혔어요</h1>
        <p className={styles.lead}>
          {room.actor.role === 'gm' ? '' : 'GM이 '}「{name}」 방을 지웠어요. 이야기 기록도 함께
          정리됐어요. 함께해 주셔서 고마워요.
        </p>
        <div className={styles.links}>
          <Link href="/rooms/">내 방 목록</Link>
          <Link href="/join/">다른 방 참가하기</Link>
        </div>
      </div>
    </main>
  );
}
