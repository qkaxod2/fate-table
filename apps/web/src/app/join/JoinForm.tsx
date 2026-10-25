'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { ApiError, callFunction } from '@/lib/api';
import { loadNickname, rememberRoom, roomHref, saveNickname } from '@/lib/lobby';
import { getSupabase } from '@/lib/supabase';
import styles from '../rooms/lobby.module.css';

export function JoinForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [code, setCode] = useState(params.get('code') ?? '');
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
      const r = await callFunction<{ roomId: string; role: string }>('join', {
        code: code.trim(),
        nickname: nickname.trim(),
      });
      saveNickname(nickname.trim());
      rememberRoom({ id: r.roomId, name: code.trim().toUpperCase(), role: r.role });
      router.push(roomHref(r.roomId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '들어가지 못했어요.');
      setBusy(false);
    }
  }

  return (
    <main className={styles.main}>
      <div className={styles.card}>
        <Link href="/" className={styles.back}>
          ← 처음으로
        </Link>
        <h1 className={styles.title}>방 참가</h1>
        <p className={styles.lead}>GM에게 받은 초대 코드와 이 방에서 쓸 닉네임을 적어 주세요.</p>
        <form className={styles.form} onSubmit={submit}>
          <label className={styles.field}>
            초대 코드
            <input
              className={styles.code}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              maxLength={8}
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
          <button
            aria-busy={busy || undefined}
            type="submit"
            className={styles.primary}
            disabled={busy || !online || !code.trim() || !nickname.trim()}
          >
            {busy ? '들어가는 중…' : '들어가기'}
          </button>
        </form>
      </div>
    </main>
  );
}
