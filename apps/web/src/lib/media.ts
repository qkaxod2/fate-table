import { useSyncExternalStore } from 'react';

/** CSS 미디어 쿼리가 맞는지 (창 크기가 바뀌면 다시 그린다) */
export function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (fn) => {
      const m = window.matchMedia(query);
      m.addEventListener('change', fn);
      return () => m.removeEventListener('change', fn);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** 무대가 위, 책이 아래로 쌓이는 좁은 화면 (book.module.css와 같은 경계) */
export const NARROW = '(max-width: 1100px)';
