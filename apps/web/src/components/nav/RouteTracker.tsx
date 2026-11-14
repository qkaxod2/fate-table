'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { markRoute } from './history';

/** 화면(경로)이 바뀔 때마다 기록 깊이를 적는다. 그리는 것은 없다 */
export function RouteTracker() {
  const pathname = usePathname();
  useEffect(() => {
    markRoute();
  }, [pathname]);
  return null;
}
