'use client';

import type { DieFace } from '@fate/rules-engine';
import { useEffect, useState } from 'react';
import styles from './DiceTray.module.css';

export type DiceMode = 'flicker' | 'instant';

const GLYPH: Record<DieFace, string> = { [-1]: '−', 0: '', 1: '+' };
const FACES: DieFace[] = [-1, 0, 1];
const FIRST_STOP_MS = 360;
const STAGGER_MS = 80;

interface Props {
  dice: readonly DieFace[] | null;
  /** 바뀔 때마다 굴림 연출을 다시 시작 (같은 결과로 다시 굴려도 연출되게) */
  rollKey: string;
  tone?: 'me' | 'op';
  mode?: DiceMode;
  /** 봉인: 상대 응답 전이라 아무도 볼 수 없는 상태 */
  sealed?: boolean;
  onSettled?: () => void;
}

interface Progress {
  key: string;
  stopped: number;
  flicker: DieFace[];
}

/** 눈 바뀜 모드: 네 주사위의 눈이 빠르게 바뀌다가 80ms 간격으로 하나씩 멈춘다 */
export function DiceTray({
  dice,
  rollKey,
  tone = 'me',
  mode = 'flicker',
  sealed,
  onSettled,
}: Props) {
  const [progress, setProgress] = useState<Progress>({
    key: '',
    stopped: 0,
    flicker: [0, 0, 0, 0],
  });
  const animate = mode === 'flicker' && !!dice && !sealed;

  useEffect(() => {
    if (!dice || sealed) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!animate || reduced) {
      const t = window.setTimeout(() => {
        setProgress({ key: rollKey, stopped: 4, flicker: [0, 0, 0, 0] });
        onSettled?.();
      }, 0);
      return () => window.clearTimeout(t);
    }
    const random = () => [0, 0, 0, 0].map(() => FACES[Math.floor(Math.random() * 3)]!);
    const flicker = window.setInterval(() => {
      setProgress((p) => ({
        key: rollKey,
        stopped: p.key === rollKey ? p.stopped : 0,
        flicker: random(),
      }));
    }, 55);
    const timers = [0, 1, 2, 3].map((i) =>
      window.setTimeout(
        () => {
          setProgress((p) => ({ key: rollKey, stopped: i + 1, flicker: p.flicker }));
          if (i === 3) {
            window.clearInterval(flicker);
            onSettled?.();
          }
        },
        FIRST_STOP_MS + i * STAGGER_MS,
      ),
    );
    return () => {
      window.clearInterval(flicker);
      timers.forEach((t) => window.clearTimeout(t));
    };
    // rollKey가 바뀔 때만 다시 굴린다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rollKey, sealed]);

  const stopped = progress.key === rollKey ? progress.stopped : 0;
  const hidden = sealed || !dice;

  return (
    <div className={styles.tray} data-tone={tone} aria-live="polite">
      {[0, 1, 2, 3].map((i) => {
        const settled = !animate || stopped > i;
        const face = hidden ? null : settled ? dice[i]! : progress.flicker[i]!;
        return (
          <span
            key={i}
            className={styles.die}
            data-sealed={hidden || undefined}
            data-rolling={(!hidden && !settled) || undefined}
            aria-label={
              face === null ? '주사위' : face === 1 ? '플러스' : face === -1 ? '마이너스' : '빈 면'
            }
          >
            {face === null ? '' : GLYPH[face]}
          </span>
        );
      })}
    </div>
  );
}
