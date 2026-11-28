'use client';

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

/**
 * 장면 필드 카메라.
 * 장면(배경 그림 · 장면 특성)은 UI 밑에 따로 떠 있는 필드이고, 이 카메라로 그 필드만 당기고 민다.
 * 대사창 · 이름표 · 도구 · 스탠딩 같은 UI는 그대로 둔다.
 * - 휠: 커서가 가리키는 곳을 중심으로 확대·축소 (스크롤되는 칸 · 입력 칸 위에서는 원래대로 스크롤)
 * - 빈 장면을 끌기: 필드 이동
 * - 빈 장면을 두 번 누르기 · 원래대로 단추: 처음 자리로
 * 무대(`main`)에 --cam-x, --cam-y, --cam-z를 적고, CSS(RoomTheater.module.css의 .field)가 필드에 건다.
 * 휴대폰 배치(760px 이하)에서는 쓰지 않는다.
 */
export const CAM_MIN = 0.4;
export const CAM_MAX = 3;

export type Camera = { x: number; y: number; z: number };
const HOME: Camera = { x: 0, y: 0, z: 1 };

const phone = () => window.matchMedia('(max-width: 760px)').matches;

/** 필드가 화면 밖으로 다 나가 버리지 않게: 필드 가운데가 화면 안에 머문다 */
function clampCam(c: Camera, w: number, h: number): Camera {
  const z = Math.min(CAM_MAX, Math.max(CAM_MIN, c.z));
  const mx = (w * Math.max(z, 1)) / 2;
  const my = (h * Math.max(z, 1)) / 2;
  return {
    z,
    x: Math.min(mx, Math.max(-mx, c.x)),
    y: Math.min(my, Math.max(-my, c.y)),
  };
}

/** 줌의 기준점(필드 transform-origin)의 화면 좌표: 대사창 위 공간의 가운데 */
function originOf(stage: HTMLElement) {
  const r = stage.getBoundingClientRect();
  const dlg = parseFloat(getComputedStyle(stage).getPropertyValue('--dlg')) || 0;
  return { ox: r.left + r.width / 2, oy: r.top + (r.height - dlg) / 2, w: r.width, h: r.height };
}

/** 휠을 굴린 곳에서 무대까지 올라가며 스크롤할 수 있는 칸이나 입력 칸이 있는지 */
function scrollsInside(from: EventTarget | null, stage: HTMLElement): boolean {
  for (let n = from instanceof Element ? from : null; n && n !== stage; n = n.parentElement) {
    if (n.matches('input, textarea, select, [role="dialog"], dialog')) return true;
    if (n.scrollHeight <= n.clientHeight + 1) continue;
    const oy = getComputedStyle(n).overflowY;
    if (oy === 'auto' || oy === 'scroll') return true;
  }
  return false;
}

export function useFieldCamera(stageRef: RefObject<HTMLElement | null>, resetKey: unknown) {
  const [cam, setCam] = useState<Camera>(HOME);
  const camRef = useRef(cam);
  const [panning, setPanning] = useState(false);

  const apply = useCallback(
    (next: Camera) => {
      const stage = stageRef.current;
      const c = stage ? clampCam(next, stage.clientWidth, stage.clientHeight) : next;
      camRef.current = c;
      setCam(c);
    },
    [stageRef],
  );

  const reset = useCallback(() => apply(HOME), [apply]);

  // 장면이 바뀌면 카메라도 처음 자리로
  const [shownKey, setShownKey] = useState(resetKey);
  if (shownKey !== resetKey) {
    setShownKey(resetKey);
    setCam(HOME);
  }
  useEffect(() => {
    camRef.current = cam;
  }, [cam]);

  // 휠 줌: 커서 아래의 점이 그 자리에 머물게 이동도 함께 고친다
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY === 0 || phone()) return;
      // Ctrl+휠은 브라우저 확대·축소로 남겨 둔다
      if (e.ctrlKey || e.metaKey || scrollsInside(e.target, stage)) return;
      e.preventDefault();
      const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
      const c = camRef.current;
      const z = Math.min(CAM_MAX, Math.max(CAM_MIN, c.z * Math.exp(-dy * 0.0015)));
      if (z === c.z) return;
      const { ox, oy } = originOf(stage);
      const px = e.clientX - ox;
      const py = e.clientY - oy;
      const k = z / c.z;
      apply({ z, x: px - k * (px - c.x), y: py - k * (py - c.y) });
    };
    stage.addEventListener('wheel', onWheel, { passive: false });
    return () => stage.removeEventListener('wheel', onWheel);
  }, [stageRef, apply]);

  /** 무대의 onPointerDown: 빈 장면(무대 바탕 · 배경 그림)을 끌면 필드를 옮긴다 */
  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (e.button !== 0 || e.pointerType === 'touch' || phone()) return;
      const t = e.target as HTMLElement;
      if (!t.closest('[data-field-bg]') && t !== e.currentTarget) return;
      const stage = e.currentTarget;
      const sx = e.clientX;
      const sy = e.clientY;
      const start = camRef.current;
      let moved = false;
      const move = (ev: PointerEvent) => {
        const dx = ev.clientX - sx;
        const dy = ev.clientY - sy;
        if (!moved) {
          if (Math.abs(dx) + Math.abs(dy) < 4) return;
          moved = true;
          stage.setPointerCapture(ev.pointerId);
          setPanning(true);
        }
        apply({ ...start, x: start.x + dx, y: start.y + dy });
      };
      const up = () => {
        stage.removeEventListener('pointermove', move);
        stage.removeEventListener('pointerup', up);
        stage.removeEventListener('pointercancel', up);
        setPanning(false);
      };
      stage.addEventListener('pointermove', move);
      stage.addEventListener('pointerup', up);
      stage.addEventListener('pointercancel', up);
    },
    [apply],
  );

  const onDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      const t = e.target as HTMLElement;
      if (t.closest('[data-field-bg]') || t === e.currentTarget) reset();
    },
    [reset],
  );

  const moved = cam.z !== 1 || cam.x !== 0 || cam.y !== 0;
  const style = {
    '--cam-x': `${Math.round(cam.x)}px`,
    '--cam-y': `${Math.round(cam.y)}px`,
    '--cam-z': cam.z.toFixed(3),
  } as React.CSSProperties;

  return { cam, moved, panning, style, reset, onPointerDown, onDoubleClick };
}
