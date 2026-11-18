import { callFunction } from './api';
import type { CharacterDraft } from './myCharacters';

/** 운영자 화면: 모든 사용자의 저장 캐릭터 (읽기 전용) */
export interface AdminCharacter {
  owner: { id: string; label: string; anonymous: boolean } | undefined;
  data: CharacterDraft;
  savedAt: string;
}

/** 지금 로그인한 계정이 사이트 운영자인지 (서버의 site_admins 표로 확인한다) */
export async function checkSiteAdmin(): Promise<boolean> {
  try {
    const r = await callFunction<{ admin: boolean }>('admin-characters', { check: true });
    return r.admin;
  } catch {
    return false;
  }
}

export function fetchAllCharacters(): Promise<{
  characters: AdminCharacter[];
  truncated: boolean;
}> {
  return callFunction('admin-characters', {});
}

/** 운영자가 친구 계정의 비밀번호를 바로 바꿔 준다 (메일 서버 없이) */
export async function setUserPassword(email: string, password: string): Promise<void> {
  await callFunction('admin-characters', { setPassword: { email, password } });
}
