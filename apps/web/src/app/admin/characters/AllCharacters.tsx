'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { SkeletonRows } from '@/components/ui/Loading';
import { useAccount } from '@/lib/account';
import { type AdminCharacter, fetchAllCharacters } from '@/lib/adminCharacters';
import { ApiError } from '@/lib/api';
import lobby from '../../rooms/lobby.module.css';
import { draftToForm, Sheet } from '../../create/Sheet';
import { PasswordDesk } from './PasswordDesk';
import shelf from '../../characters/characters.module.css';
import styles from './admin.module.css';

const savedDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}. 저장`;
};

type Load =
  | { state: 'loading' }
  | { state: 'denied' }
  | { state: 'error' }
  | { state: 'ready'; list: AdminCharacter[]; truncated: boolean };

/** 운영자 전용: 모든 사용자의 저장 캐릭터를 주인별로 찾아보는 읽기 전용 목록 */
export function AllCharacters() {
  const account = useAccount();
  const userId = account?.kind === 'member' ? account.userId : null;
  /** 불러온 결과와 그때의 계정 id. 계정이 바뀌면 다시 불러오는 동안 '불러오는 중'으로 본다 */
  const [fetched, setFetched] = useState<{ userId: string; load: Load } | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    fetchAllCharacters()
      .then(
        (r) =>
          alive &&
          setFetched({
            userId,
            load: { state: 'ready', list: r.characters, truncated: r.truncated },
          }),
      )
      .catch((e: unknown) => {
        if (!alive) return;
        const code = e instanceof ApiError ? e.code : '';
        const state = code === 'FORBIDDEN' || code === 'NOT_SIGNED_IN' ? 'denied' : 'error';
        setFetched({ userId, load: { state } });
      });
    return () => {
      alive = false;
    };
  }, [userId]);

  const load: Load =
    account === undefined
      ? { state: 'loading' }
      : !userId
        ? { state: 'denied' }
        : fetched?.userId === userId
          ? fetched.load
          : { state: 'loading' };

  const q = query.trim().toLowerCase();
  const shown =
    load.state !== 'ready'
      ? []
      : !q
        ? load.list
        : load.list.filter((c) =>
            [c.data.name, c.data.highConcept, c.owner?.label ?? '']
              .join(' ')
              .toLowerCase()
              .includes(q),
          );

  if (load.state === 'loading') return <SkeletonRows label="전체 캐릭터를 불러오는 중" />;
  if (load.state === 'denied')
    return (
      <p className={lobby.note}>
        <strong>운영자만 볼 수 있는 화면</strong>
        {account?.kind === 'member' ? (
          '이 계정은 운영자로 등록되어 있지 않다.'
        ) : (
          <>
            <Link href="/account/">운영자 계정으로 로그인</Link>한 뒤 다시 열기.
          </>
        )}
      </p>
    );
  if (load.state === 'error')
    return (
      <p className={lobby.note}>
        <strong>불러오지 못함</strong>연결을 확인하고 새로고침.
      </p>
    );

  const owners = new Set(load.list.map((c) => c.owner?.id)).size;
  return (
    <>
      <PasswordDesk />
      <div className={styles.bar}>
        <input
          type="search"
          className={styles.search}
          placeholder="캐릭터 이름 · 핵심 특성 · 주인으로 찾기"
          aria-label="캐릭터 찾기"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <span className={styles.count}>
          {query.trim()
            ? `${shown.length} / ${load.list.length}개`
            : `${load.list.length}개 · 사용자 ${owners}명`}
          {load.truncated && ' (최근 500개까지)'}
        </span>
      </div>
      {shown.length === 0 ? (
        <p className={lobby.note}>
          <strong>{load.list.length === 0 ? '저장된 캐릭터 없음' : '찾는 캐릭터 없음'}</strong>
        </p>
      ) : (
        <ul className={shelf.grid}>
          {shown.map((c) => (
            <li key={`${c.owner?.id}:${c.data.key}`} className={shelf.item}>
              <Sheet {...draftToForm(c.data)} saved />
              <div className={shelf.actions}>
                <span className={styles.owner} data-anon={c.owner?.anonymous || undefined}>
                  {c.owner?.label ?? '알 수 없는 사용자'}
                </span>
                <span className={shelf.date}>{savedDate(c.savedAt)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
