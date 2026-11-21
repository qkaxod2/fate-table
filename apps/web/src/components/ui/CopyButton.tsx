'use client';

import { useEffect, useRef, useState } from 'react';
import { copyText } from '@/lib/sheetText';

/**
 * 누르면 글을 클립보드에 넣고, 잠깐 「복사됨」(못 하면 「복사 못 함」)으로 바뀌는 버튼.
 * 알림 상자가 없는 화면에서도 쓸 수 있게 결과를 버튼 글자로 알린다.
 */
export function CopyButton({
  getText,
  className,
  label = '복사',
  title,
}: {
  /** 누르는 순간의 글 (시트가 바뀌어도 늘 지금 것을 복사한다) */
  getText: () => string;
  className?: string;
  label?: string;
  title?: string;
}) {
  const [done, setDone] = useState<'ok' | 'fail' | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function copy() {
    const ok = await copyText(getText());
    setDone(ok ? 'ok' : 'fail');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setDone(null), 1800);
  }

  return (
    <button
      type="button"
      className={className}
      title={title}
      data-done={done ?? undefined}
      onClick={() => void copy()}
    >
      <span aria-live="polite">
        {done === 'ok' ? '복사됨' : done === 'fail' ? '복사 못 함' : label}
      </span>
    </button>
  );
}
