'use client';

import Link from 'next/link';
import { PageNav } from '@/components/nav/PageNav';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ApiError, callFunction } from '@/lib/api';
import { loadNickname, rememberRoom, roomHref, saveNickname } from '@/lib/lobby';
import { getSupabase } from '@/lib/supabase';
import styles from '../lobby.module.css';

export function NewRoomForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [nickname, setNickname] = useState(loadNickname);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const online = getSupabase() !== null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await callFunction<{ roomId: string }>('rooms', {
        name: name.trim(),
        nickname: nickname.trim(),
      });
      saveNickname(nickname.trim());
      rememberRoom({ id: r.roomId, name: name.trim(), role: 'gm' });
      router.push(roomHref(r.roomId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '방을 만들지 못했다. 잠시 뒤 다시 시도');
      setBusy(false);
    }
  }

  return (
    <main className={styles.main}>
      <div className={styles.card}>
        <PageNav />
        <h1 className={styles.title}>방 만들기</h1>
        <p className={styles.lead}>
          방을 만든 사람이 GM. 만든 뒤 초대 링크를 일행에게 보내면 된다.
        </p>
        {!online && (
          <p className={styles.note}>
            <strong>지금은 방을 만들 수 없음</strong>
            서버가 연결된 배포 사이트에서만 방을 열 수 있다. 여기서는{' '}
            <Link href="/tutorial/">튜토리얼</Link>과 <Link href="/create/">캐릭터 만들기</Link>를
            바로 해 볼 수 있다.
          </p>
        )}
        <form className={styles.form} onSubmit={submit}>
          <label className={styles.field}>
            방 이름
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              placeholder="예: 금요일 밤의 모험"
              required
            />
          </label>
          <label className={styles.field}>
            내 닉네임
            <input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              maxLength={30}
              placeholder="방에서 불릴 이름"
              required
            />
          </label>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          <button
            aria-busy={busy || undefined}
            type="submit"
            className={styles.primary}
            disabled={busy || !online || !name.trim() || !nickname.trim()}
          >
            {busy ? '만드는 중…' : '방 만들기'}
          </button>
        </form>
      </div>
    </main>
  );
}
