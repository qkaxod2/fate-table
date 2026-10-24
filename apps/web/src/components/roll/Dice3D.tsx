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
  /** 서버를 기다리는 동안 이미 굴러가고 있었으면 짧게 내려앉는다 */
  quick?: boolean;
  onSettled?: () => void;
}

/** 3D 주사위: 위에서 떨어져 구르다 튕기고 멈춘다. 결과는 처음부터 정해져 있다 */
export function Dice3D({ dice, rollKey, tone = 'me', quick, onSettled }: Props) {
  const cubes = useRef<Array<HTMLDivElement | null>>([]);
  const shadows = useRef<Array<HTMLSpanElement | null>>([]);

  useEffect(() => {
    const rand = mulberry32(hashKey(rollKey));
    const shadowEls = shadows.current;
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
      // 떨어질 때는 점점 빨라지고(중력), 튀어 오를 때는 점점 느려진다. 바닥에 닿는 순간 살짝 눌린다.
      const frame = (
        t: number,
        x: number,
        y: number,
        offset: number,
        easing: string,
        squash = 0,
      ) => ({
        offset,
        easing,
        transform: `translate3d(${x}px,${y}px,0) scale3d(${1 + squash},${1 - squash * 1.6},1) rotateX(${lerp(sx, ex, t)}deg) rotateY(${lerp(sy, ey, t)}deg)`,
      });
      const fall = 'cubic-bezier(.5,0,.9,.5)';
      const rise = 'cubic-bezier(.1,.5,.5,1)';
      const keys = quick
        ? [
            frame(0.55, drift * 0.3, -18, 0, fall),
            frame(0.9, 0, 0, 0.45, rise, 0.05),
            frame(0.97, 0, -5, 0.68, fall),
            frame(1, 0, 0, 0.84, rise, 0.02),
            frame(1, 0, 0, 1, 'linear'),
          ]
        : [
            frame(0, drift, -64, 0, fall),
            frame(0.6, drift * 0.3, 0, 0.4, rise, 0.07),
            frame(0.86, drift * 0.1, -14, 0.56, fall),
            frame(0.97, 0, 0, 0.7, rise, 0.04),
            frame(0.995, 0, -3, 0.8, fall),
            frame(1, 0, 0, 0.88, rise, 0.015),
            frame(1, 0, 0, 1, 'linear'),
          ];
      const duration = quick ? 480 + i * 70 : 1050 + i * 150;
      // 그림자는 주사위가 높을수록 작고 옅다
      shadowEls[i]?.animate(
        keys.map((k, j) => {
          const y = quick ? [-18, 0, -5, 0, 0][j]! : [-64, 0, -14, 0, -3, 0, 0][j]!;
          return {
            offset: k.offset,
            easing: k.easing,
            transform: `scale(${1 + y / 110})`,
            opacity: 1 + y / 90,
          };
        }),
        { duration },
      );
      return el.animate(keys, { duration });
    });
    const last = anims.filter((a) => a !== null).at(-1);
    if (!last) {
      const t = window.setTimeout(() => onSettled?.(), 0);
      return () => window.clearTimeout(t);
    }
    // 주사위가 하나씩 멈출 때마다 판 위에 금빛이 한 번 번진다
    anims.forEach((a, i) => {
      if (a)
        a.onfinish = () => {
          shadowEls[i]?.parentElement?.setAttribute('data-landed', '');
          if (a === last) onSettled?.();
        };
    });
    return () => {
      anims.forEach((a) => a?.cancel());
      shadowEls.forEach((s) => s?.parentElement?.removeAttribute('data-landed'));
    };
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
          <span
            className={styles.shadow}
            ref={(el) => {
              shadows.current[i] = el;
            }}
          />
        </div>
      ))}
    </div>
  );
}

/** 서버 결과를 기다리는 동안 누르자마자 굴러가는 주사위 (눈은 아직 정해지지 않았다) */
export function TumblingDice({ tone = 'me' }: { tone?: 'me' | 'op' }) {
  return (
    <div className={styles.tray} data-tone={tone} aria-label="주사위 굴리는 중">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className={styles.scene}>
          <div
            className={`${styles.cube} ${styles.tumble}`}
            style={{ animationDelay: `${-i * 137}ms` }}
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
