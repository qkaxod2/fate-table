'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { SkeletonRows } from '@/components/ui/Loading';
import { toast, Toaster } from '@/components/ui/Toast';
import { useAccount } from '@/lib/account';
import {
  type CharacterDraft,
  copyMyCharacter,
  deleteMyCharacter,
  listMyCharacters,
} from '@/lib/myCharacters';
import lobby from '../rooms/lobby.module.css';
import { draftToForm, Sheet } from '../create/Sheet';
import styles from './characters.module.css';

const savedDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}. 저장`;
};

/** 저장한 캐릭터시트 목록: 고치기 · 사본 만들기 · 지우기 */
export function CharacterShelf() {
  const account = useAccount();
  const [list, setList] = useState<CharacterDraft[] | null>(null);
  /** 지우기를 한 번 누른 카드. 같은 자리에서 한 번 더 눌러야 지운다 */
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void listMyCharacters().then((l) => alive && setList(l));
    return () => {
      alive = false;
    };
    // 로그인 상태가 바뀌면 계정 보관함을 다시 읽는다
  }, [account?.kind]);

  async function remove(c: CharacterDraft) {
    if (busy) return;
    setBusy(c.key);
    try {
      await deleteMyCharacter(c.key);
      setList((l) => l?.filter((x) => x.key !== c.key) ?? null);
      setConfirming(null);
    } catch {
      toast({ text: '지우지 못함. 연결을 확인하고 다시 시도', tone: 'error', key: 'characters' });
    } finally {
      setBusy(null);
    }
  }

  function copy(c: CharacterDraft) {
    const made = copyMyCharacter(c);
    setList((l) => [made, ...(l ?? [])]);
    toast({ text: `「${made.name}」 저장됨`, key: 'characters' });
  }

  if (list === null) return <SkeletonRows label="캐릭터 목록을 불러오는 중" />;

  return (
    <>
      <Toaster />
      {list.length === 0 ? (
        <p className={lobby.note}>
          <strong>아직 저장한 캐릭터 없음</strong>
          <Link href="/create/">캐릭터 만들기</Link>에서 저장하면 여기에 모이고, 어느 방에서든
          불러올 수 있다.
        </p>
      ) : (
        <ul className={styles.grid}>
          {list.map((c) => {
            const f = draftToForm(c);
            const asking = confirming === c.key;
            return (
              <li key={c.key} className={styles.item}>
                <Sheet {...f} saved />
                <div className={styles.actions} data-asking={asking || undefined}>
                  {asking ? (
                    <>
                      <span className={styles.warn} id={`del-${c.key}`}>
                        지우면 되돌릴 수 없음. 방에 데려간 캐릭터는 남는다
                      </span>
                      <button
                        type="button"
                        className={styles.danger}
                        aria-describedby={`del-${c.key}`}
                        disabled={busy !== null}
                        aria-busy={busy === c.key || undefined}
                        onClick={() => void remove(c)}
                      >
                        {busy === c.key ? '지우는 중…' : `${c.name} 지우기`}
                      </button>
                      <button
                        type="button"
                        className={styles.quiet}
                        disabled={busy !== null}
                        onClick={() => setConfirming(null)}
                      >
                        그만두기
                      </button>
                    </>
                  ) : (
                    <>
                      <Link
                        href={`/create/?edit=${encodeURIComponent(c.key)}`}
                        className={styles.edit}
                      >
                        고치기
                      </Link>
                      <button type="button" className={styles.quiet} onClick={() => copy(c)}>
                        사본 만들기
                      </button>
                      <button
                        type="button"
                        className={styles.quiet}
                        onClick={() => setConfirming(c.key)}
                      >
                        지우기
                      </button>
                      <span className={styles.date}>{savedDate(c.savedAt)}</span>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {account && account.kind !== 'member' && (
        <p className={lobby.muted}>
          지금 목록은 이 기기에만 있다. <Link href="/account/">로그인</Link>하면 다른 기기의
          방에서도 불러온다.
        </p>
      )}
      {account === null && list.length > 0 && (
        <p className={lobby.muted}>
          이 브라우저에만 저장됨. 브라우저 데이터를 지우면 함께 사라진다.
        </p>
      )}
    </>
  );
}
