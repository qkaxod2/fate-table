'use client';

import Link from 'next/link';
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
      setError(err instanceof ApiError ? err.message : '방을 만들지 못했어요.');
      setBusy(false);
    }
  }

  return (
    <main className={styles.main}>
      <div className={styles.card}>
        <Link href="/" className={styles.back}>
          ← 처음으로
        </Link>
        <h1 className={styles.title}>방 만들기</h1>
        <p className={styles.lead}>
          방을 만든 사람이 GM이 돼요. 만들고 나면 초대 링크를 나눠 주세요.
        </p>
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
              required
            />
          </label>
          {error && <p className={styles.error}>{error}</p>}
          {!online && (
            <p className={styles.muted}>서버가 연결된 배포 사이트에서만 방을 만들 수 있어요.</p>
          )}
          <button
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
