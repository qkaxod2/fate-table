'use client';

import { useEffect, useRef, useState } from 'react';
import { DICE_MODES, saveDiceMode, type DiceMode } from '@/components/roll/DiceTray';
import { playSfx, setSfxEnabled, setSfxVolume, sfxVolume } from '@/fx/sfx';
import styles from './RoomSettings.module.css';

/** 단축키 표기: 맥에서는 ⌘ */
export const IS_MAC =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

/**
 * 머리글의 "설정" 한 단추 안에 화면 설정과 나가기를 모은다.
 * 주사위 연출 · 효과음 · 명령 창 · 단축키, 그리고 맨 아래 따로 떨어진 나가기(GM은 방 지우기).
 * 되돌릴 수 없는 방 지우기가 도구 바로 옆에 놓이지 않게 한다.
 */
export function RoomSettings({
  isGm,
  diceMode,
  onDiceMode,
  sfxOn,
  onSfx,
  onPalette,
  onHelp,
  onExit,
}: {
  isGm: boolean;
  diceMode: DiceMode;
  onDiceMode: (m: DiceMode) => void;
  sfxOn: boolean;
  onSfx: (on: boolean) => void;
  onPalette: () => void;
  onHelp: () => void;
  onExit: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [volume, setVolume] = useState(sfxVolume);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
        wrap.current?.querySelector<HTMLButtonElement>('button')?.focus();
      }
    };
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  // 고른 뒤 창을 닫고 할 일을 한다
  const then = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  return (
    <div className={styles.wrap} ref={wrap}>
      <button
        type="button"
        className={styles.trigger}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((o) => !o)}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" />
        </svg>
        설정
      </button>
      {open && (
        <div className={styles.pop} role="group" aria-label="화면 설정">
          <label className={styles.row}>
            <span>주사위 연출</span>
            <select
              value={diceMode}
              onChange={(e) => {
                const m = e.target.value as DiceMode;
                onDiceMode(m);
                saveDiceMode(m);
              }}
            >
              {DICE_MODES.map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.row}>
            <span>효과음</span>
            <input
              type="checkbox"
              role="switch"
              className={styles.switch}
              checked={sfxOn}
              onChange={(e) => {
                setSfxEnabled(e.target.checked);
                onSfx(e.target.checked);
              }}
            />
          </label>
          {sfxOn && (
            <label className={styles.row}>
              <span>크기</span>
              <input
                type="range"
                className={styles.volume}
                min={0}
                max={100}
                step={5}
                value={Math.round(volume * 100)}
                aria-valuetext={`${Math.round(volume * 100)}%`}
                onChange={(e) => {
                  const v = Number(e.target.value) / 100;
                  setVolume(v);
                  setSfxVolume(v);
                }}
                // 손을 떼면 그 크기로 한 번 들려준다
                onPointerUp={() => playSfx('token-flip')}
                onKeyUp={(e) => {
                  if (e.key.startsWith('Arrow')) playSfx('token-flip');
                }}
              />
            </label>
          )}
          <button type="button" className={styles.row} onClick={then(onPalette)}>
            <span>명령 창</span>
            <kbd>{IS_MAC ? '⌘ K' : 'Ctrl K'}</kbd>
          </button>
          <button type="button" className={styles.row} onClick={then(onHelp)}>
            <span>단축키 보기</span>
            <kbd>?</kbd>
          </button>
          <hr className={styles.sep} />
          <button
            type="button"
            className={styles.row}
            data-danger={isGm || undefined}
            onClick={then(onExit)}
          >
            <span>{isGm ? '방 지우기' : '이 방에서 나가기'}</span>
            <small>{isGm ? '모두 내보내고 기록을 지워요' : ''}</small>
          </button>
        </div>
      )}
    </div>
  );
}
