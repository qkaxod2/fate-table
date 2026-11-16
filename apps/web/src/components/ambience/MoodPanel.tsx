'use client';

import {
  BACKDROPS,
  SCENE_CONDITIONS,
  SCENE_TIMES,
  SCENE_WEATHERS,
  type Command,
  type RoomEvent,
  type Scene,
} from '@fate/rules-engine';
import { useEffect } from 'react';
import {
  BACKDROP_LABELS,
  backdropUrl,
  CONDITION_LABELS,
  TIME_LABELS,
  WEATHER_LABELS,
} from '@/lib/ambience';
import styles from './MoodPanel.module.css';

type Run = (cmd: Command) => Promise<RoomEvent[]>;
type Mood = Extract<Command, { type: 'scene.mood' }>['payload'];

/**
 * GM의 배경 · 분위기 판 (design-system.md 33절).
 * 무대를 가리지 않는 작은 판이라, 고르는 즉시 뒤의 장면이 바뀌는 걸 보면서 고른다.
 */
export function MoodPanel({
  scene,
  run,
  onClose,
}: {
  scene: Scene;
  run: Run;
  onClose: () => void;
}) {
  const amb = scene.ambience ?? { time: 'day', weather: 'clear', conditions: [] };
  const set = (payload: Mood) => void run({ type: 'scene.mood', payload });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <section className={styles.panel} aria-label="배경과 분위기">
      <header className={styles.head}>
        <b>배경 · 분위기</b>
        <button type="button" className={styles.close} onClick={onClose}>
          닫기 <kbd>Esc</kbd>
        </button>
      </header>

      <h3 className={styles.label}>기본 배경</h3>
      <div className={styles.backdrops} role="radiogroup" aria-label="기본 배경">
        {BACKDROPS.map((b) => (
          <button
            key={b}
            type="button"
            role="radio"
            aria-checked={scene.backdrop === b}
            className={styles.backdrop}
            onClick={() => set({ backdrop: scene.backdrop === b ? null : b })}
          >
            <img src={backdropUrl(b, true)} alt="" loading="lazy" />
            <span>{BACKDROP_LABELS[b]}</span>
          </button>
        ))}
      </div>
      {scene.backgroundUrl && (
        <p className={styles.note}>지금은 그린 배경을 쓰는 중. 고르면 바뀐다</p>
      )}

      <h3 className={styles.label}>시간</h3>
      <div className={styles.chips} role="radiogroup" aria-label="시간">
        {SCENE_TIMES.map((t) => (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={amb.time === t}
            onClick={() => amb.time !== t && set({ time: t })}
          >
            {TIME_LABELS[t]}
          </button>
        ))}
      </div>

      <h3 className={styles.label}>날씨</h3>
      <div className={styles.chips} role="radiogroup" aria-label="날씨">
        {SCENE_WEATHERS.map((w) => (
          <button
            key={w}
            type="button"
            role="radio"
            aria-checked={amb.weather === w}
            onClick={() => amb.weather !== w && set({ weather: w })}
          >
            {WEATHER_LABELS[w]}
          </button>
        ))}
      </div>

      <h3 className={styles.label}>상태 · 여러 개 겹칠 수 있다</h3>
      <div className={styles.chips} aria-label="상태">
        {SCENE_CONDITIONS.map((c) => {
          const on = amb.conditions.includes(c);
          return (
            <button
              key={c}
              type="button"
              aria-pressed={on}
              onClick={() =>
                set({
                  conditions: on ? amb.conditions.filter((x) => x !== c) : [...amb.conditions, c],
                })
              }
            >
              {CONDITION_LABELS[c]}
            </button>
          );
        })}
      </div>
    </section>
  );
}
