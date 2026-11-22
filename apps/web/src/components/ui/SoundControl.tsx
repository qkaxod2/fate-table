'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ambienceEnabled,
  ambienceVolume,
  setAmbienceEnabled,
  setAmbienceVolume,
} from '@/fx/ambience';
import { musicVolume, setMusicVolume } from '@/fx/music';
import { playSfx, setSfxEnabled, sfxEnabled, setSfxVolume, sfxVolume } from '@/fx/sfx';
import styles from '@/app/room/RoomSettings.module.css';

/**
 * 머리글의 스피커 단추. 누르면 아래로 쪽지가 펼쳐져 소리 전체를 끄고 켜거나,
 * 효과음 · 장면 배경음 · 음악 크기를 따로 맞춘다. 방과 튜토리얼이 같이 쓴다.
 */
export function SoundControl({ onChange }: { onChange?: (on: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const [on, setOn] = useState(sfxEnabled);
  const [sfx, setSfx] = useState(sfxVolume);
  const [amb, setAmb] = useState(() => (ambienceEnabled() ? ambienceVolume() : 0));
  const [mus, setMus] = useState(musicVolume);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setOpen(false);
      wrap.current?.querySelector<HTMLButtonElement>('button')?.focus();
    };
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  const toggle = (v: boolean) => {
    setSfxEnabled(v);
    setOn(v);
    onChange?.(v);
  };
  const quiet = !on || (sfx === 0 && amb === 0 && mus === 0);
  const pct = (v: number) => Math.round(v * 100);

  return (
    <div className={styles.wrap} ref={wrap}>
      <button
        type="button"
        className={styles.trigger}
        data-icon=""
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={quiet ? '소리 (꺼짐)' : '소리 크기'}
        data-tip={open ? undefined : '소리 크기'}
        data-tip-end=""
        onClick={() => setOpen((o) => !o)}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
          <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
          {quiet ? (
            <path d="m16 9.5 5 5m0-5-5 5" />
          ) : (
            <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />
          )}
        </svg>
      </button>
      {open && (
        <div className={styles.pop} role="group" aria-label="소리">
          <label className={styles.row}>
            <span>소리</span>
            <input
              type="checkbox"
              role="switch"
              className={styles.switch}
              checked={on}
              onChange={(e) => toggle(e.target.checked)}
            />
          </label>
          <label className={styles.row} data-sub="" data-off={!on || undefined}>
            <span>효과음</span>
            <input
              type="range"
              className={styles.volume}
              min={0}
              max={100}
              step={5}
              value={pct(sfx)}
              disabled={!on}
              aria-valuetext={`${pct(sfx)}%`}
              onChange={(e) => {
                const v = Number(e.target.value) / 100;
                setSfx(v);
                setSfxVolume(v);
              }}
              // 손을 떼면 그 크기로 한 번 들려준다
              onPointerUp={() => playSfx('token-flip')}
              onKeyUp={(e) => {
                if (e.key.startsWith('Arrow')) playSfx('token-flip');
              }}
            />
          </label>
          <label className={styles.row} data-sub="" data-off={!on || undefined}>
            <span>장면 배경음</span>
            <input
              type="range"
              className={styles.volume}
              min={0}
              max={100}
              step={5}
              value={pct(amb)}
              disabled={!on}
              aria-valuetext={amb === 0 ? '꺼짐' : `${pct(amb)}%`}
              // 배경음은 계속 깔려 있으니 움직이는 대로 바로 들린다. 0이면 꺼진다
              onChange={(e) => {
                const v = Number(e.target.value) / 100;
                setAmb(v);
                if (v > 0) setAmbienceVolume(v);
                setAmbienceEnabled(v > 0);
              }}
            />
          </label>
          <label className={styles.row} data-sub="" data-off={!on || undefined}>
            <span>음악</span>
            <input
              type="range"
              className={styles.volume}
              min={0}
              max={100}
              step={5}
              value={pct(mus)}
              disabled={!on}
              aria-valuetext={mus === 0 ? '꺼짐' : `${pct(mus)}%`}
              onChange={(e) => {
                const v = Number(e.target.value) / 100;
                setMus(v);
                setMusicVolume(v);
              }}
            />
          </label>
        </div>
      )}
    </div>
  );
}
