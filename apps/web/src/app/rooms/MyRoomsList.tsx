'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { SkeletonRows } from '@/components/ui/Loading';
import { useAccount } from '@/lib/account';
import { fetchMyRooms, forgetRoom, loadRecentRooms, ROLE_LABEL, roomHref } from '@/lib/lobby';
import { getSupabase } from '@/lib/supabase';
import { ExitRoomDialog } from './ExitRoomDialog';
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
  const [exiting, setExiting] = useState<Row | null>(null);
  const drop = (id: string) =>
    setLoad((l) => (l.kind === 'ready' ? { ...l, rows: l.rows.filter((r) => r.id !== id) } : l));

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
    return hideWhenEmpty ? null : <SkeletonRows label="방 목록을 불러오는 중" />;

  const rows = limit ? load.rows.slice(0, limit) : load.rows;
  if (rows.length === 0)
    return hideWhenEmpty ? null : (
      <p className={styles.note}>
        <strong>아직 들어간 방이 없어요</strong>방을 만들거나 초대 코드로 들어가면 여기에 차례로
        남아요. 처음이라면 <Link href="/tutorial/">튜토리얼</Link>부터 해 봐요.
      </p>
    );

  return (
    <>
      {heading && <h2 className={styles.listHeading}>{heading}</h2>}
      <ul className={styles.roomList}>
        {rows.map((r) => (
          <li key={r.id} className={styles.roomRow}>
            <Link href={roomHref(r.id)} className={styles.roomItem}>
              <span className={styles.roomName}>{r.name}</span>
              <span className={styles.leader} aria-hidden />
              <span className={styles.roomMeta} data-role={r.role}>
                {ROLE_LABEL[r.role] ?? r.role}
                {r.nickname ? ` · ${r.nickname}` : ''}
              </span>
            </Link>
            {load.fromServer ? (
              <button
                type="button"
                className={styles.rowAction}
                onClick={() => setExiting(r)}
                aria-label={r.role === 'gm' ? `${r.name} 지우기` : `${r.name}에서 나가기`}
                title={r.role === 'gm' ? '방 지우기' : '방 나가기'}
              >
                {r.role === 'gm' ? '지우기' : '나가기'}
              </button>
            ) : (
              <button
                type="button"
                className={styles.rowAction}
                onClick={() => {
                  forgetRoom(r.id);
                  drop(r.id);
                }}
                aria-label={`${r.name} 기록 지우기`}
                title="이 브라우저 기록에서만 지워요"
              >
                지우기
              </button>
            )}
          </li>
        ))}
      </ul>
      {exiting && (
        <ExitRoomDialog
          roomId={exiting.id}
          roomName={exiting.name}
          isGm={exiting.role === 'gm'}
          onCancel={() => setExiting(null)}
          onDone={() => {
            drop(exiting.id);
            setExiting(null);
          }}
        />
      )}
      {limit !== undefined && load.rows.length > limit && (
        <Link href="/rooms/" className={styles.more}>
          전체 {load.rows.length}개 보기 →
        </Link>
      )}
      {!load.fromServer && (
        <p className={styles.muted}>이 브라우저에만 남은 기록이에요. 지워도 방은 그대로예요.</p>
      )}
    </>
  );
}

/** 로그인하지 않았으면 목록이 이 기기에만 묶여 있다고 알려 준다 */
export function AccountHint() {
  const account = useAccount();
  if (!account || account.kind === 'member') return null;
  return (
    <p className={styles.muted}>
      지금 목록은 이 기기에만 있어요. <Link href="/account/">로그인</Link>하면 다른 기기에서도
      보여요.
    </p>
  );
}
