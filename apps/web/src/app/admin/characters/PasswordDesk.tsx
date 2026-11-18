'use client';

import { useState } from 'react';
import { setUserPassword } from '@/lib/adminCharacters';
import { ApiError } from '@/lib/api';
import lobby from '../../rooms/lobby.module.css';
import styles from './admin.module.css';

/**
 * 운영자가 친구 계정의 비밀번호를 바로 바꿔 준다. 메일 서버를 쓰지 않는 대신,
 * 비밀번호를 잊은 친구가 운영자에게 말하면 여기서 새 비밀번호를 정해 알려 준다.
 */
export function PasswordDesk() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      await setUserPassword(email.trim(), password);
      setNotice({
        ok: true,
        text: `${email.trim()} 비밀번호를 바꿈. 새 비밀번호를 친구에게 알려 주기.`,
      });
      setPassword('');
    } catch (err) {
      setNotice({
        ok: false,
        text: err instanceof ApiError ? err.message : '바꾸지 못함. 다시 시도',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className={styles.desk}>
      <summary>친구 비밀번호 바꿔 주기</summary>
      <form className={styles.deskForm} onSubmit={submit}>
        <label className={lobby.field}>
          이메일
          <input
            type="email"
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label className={lobby.field}>
          새 비밀번호 (8자 이상)
          <input
            type="text"
            autoComplete="off"
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        <button
          type="submit"
          className={lobby.primary}
          disabled={busy || !email.trim() || password.length < 8}
        >
          {busy ? '바꾸는 중…' : '비밀번호 바꾸기'}
        </button>
        {notice && (
          <p className={notice.ok ? styles.deskOk : styles.deskError} role="status">
            {notice.text}
          </p>
        )}
      </form>
    </details>
  );
}
