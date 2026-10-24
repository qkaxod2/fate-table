'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  type Account,
  AccountError,
  type AuthOptions,
  continueWithGoogle,
  finishRedirect,
  loadAuthOptions,
  redirectError,
  setAccountNickname,
  setPassword,
  signIn,
  signOut,
  signUp,
  useAccount,
} from '@/lib/account';
import styles from '../rooms/lobby.module.css';
import own from './account.module.css';

type Notice = { tone: 'ok' | 'error'; text: string; retryGoogle?: boolean };

const errorText = (e: unknown) =>
  e instanceof AccountError ? e.message : '잠시 문제가 있었어요. 다시 시도해 주세요.';

const moved = (rooms: number) =>
  rooms > 0 ? ` 이 브라우저에서 쓰던 방 ${rooms}개도 계정으로 옮겼어요.` : '';

export function AccountPanel() {
  const account = useAccount();
  const [options, setOptions] = useState<AuthOptions | null>(null);
  // 구글·메일 링크에서 돌아왔을 때의 오류는 Supabase가 주소를 정리하기 전에 읽어 둔다
  const [notice, setNotice] = useState<Notice | null>(() => {
    const err = redirectError();
    if (!err) return null;
    return {
      tone: 'error',
      text:
        err.code === 'identity_already_exists'
          ? `${err.message} 그 계정으로 로그인하면 지금 기록을 그쪽으로 옮겨 드려요.`
          : err.message,
      retryGoogle: err.code === 'identity_already_exists',
    };
  });

  useEffect(() => {
    void loadAuthOptions().then(setOptions);
    finishRedirect()
      .then((rooms) => {
        if (rooms !== null) setNotice({ tone: 'ok', text: `로그인했어요.${moved(rooms)}` });
      })
      .catch((e: unknown) => setNotice({ tone: 'error', text: errorText(e) }));
  }, []);

  return (
    <main className={styles.main}>
      <div className={styles.card}>
        <Link href="/" className={styles.back}>
          ← 처음으로
        </Link>
        <h1 className={styles.title}>계정</h1>
        {notice && (
          <div className={notice.tone === 'ok' ? own.ok : own.notice} role="status">
            <p>{notice.text}</p>
            {notice.retryGoogle && (
              <button
                type="button"
                className={own.google}
                onClick={() =>
                  continueWithGoogle(false).catch((e: unknown) =>
                    setNotice({ tone: 'error', text: errorText(e) }),
                  )
                }
              >
                그 구글 계정으로 로그인
              </button>
            )}
          </div>
        )}
        {account === undefined && <p className={styles.lead}>계정을 확인하는 중…</p>}
        {account === null && (
          <p className={styles.lead}>서버가 연결된 배포 사이트에서만 계정을 쓸 수 있어요.</p>
        )}
        {account && account.kind !== 'member' && (
          <SignInForms account={account} options={options} onNotice={setNotice} />
        )}
        {account?.kind === 'member' && <Profile account={account} onNotice={setNotice} />}
      </div>
    </main>
  );
}

function SignInForms({
  account,
  options,
  onNotice,
}: {
  account: Account;
  options: AuthOptions | null;
  onNotice: (n: Notice | null) => void;
}) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPw] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    onNotice(null);
    try {
      if (mode === 'signin') {
        const rooms = await signIn(email.trim(), password);
        onNotice({ tone: 'ok', text: `로그인했어요.${moved(rooms)}` });
      } else {
        const r = await signUp(email.trim(), password);
        onNotice(
          r === 'done'
            ? {
                tone: 'ok',
                text: '계정을 만들었어요. 이제 어느 기기에서든 같은 방에 들어갈 수 있어요.',
              }
            : {
                tone: 'ok',
                text: `${email.trim()}로 확인 메일을 보냈어요. 링크를 누르면 이 화면으로 돌아와요.`,
              },
        );
      }
    } catch (err) {
      onNotice({ tone: 'error', text: errorText(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <p className={styles.lead}>
        로그인하면 내가 들어간 방과 만든 캐릭터가 다른 기기에서도 그대로 보여요.
        {account.kind === 'anonymous' && ' 지금 이 브라우저에서 쓰던 기록도 계정으로 옮겨져요.'}
      </p>
      <div className={own.tabs} role="tablist">
        {(['signin', 'signup'] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            className={own.tab}
            onClick={() => setMode(m)}
          >
            {m === 'signin' ? '로그인' : '계정 만들기'}
          </button>
        ))}
      </div>
      <form className={styles.form} onSubmit={submit}>
        <label className={styles.field}>
          이메일
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label className={styles.field}>
          비밀번호
          <input
            type="password"
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            minLength={mode === 'signup' ? 8 : undefined}
            value={password}
            onChange={(e) => setPw(e.target.value)}
            required
          />
        </label>
        {mode === 'signup' && <p className={styles.muted}>비밀번호는 8자 이상이에요.</p>}
        <button
          type="submit"
          className={styles.primary}
          disabled={busy || !email.trim() || !password}
        >
          {busy ? '잠시만요…' : mode === 'signin' ? '로그인' : '계정 만들기'}
        </button>
      </form>
      {options?.google && (
        <>
          <p className={own.or}>또는</p>
          <button
            type="button"
            className={own.google}
            onClick={() =>
              continueWithGoogle().catch((e: unknown) =>
                onNotice({ tone: 'error', text: errorText(e) }),
              )
            }
          >
            구글로 계속하기
          </button>
        </>
      )}
    </>
  );
}

function Profile({
  account,
  onNotice,
}: {
  account: Extract<Account, { kind: 'member' }>;
  onNotice: (n: Notice | null) => void;
}) {
  const [nickname, setNick] = useState(account.nickname);
  const [password, setPw] = useState('');
  const [busy, setBusy] = useState(false);

  async function run(job: () => Promise<void>, done: string) {
    if (busy) return;
    setBusy(true);
    onNotice(null);
    try {
      await job();
      onNotice({ tone: 'ok', text: done });
    } catch (e) {
      onNotice({ tone: 'error', text: errorText(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <p className={styles.lead}>
        <b className={own.email}>{account.email}</b>
        <br />
        {account.providers.includes('google') ? '구글 계정으로 로그인했어요.' : '로그인했어요.'}
      </p>

      {account.needsPassword && (
        <form
          className={styles.form}
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await setPassword(password);
              setPw('');
            }, '비밀번호를 정했어요. 다른 기기에서는 이메일과 이 비밀번호로 로그인해요.');
          }}
        >
          <label className={styles.field}>
            비밀번호 정하기
            <input
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={password}
              onChange={(e) => setPw(e.target.value)}
              required
            />
          </label>
          <button type="submit" className={styles.primary} disabled={busy || password.length < 8}>
            비밀번호 저장
          </button>
        </form>
      )}

      <form
        className={`${styles.form} ${own.section}`}
        onSubmit={(e) => {
          e.preventDefault();
          void run(() => setAccountNickname(nickname.trim()), '닉네임을 저장했어요.');
        }}
      >
        <label className={styles.field}>
          기본 닉네임
          <input
            value={nickname}
            onChange={(e) => setNick(e.target.value)}
            maxLength={30}
            placeholder="방에 들어갈 때 미리 채워져요"
          />
        </label>
        <button
          type="submit"
          className={own.secondary}
          disabled={busy || nickname.trim() === account.nickname}
        >
          닉네임 저장
        </button>
      </form>

      <div className={styles.links}>
        <Link href="/rooms/">내 방</Link>
        <Link href="/create/">캐릭터 만들기</Link>
        <button
          type="button"
          className={own.signOut}
          disabled={busy}
          onClick={() => void run(signOut, '로그아웃했어요.')}
        >
          로그아웃
        </button>
      </div>
    </>
  );
}
