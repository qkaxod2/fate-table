'use client';

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

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

/** 휠 한 칸(마우스 휠은 보통 100)을 이만큼 모아야 한 단계 움직인다. 트랙패드의 잔 움직임은 모아서 센다 */
const WHEEL_NOTCH = 60;

/**
 * 휠로 방 화면 크기 조절.
 * - Ctrl(맥은 ⌘)+휠, 트랙패드 두 손가락 집기: 방 어디서든. 브라우저 자체 확대 대신 방 화면만 바꾼다.
 * - 그냥 휠: 장면 그림 위처럼 굴릴 것이 없는 곳에서만. 이야기 기록·창처럼 스크롤되는 곳 위에서는 원래대로 스크롤한다.
 * 휴대폰 배치(줌을 안 쓰는 화면)에서는 아무것도 하지 않는다.
 */
export function useWheelZoom(target: RefObject<HTMLElement | null>, step: (dir: -1 | 1) => void) {
  const stepRef = useRef(step);
  useEffect(() => {
    stepRef.current = step;
  }, [step]);

  useEffect(() => {
    const el = target.current;
    if (!el) return;
    let acc = 0;
    let lastAt = 0;
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY === 0 || window.matchMedia('(max-width: 760px)').matches) return;
      const withKey = e.ctrlKey || e.metaKey;
      if (!withKey && (e.shiftKey || e.altKey || scrollsInside(e.target, el, e.deltaY))) return;
      e.preventDefault();
      // 잠깐 멈췄다 다시 굴리면 새로 센다
      if (e.timeStamp - lastAt > 300) acc = 0;
      lastAt = e.timeStamp;
      // 줄 단위(파이어폭스)는 픽셀로 바꿔 센다
      acc += e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
      if (Math.abs(acc) < WHEEL_NOTCH) return;
      stepRef.current(acc < 0 ? 1 : -1);
      acc = 0;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [target]);
}

/** 휠을 굴린 곳에서 무대까지 올라가며, 그 방향으로 더 스크롤할 수 있는 칸이 있는지 */
function scrollsInside(from: EventTarget | null, stage: HTMLElement, dy: number): boolean {
  for (let n = from instanceof Element ? from : null; n && n !== stage; n = n.parentElement) {
    // 열린 창·고르기 줄 같은 입력 칸 위에서는 휠을 빼앗지 않는다
    if (n.matches('input, textarea, select, [role="dialog"], dialog')) return true;
    if (n.scrollHeight <= n.clientHeight + 1) continue;
    const oy = getComputedStyle(n).overflowY;
    if (oy !== 'auto' && oy !== 'scroll') continue;
    // 스크롤할 수 있는 칸 위면 끝에 닿았어도 줌으로 넘기지 않는다 (기록을 읽다 갑자기 커지지 않게)
    return true;
  }
  return false;
}

/** 줌이 걸린 요소 안에서 화면 픽셀(clientX·innerHeight)을 요소 안 CSS 픽셀로 바꿀 때 나눌 값 */
export function zoomOf(el: Element | null | undefined): number {
  const z = (el as (Element & { currentCSSZoom?: number }) | null)?.currentCSSZoom;
  return typeof z === 'number' && z > 0 ? z : 1;
}
