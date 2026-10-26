'use client';

import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';

/** tokens.css의 --dur-exit와 같은 값. 사라지는 애니메이션이 끝날 때까지 기다리는 시간 */
export const EXIT_MS = 180;

export function reducedMotion(): boolean {
  return (
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * 창이 스스로 닫힐 때: 바로 닫지 않고 data-closing을 붙여 사라지는 애니메이션을 보여 준 뒤 닫는다.
 * 움직임 줄이기 설정이면 바로 닫는다.
 */
export function useClosing(onClose: () => void, ms = EXIT_MS): [boolean, () => void] {
  const [closing, setClosing] = useState(false);
  const latest = useRef(onClose);
  useEffect(() => {
    latest.current = onClose;
  }, [onClose]);
  useEffect(() => {
    if (!closing) return;
    const t = window.setTimeout(() => latest.current(), ms);
    return () => window.clearTimeout(t);
  }, [closing, ms]);
  const close = useCallback(() => {
    if (reducedMotion()) latest.current();
    else setClosing(true);
  }, []);
  return [closing, close];
}

/**
 * 조건이 꺼져도 마지막 모습을 잠깐 남겨 두고 사라지게 한다. 남아 있는 동안은
 * data-leaving이 붙은 래퍼(display: contents) 안에 있고, 누를 수 없다.
 */
export function Presence({
  show,
  children,
  ms = EXIT_MS,
}: {
  show: boolean;
  children: ReactNode;
  ms?: number;
}) {
  // 보이는 동안의 마지막 모습. 부모가 다시 그릴 때만 children이 바뀌니 여기서 한 번 더 그리고 멈춘다
  const [kept, setKept] = useState<ReactNode>(show ? children : null);
  const [leaving, setLeaving] = useState(false);
  const [was, setWas] = useState(show);
  if (show && kept !== children) setKept(children);
  if (was !== show) {
    setWas(show);
    setLeaving(!show && kept !== null && !reducedMotion());
  }
  useEffect(() => {
    if (!leaving) return;
    const t = window.setTimeout(() => {
      setKept(null);
      setLeaving(false);
    }, ms);
    return () => window.clearTimeout(t);
  }, [leaving, ms]);
  if (show) return <>{children}</>;
  if (!leaving) return null;
  return (
    <div data-leaving="" style={{ display: 'contents' }} inert>
      {kept}
    </div>
  );
}

/**
 * 화면 위로 작은 배지를 날린다 (발동 +2가 합계로 날아가는 것처럼). 다 날아가면 끝난다.
 * 출발점이나 도착점이 없거나 움직임 줄이기 설정이면 바로 끝난다.
 */
export function flyBadge(
  from: Element | null,
  to: Element | null,
  text: string,
  { duration = 460, className = 'fx-badge' }: { duration?: number; className?: string } = {},
): Promise<void> {
  if (!from || !to || reducedMotion()) return Promise.resolve();
  const a = from.getBoundingClientRect();
  const b = to.getBoundingClientRect();
  const el = document.createElement('div');
  el.className = className;
  el.textContent = text;
  el.setAttribute('aria-hidden', 'true');
  document.body.append(el);
  const sx = a.left + a.width / 2;
  const sy = a.top + a.height / 2;
  const ex = b.left + b.width / 2;
  const ey = b.top + b.height / 2;
  // 위로 살짝 솟았다가 내려앉는 포물선
  const lift = Math.min(120, Math.abs(ex - sx) * 0.35 + 40);
  const at = (t: number, scale: number, opacity = 1) => {
    const x = sx + (ex - sx) * t;
    const y = sy + (ey - sy) * t - lift * 4 * t * (1 - t);
    return {
      transform: `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${scale})`,
      opacity,
    };
  };
  const anim = el.animate(
    [
      { ...at(0, 0.6, 0), offset: 0 },
      { ...at(0.08, 1.25), offset: 0.12 },
      { ...at(0.5, 1.05), offset: 0.55 },
      { ...at(1, 0.8, 0.9), offset: 1 },
    ],
    { duration, easing: 'cubic-bezier(.45,0,.4,1)', fill: 'forwards' },
  );
  return anim.finished.then(
    () => el.remove(),
    () => el.remove(),
  );
}

/**
 * 한 줄로 쌓이는 좁은 화면에서는 굴리기 버튼이 맨 아래라 결과 패널이 화면 밖에 뜬다.
 * 패널로 부드럽게 스크롤한다. 콜백 ref로 쓰거나(생길 때), 결과가 나왔을 때 다시 부른다.
 * 위에 붙어 다니는 안내 카드가 있으면 그 아래에 오도록 맞춘다.
 */
export function revealOnNarrow(el: Element | null): void {
  if (!el || !window.matchMedia('(max-width: 1100px)').matches) return;
  // 같은 순간 사라지거나 나타나는 것(안내 카드 등)이 자리를 잡은 뒤에 위치를 잰다
  window.setTimeout(() => {
    if (!el.isConnected) return;
    // 위에 붙는 안내 카드만 비킨다. 아래에서 올라오는 시트(data-sheet)는 위를 가리지 않는다
    const coach = document.querySelector<HTMLElement>('[data-coach]:not([data-sheet])');
    const top = el.getBoundingClientRect().top + window.scrollY - (coach?.offsetHeight ?? 0) - 20;
    window.scrollTo({ top, behavior: reducedMotion() ? 'auto' : 'smooth' });
  }, EXIT_MS + 40);
}
