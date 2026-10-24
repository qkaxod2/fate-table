'use client';

import Link from 'next/link';
import { useAccount } from '@/lib/account';
import styles from './AccountChip.module.css';

/** 화면 귀퉁이의 계정 바로가기. 서버가 없는 체험 빌드에서는 보이지 않는다. */
export function AccountChip() {
  const account = useAccount();
  if (!account) return null;
  const label =
    account.kind === 'member' ? account.nickname || account.email.split('@')[0] : '로그인';
  return (
    <Link href="/account/" className={styles.chip} data-member={account.kind === 'member'}>
      {label}
    </Link>
  );
}
