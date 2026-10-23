'use client';

import { useSyncExternalStore, type ReactNode } from 'react';

const noop = () => () => {};

/** 브라우저 저장소를 읽는 화면을 정적 HTML과 어긋나지 않게 브라우저에서만 그린다 */
export function ClientOnly({
  children,
  fallback = null,
}: {
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const mounted = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
  return mounted ? children : fallback;
}
