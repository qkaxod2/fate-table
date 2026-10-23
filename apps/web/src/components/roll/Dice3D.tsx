'use client';

import type { DieFace } from '@fate/rules-engine';
import { useEffect, useRef } from 'react';
import styles from './Dice3D.module.css';

/** 서버 animSeed(rollKey에 들어 있음)로 궤적을 정해서, 같은 굴림은 모두에게 같은 모양으로 굴러간다 */
function hashKey(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 페이트 주사위: + 두 면, − 두 면, 빈 면 두 개 */
const FACES = [
  ['front', '+'],
  ['right', '+'],
  ['back', '−'],
  ['left', '−'],
  ['top', ''],
  ['bottom', ''],
] as const;

/** 그 눈이 앞을 보게 하는 정육면체 회전 [x, y] (두 가지 중 하나) */
const FINAL: Record<DieFace, ReadonlyArray<readonly [number, number]>> = {
  1: [
    [0, 0],
    [0, -90],
  ],
  [-1]: [
    [0, 180],
    [0, 90],
  ],
  0: [
    [-90, 0],
    [90, 0],
  ],
};

interface Props {
  dice: readonly DieFace[];
  rollKey: string;
  tone?: 'me' | 'op';
  onSettled?: () => void;
}

/** 3D 주사위: 위에서 떨어져 구르다 튕기고 멈춘다. 결과는 처음부터 정해져 있다 */
export function Dice3D({ dice, rollKey, tone = 'me', onSettled }: Props) {
  const cubes = useRef<Array<HTMLDivElement | null>>([]);

  useEffect(() => {
    const rand = mulberry32(hashKey(rollKey));
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
    const anims = dice.map((face, i) => {
      const el = cubes.current[i];
      if (!el) return null;
      const options = FINAL[face];
      const [bx, by] = options[rand() < 0.5 ? 0 : 1]!;
      const sign = () => (rand() < 0.5 ? -1 : 1);
      const ex = bx + 360 * (1 + Math.floor(rand() * 2)) * sign();
      const ey = by + 360 * (1 + Math.floor(rand() * 2)) * sign();
      const sx = rand() * 360 - 180;
      const sy = rand() * 360 - 180;
      const drift = (rand() - 0.5) * 40;
      el.style.transform = `translate3d(0,0,0) rotateX(${ex}deg) rotateY(${ey}deg)`;
      if (reduced) return null;
      const frame = (t: number, x: number, y: number, offset: number) => ({
        offset,
        transform: `translate3d(${x}px,${y}px,0) rotateX(${lerp(sx, ex, t)}deg) rotateY(${lerp(sy, ey, t)}deg)`,
      });
      return el.animate(
        [
          frame(0, drift, -64, 0),
          frame(0.6, drift * 0.3, 0, 0.42),
          frame(0.88, drift * 0.1, -12, 0.62),
          frame(0.98, 0, 0, 0.8),
          frame(1, 0, 0, 1),
        ],
        { duration: 950 + i * 150, easing: 'linear' },
      );
    });
    const last = anims.filter((a) => a !== null).at(-1);
    if (!last) {
      const t = window.setTimeout(() => onSettled?.(), 0);
      return () => window.clearTimeout(t);
    }
    last.onfinish = () => onSettled?.();
    return () => anims.forEach((a) => a?.cancel());
    // rollKey가 바뀔 때만 다시 굴린다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rollKey]);

  return (
    <div className={styles.tray} data-tone={tone} aria-live="polite">
      {dice.map((face, i) => (
        <div
          key={i}
          className={styles.scene}
          role="img"
          aria-label={face === 1 ? '플러스' : face === -1 ? '마이너스' : '빈 면'}
        >
          <div
            className={styles.cube}
            ref={(el) => {
              cubes.current[i] = el;
            }}
          >
            {FACES.map(([side, glyph]) => (
              <span key={side} className={styles.face} data-side={side}>
                {glyph}
              </span>
            ))}
          </div>
          <span className={styles.shadow} />
        </div>
      ))}
    </div>
  );
}
