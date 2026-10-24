'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { fetchMyRooms, loadRecentRooms, ROLE_LABEL, roomHref } from '@/lib/lobby';
import { getSupabase } from '@/lib/supabase';
import styles from './lobby.module.css';

interface Row {
  id: string;
  name: string;
  role: string;
  nickname?: string;
  at: string;
}

type Load = { kind: 'loading' } | { kind: 'ready'; rows: Row[]; fromServer: boolean };

function recentRows(): Row[] {
  return loadRecentRooms().map((r) => ({ id: r.id, name: r.name, role: r.role, at: r.at }));
}

/** 내가 들어간 방. 서버 목록이 우선이고, 서버에 닿지 못하면 이 브라우저의 기록을 보여 준다. */
export function MyRoomsList({
  limit,
  heading,
  hideWhenEmpty,
}: {
  limit?: number;
  heading?: string;
  hideWhenEmpty?: boolean;
}) {
  const [load, setLoad] = useState<Load>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    const sb = getSupabase();
    (async () => {
      const mine = sb ? await fetchMyRooms(sb) : null;
      if (cancelled) return;
      setLoad(
        mine
          ? {
              kind: 'ready',
              fromServer: true,
              rows: mine.map((r) => ({ ...r, at: r.joinedAt })),
            }
          : { kind: 'ready', fromServer: false, rows: recentRows() },
      );
    })().catch(() => {
      if (!cancelled) setLoad({ kind: 'ready', fromServer: false, rows: recentRows() });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (load.kind === 'loading')
    return hideWhenEmpty ? null : <p className={styles.muted}>방 목록을 불러오는 중…</p>;

  const rows = limit ? load.rows.slice(0, limit) : load.rows;
  if (rows.length === 0)
    return hideWhenEmpty ? null : (
      <p className={styles.muted}>
        아직 들어간 방이 없어요. 방을 만들거나 초대 코드로 참가하면 여기에 남아요.
      </p>
    );

  return (
    <>
      {heading && <h2 className={styles.listHeading}>{heading}</h2>}
      <ul className={styles.roomList}>
        {rows.map((r) => (
          <li key={r.id}>
            <Link href={roomHref(r.id)} className={styles.roomItem}>
              <span className={styles.roomName}>{r.name}</span>
              <span className={styles.roomMeta}>
                {ROLE_LABEL[r.role] ?? r.role}
                {r.nickname ? ` · ${r.nickname}` : ''}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {limit !== undefined && load.rows.length > limit && (
        <Link href="/rooms/" className={styles.back}>
          전체 {load.rows.length}개 보기 →
        </Link>
      )}
      {!load.fromServer && <p className={styles.muted}>이 브라우저에 남은 기록이에요.</p>}
    </>
  );
}
