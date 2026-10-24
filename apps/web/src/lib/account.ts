import type { AuthError, Session, SupabaseClient } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { callFunction } from './api';
import { asset } from './asset';
import { saveNickname } from './lobby';
import { uploadLocalCharacters } from './myCharacters';
import { getSupabase } from './supabase';

/**
 * 계정. 처음에는 익명 세션으로 시작하고, 이메일이나 구글을 연결하면 같은 user id 그대로
 * 정식 계정이 된다(방·캐릭터가 그대로 따라온다). 이미 계정이 있는 사람이 익명으로 쓰던
 * 브라우저에서 로그인하면, 익명 쪽 기록을 서버(account 함수)에서 계정으로 옮긴다.
 */
export type Account =
  | { kind: 'none' }
  | { kind: 'anonymous'; userId: string }
  | {
      kind: 'member';
      userId: string;
      email: string;
      nickname: string;
      providers: string[];
      /** 이메일 확인을 거쳐 연결해서 아직 비밀번호가 없다 */
      needsPassword: boolean;
    };

/** 로그인 전에 쓰던 익명 세션. 구글처럼 페이지를 떠나는 로그인은 돌아와서 옮긴다. */
const PENDING_MERGE = 'fate.pendingMerge';

export function accountOf(session: Session | null): Account {
  const user = session?.user;
  if (!user) return { kind: 'none' };
  if (user.is_anonymous) return { kind: 'anonymous', userId: user.id };
  const providers = (user.identities ?? []).map((i) => i.provider);
  return {
    kind: 'member',
    userId: user.id,
    email: user.email ?? '',
    nickname: String(user.user_metadata.nickname ?? ''),
    providers,
    needsPassword:
      providers.length === 1 &&
      providers[0] === 'email' &&
      user.user_metadata.has_password !== true,
  };
}

/** 지금 계정 상태. 로그인·로그아웃하면 다시 그린다. 서버가 없으면 null. */
export function useAccount(): Account | null | undefined {
  const [account, setAccount] = useState<Account | null | undefined>(() =>
    getSupabase() ? undefined : null,
  );
  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    let alive = true;
    void sb.auth.getSession().then(({ data }) => alive && setAccount(accountOf(data.session)));
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => {
      if (alive) setAccount(accountOf(session));
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);
  return account;
}

export interface AuthOptions {
  google: boolean;
  /** 가입하면 확인 메일 없이 바로 쓸 수 있다 */
  instant: boolean;
}

/** 서버에서 켜 둔 로그인 방법 (구글 버튼은 켜져 있을 때만 보인다) */
export async function loadAuthOptions(): Promise<AuthOptions> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return { google: false, instant: true };
  try {
    const res = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } });
    const s = (await res.json()) as {
      external?: { google?: boolean };
      mailer_autoconfirm?: boolean;
    };
    return { google: s.external?.google === true, instant: s.mailer_autoconfirm !== false };
  } catch {
    return { google: false, instant: true };
  }
}

/** 메일 확인·구글 로그인 뒤 돌아올 주소 */
export function accountUrl(): string {
  return `${window.location.origin}${asset('/account/')}`;
}

const MESSAGES: Record<string, string> = {
  invalid_credentials: '이메일이나 비밀번호가 맞지 않아요.',
  email_exists: '이미 계정이 있는 이메일이에요. 로그인으로 들어와 주세요.',
  user_already_exists: '이미 계정이 있는 이메일이에요. 로그인으로 들어와 주세요.',
  weak_password: '비밀번호를 8자 이상으로 정해 주세요.',
  email_address_invalid: '이메일 주소를 다시 확인해 주세요.',
  validation_failed: '이메일 주소를 다시 확인해 주세요.',
  email_not_confirmed: '메일함에서 확인 링크를 먼저 눌러 주세요.',
  over_email_send_rate_limit: '메일을 너무 자주 보냈어요. 잠시 뒤 다시 시도해 주세요.',
  over_request_rate_limit: '요청이 너무 많아요. 잠시 뒤 다시 시도해 주세요.',
  identity_already_exists: '이 구글 계정은 이미 다른 계정에 연결되어 있어요.',
  provider_disabled: '아직 켜지지 않은 로그인 방법이에요.',
  signup_disabled: '지금은 새 계정을 만들 수 없어요.',
  same_password: '지금 쓰는 비밀번호와 같아요.',
};

export class AccountError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function fail(error: AuthError | { code?: string; message?: string }): never {
  const code = error.code ?? '';
  throw new AccountError(code, MESSAGES[code] ?? '잠시 문제가 있었어요. 다시 시도해 주세요.');
}

function need(): SupabaseClient {
  const sb = getSupabase();
  if (!sb) throw new AccountError('OFFLINE', '아직 서버가 연결되지 않았어요.');
  return sb;
}

async function anonymousToken(sb: SupabaseClient): Promise<string | null> {
  const { data } = await sb.auth.getSession();
  return data.session?.user.is_anonymous ? data.session.access_token : null;
}

/** 로그인한 뒤 할 일: 익명 기록 옮기기, 이 브라우저의 캐릭터 올리기, 닉네임 가져오기 */
async function afterSignIn(sb: SupabaseClient, anonToken: string | null): Promise<number> {
  let rooms = 0;
  if (anonToken) {
    // 옮기지 못해도 로그인은 된 것이니 막지 않는다 (익명 쪽 기록은 서버에 그대로 남는다)
    rooms = await callFunction<{ rooms: number }>('account', { anonToken })
      .then((r) => r.rooms)
      .catch(() => 0);
  }
  await uploadLocalCharacters(sb);
  const { data } = await sb.auth.getUser();
  const nick = String(data.user?.user_metadata.nickname ?? '');
  if (nick) saveNickname(nick);
  return rooms;
}

export type SignUpResult = 'done' | 'check-email';

/**
 * 계정 만들기. 익명으로 쓰던 중이면 그 사용자에 이메일을 붙여서 정식 계정으로 바꾼다.
 * 익명 사용자는 이메일이 확정된 뒤에만 비밀번호를 정할 수 있어서, 확인 메일이 필요한 설정이면
 * 링크를 누르고 돌아온 계정 화면에서 비밀번호를 정한다.
 */
export async function signUp(email: string, password: string): Promise<SignUpResult> {
  const sb = need();
  const { data: cur } = await sb.auth.getSession();
  if (cur.session?.user.is_anonymous) {
    const { data, error } = await sb.auth.updateUser({ email }, { emailRedirectTo: accountUrl() });
    if (error) fail(error);
    if (data.user.email !== email) return 'check-email';
    const { error: pwError } = await sb.auth.updateUser({
      password,
      data: { has_password: true },
    });
    if (pwError) fail(pwError);
  } else {
    const { data, error } = await sb.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: accountUrl(), data: { has_password: true } },
    });
    if (error) fail(error);
    if (!data.session) return 'check-email';
  }
  await afterSignIn(sb, null);
  return 'done';
}

/** 로그인. 옮겨 온 방 수를 돌려준다. */
export async function signIn(email: string, password: string): Promise<number> {
  const sb = need();
  const anonToken = await anonymousToken(sb);
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) fail(error);
  return afterSignIn(sb, anonToken);
}

/**
 * 구글로 계속하기. 익명이면 먼저 지금 사용자에 구글을 연결해 보고(같은 id 유지),
 * 연결을 못 하면 그냥 로그인하고 돌아와서 익명 기록을 옮긴다.
 */
export async function continueWithGoogle(link = true): Promise<void> {
  const sb = need();
  const redirectTo = accountUrl();
  const anonToken = await anonymousToken(sb);
  if (anonToken && link) {
    const { error } = await sb.auth.linkIdentity({ provider: 'google', options: { redirectTo } });
    if (!error) return;
  }
  try {
    if (anonToken) localStorage.setItem(PENDING_MERGE, anonToken);
  } catch {
    // 저장소를 못 쓰면 옮기기만 건너뛴다
  }
  const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
  if (error) fail(error);
}

/** 주소에 실려 온 로그인 오류 (구글·메일 링크에서 돌아왔을 때) */
export function redirectError(): { code: string; message: string } | null {
  const params = new URLSearchParams(
    `${window.location.search.slice(1)}&${window.location.hash.slice(1)}`,
  );
  const code = params.get('error_code') ?? params.get('error');
  if (!code) return null;
  return {
    code,
    message: MESSAGES[code] ?? params.get('error_description') ?? '로그인하지 못했어요.',
  };
}

/** 구글 로그인으로 돌아왔으면 남겨 둔 익명 기록을 옮긴다. 옮긴 방 수, 할 일이 없으면 null. */
export async function finishRedirect(): Promise<number | null> {
  const sb = getSupabase();
  if (!sb) return null;
  let token: string | null = null;
  try {
    token = localStorage.getItem(PENDING_MERGE);
  } catch {
    return null;
  }
  const { data } = await sb.auth.getSession();
  if (!data.session || data.session.user.is_anonymous) return null;
  try {
    localStorage.removeItem(PENDING_MERGE);
  } catch {
    // 무시
  }
  return afterSignIn(sb, token);
}

export async function setPassword(password: string): Promise<void> {
  const { error } = await need().auth.updateUser({ password, data: { has_password: true } });
  if (error) fail(error);
}

export async function setAccountNickname(nickname: string): Promise<void> {
  const { error } = await need().auth.updateUser({ data: { nickname } });
  if (error) fail(error);
  saveNickname(nickname);
}

/** 로그아웃. 이 브라우저에 남은 캐릭터·방 기록은 계정에 올라가 있으니 함께 지운다. */
export async function signOut(): Promise<void> {
  const sb = need();
  await uploadLocalCharacters(sb).catch(() => undefined);
  await sb.auth.signOut();
  try {
    for (const k of ['fate.myCharacters', 'fate.myRooms', 'fate.nickname', PENDING_MERGE])
      localStorage.removeItem(k);
  } catch {
    // 무시
  }
}
