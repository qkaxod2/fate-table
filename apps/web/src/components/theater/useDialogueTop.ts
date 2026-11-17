'use client';

import { useEffect, useRef } from 'react';

/**
 * 대사창 윗변의 높이를 무대(`main`)의 `--dlg`에 적어 둔다.
 * 이름표와 스탠딩은 이 값 위에 서므로, 대사창이 커져도(입력 줄, 접근법 고르기) 가려지지 않는다.
 * 지난 이야기를 펼쳤을 때는 잠깐 덮는 것이라 값을 바꾸지 않는다.
 */
export function useDialogueTop<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    const stage = el?.parentElement;
    if (!el || !stage) return;
    const write = () => {
      if (el.hasAttribute('data-log')) return;
      // 화면 아래에서 띄운 간격(bottom)까지 더한다
      const gap = parseFloat(getComputedStyle(el).bottom) || 0;
      stage.style.setProperty('--dlg', `${Math.round(el.offsetHeight + gap)}px`);
    };
    write();
    const ro = new ResizeObserver(write);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return ref;
}
