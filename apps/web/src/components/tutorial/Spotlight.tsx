'use client';

import { useEffect, useState } from 'react';
import styles from './Spotlight.module.css';

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Props {
  /** 밝게 뚫어 두고 누를 수 있게 남기는 곳 (CSS 선택자). 나머지는 어둡게 덮고 막는다 */
  open: string[];
  /** 지금 눌러야 하는 곳. 금빛 고리가 맥박처럼 뛴다 */
  ring?: string;
}

const PAD = 8;

function boxOf(el: Element, pad = PAD): Box | null {
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  // 카드 밖으로 걸쳐 나온 버튼(굴리기 봉인 등)도 구멍 안에 들어오게 넓힌다
  let [l, t, rt, b] = [r.left, r.top, r.right, r.bottom];
  for (const btn of el.querySelectorAll('button')) {
    const q = btn.getBoundingClientRect();
    if (q.width === 0 && q.height === 0) continue;
    [l, t, rt, b] = [
      Math.min(l, q.left),
      Math.min(t, q.top),
      Math.max(rt, q.right),
      Math.max(b, q.bottom),
    ];
  }
  return { x: l - pad, y: t - pad, w: rt - l + pad * 2, h: b - t + pad * 2 };
}

const same = (a: Box[], b: Box[]) =>
  a.length === b.length &&
  a.every(
    (x, i) =>
      Math.abs(x.x - b[i]!.x) < 0.5 &&
      Math.abs(x.y - b[i]!.y) < 0.5 &&
      Math.abs(x.w - b[i]!.w) < 0.5 &&
      Math.abs(x.h - b[i]!.h) < 0.5,
  );

/**
 * 구멍들(겹쳐도 됨)을 뺀 나머지 화면을 겹치지 않는 사각형들로 쪼갠 경로.
 * 구멍 모서리로 격자를 나누고, 어느 구멍에도 들지 않는 칸을 가로로 이어 붙인다.
 */
function dimPath(holes: Box[], vw: number, vh: number): string {
  const xs = [...new Set([0, vw, ...holes.flatMap((b) => [b.x, b.x + b.w])])]
    .map((x) => Math.min(vw, Math.max(0, x)))
    .sort((a, b) => a - b);
  const ys = [...new Set([0, vh, ...holes.flatMap((b) => [b.y, b.y + b.h])])]
    .map((y) => Math.min(vh, Math.max(0, y)))
    .sort((a, b) => a - b);
  const inHole = (x: number, y: number) =>
    holes.some((b) => x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h);
  let d = '';
  for (let j = 0; j + 1 < ys.length; j++) {
    const y0 = ys[j]!;
    const y1 = ys[j + 1]!;
    if (y1 <= y0) continue;
    let start: number | null = null;
    for (let i = 0; i + 1 < xs.length; i++) {
      const x0 = xs[i]!;
      const x1 = xs[i + 1]!;
      const dim = x1 > x0 && !inHole((x0 + x1) / 2, (y0 + y1) / 2);
      if (dim && start === null) start = x0;
      if (!dim && start !== null && x1 > x0) {
        d += `M${start} ${y0}H${x0}V${y1}H${start}Z`;
        start = null;
      }
    }
    if (start !== null) d += `M${start} ${y0}H${vw}V${y1}H${start}Z`;
  }
  return d;
}

/**
 * 튜토리얼 스포트라이트: 화면 전체를 어둡게 덮고, 지금 볼 곳만 뚫어 둔다.
 * 뚫린 곳은 클릭이 그대로 통과하고, 어두운 곳은 클릭을 먹는다 (지금 단계 밖의 조작을 막는다).
 * 대상이 움직이거나 화면이 스크롤되어도 따라가도록 매 프레임 자리를 다시 잰다.
 */
export function Spotlight({ open, ring }: Props) {
  const [path, setPath] = useState('');
  const [target, setTarget] = useState<Box[]>([]);
  const key = open.join('|');

  useEffect(() => {
    let raf = 0;
    let lastPath = '';
    const root = document.documentElement;
    // 처음 한 번은 꼭 다시 그리게 (고리가 없어진 단계에서 지난 고리가 남지 않도록)
    let lastRing: Box[] | null = null;
    const tick = () => {
      const h = open
        .flatMap((sel) => [...document.querySelectorAll(sel)])
        // 안내 말풍선은 어둠보다 위에 떠 있어서 따로 뚫을 필요가 없다 (뚫으면 둘레에 밝은 테가 생긴다)
        .filter((el) => !el.hasAttribute('data-coach'))
        .map((el) => boxOf(el))
        .filter((b): b is Box => b !== null);
      const r = ring
        ? [...document.querySelectorAll(ring)]
            .map((el) => boxOf(el, 6))
            .filter((b): b is Box => b !== null)
        : [];
      const d = dimPath(h, window.innerWidth, window.innerHeight);
      if (d !== lastPath) setPath((lastPath = d));
      if (!lastRing || !same(r, lastRing)) setTarget((lastRing = r));
      // 좁은 화면에서는 안내가 아래 시트로 떠 있으니, 스크롤로 무언가를 보여 줄 때 그 밑으로 숨지 않게
      const sheet = document.querySelector('[data-coach][data-sheet]');
      const coachH = sheet ? Math.round(window.innerHeight - sheet.getBoundingClientRect().top) : 0;
      const pad = sheet ? `${coachH + 12}px` : '';
      if (root.style.scrollPaddingBottom !== pad) root.style.scrollPaddingBottom = pad;
      // 판정 시트(RollSheet)는 이 값만큼 안내 시트 위로 올라앉는다
      const lift = sheet ? `${coachH}px` : '';
      if (root.style.getPropertyValue('--coach-sheet') !== lift)
        root.style.setProperty('--coach-sheet', lift);
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      cancelAnimationFrame(raf);
      root.style.scrollPaddingBottom = '';
      root.style.removeProperty('--coach-sheet');
    };
    // open은 매번 새 배열이라 내용(key)으로 비교한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ring]);

  // 단계가 바뀌면 눌러야 할 곳이 화면 안에 들어오게 (좁은 화면)
  useEffect(() => {
    if (!ring) return;
    const t = window.setTimeout(() => {
      // 휴대폰에서는 안내 시트가 아래를 덮으니, 대상은 시트 위 남은 화면의 가운데로 온다
      const sheet = window.matchMedia('(max-width: 760px)').matches;
      document
        .querySelector(ring)
        ?.scrollIntoView({ block: sheet ? 'center' : 'nearest', behavior: 'smooth' });
    }, 120);
    return () => window.clearTimeout(t);
  }, [ring]);

  return (
    <div className={styles.spot} aria-hidden data-spotlight>
      <svg className={styles.svg} width="100%" height="100%">
        <path d={path} className={styles.dim} />
        {target.map((b, i) => (
          <g key={i}>
            <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={12} className={styles.ringWave} />
            <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={12} className={styles.ring} />
          </g>
        ))}
      </svg>
      {target[0] && (
        <div
          className={styles.arrow}
          style={{ left: target[0].x + target[0].w / 2, top: target[0].y }}
        >
          ▼
        </div>
      )}
    </div>
  );
}
