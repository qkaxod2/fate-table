'use client';

import { useCallback, useState } from 'react';

/**
 * 방 화면 확대·축소.
 * 무대(`main.theater`)에 CSS `zoom`을 건다. 값은 `--z`로 넘기고, 무대 안의 vh·vw 길이는
 * `calc(… / var(--z, 1))`로 나눠 써서 화면 크기에 맞춘 배치가 줌과 상관없이 화면을 꽉 채운다.
 * 휴대폰 배치(760px 이하)에서는 CSS가 줌을 1로 되돌린다.
 * 사람마다 화면이 다르니 서버가 아니라 이 브라우저에만 기억한다.
 */
export const ZOOM_STEPS = [0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2] as const;
const KEY = 'fate:room-zoom';

function readSaved(): number {
  try {
    const v = Number(localStorage.getItem(KEY));
    return (ZOOM_STEPS as readonly number[]).includes(v) ? v : 1;
  } catch {
    return 1;
  }
}

export function useRoomZoom() {
  // 방 화면은 브라우저에서만 그려지므로(주사위 연출처럼) 처음부터 저장값으로 시작한다
  const [zoom, setZoomState] = useState(readSaved);

  const setZoom = useCallback((v: number) => {
    setZoomState(v);
    try {
      if (v === 1) localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, String(v));
    } catch {
      /* 저장이 막힌 창에서는 이번 화면에서만 */
    }
  }, []);

  /** dir: -1 작게, +1 크게, 0 원래대로 */
  const step = useCallback(
    (dir: -1 | 0 | 1) => {
      if (dir === 0) return setZoom(1);
      const i = ZOOM_STEPS.findIndex((s) => s >= zoom);
      const next = ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, Math.max(0, i + dir))]!;
      setZoom(next);
    },
    [zoom, setZoom],
  );

  return { zoom, step };
}

/** 줌이 걸린 요소 안에서 화면 픽셀(clientX·innerHeight)을 요소 안 CSS 픽셀로 바꿀 때 나눌 값 */
export function zoomOf(el: Element | null | undefined): number {
  const z = (el as (Element & { currentCSSZoom?: number }) | null)?.currentCSSZoom;
  return typeof z === 'number' && z > 0 ? z : 1;
}
