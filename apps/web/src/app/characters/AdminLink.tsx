'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAccount } from '@/lib/account';
import { checkSiteAdmin } from '@/lib/adminCharacters';
import styles from './characters.module.css';

/** 운영자 계정에만 보이는 "전체 캐릭터" 길. 정식 계정일 때만 서버에 물어본다 */
export function AdminLink() {
  const account = useAccount();
  /** 운영자로 확인된 계정 id. 다른 계정으로 바뀌면 저절로 숨는다 */
  const [adminId, setAdminId] = useState<string | null>(null);
  const userId = account?.kind === 'member' ? account.userId : null;
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    void checkSiteAdmin().then((v) => alive && v && setAdminId(userId));
    return () => {
      alive = false;
    };
  }, [userId]);
  if (!userId || adminId !== userId) return null;
  return (
    <Link href="/admin/characters/" className={styles.edit}>
      전체 캐릭터 (운영자)
    </Link>
  );
}
