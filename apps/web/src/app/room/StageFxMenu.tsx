'use client';

import type { Character, Command, RoomEvent, StageFxKind } from '@fate/rules-engine';
import { useEffect, useRef, useState } from 'react';
import styles from './StageFxMenu.module.css';

type Run = (cmd: Command) => Promise<RoomEvent[]>;

const WHOLE: ReadonlyArray<readonly [StageFxKind, string, string]> = [
  ['shake', '흔들기', '무대가 우르르 흔들림 (땅울림 소리)'],
  ['flash', '번쩍', '흰 빛이 한 번 터짐 (번개, 폭발)'],
  ['dark', '어둠', '가장자리부터 어둠이 번졌다 걷힘'],
];

const ONE: ReadonlyArray<readonly [StageFxKind, string, string]> = [
  ['tremble', '떨림', '그 캐릭터 그림이 오들오들 떨림 (두려움, 추위)'],
  ['hit', '타격', '그 캐릭터가 움찔하고 베인 자국이 그어짐'],
];

/**
 * GM 입력 줄의 "연출" 단추. 위로 펼쳐지는 쪽지에서 무대 전체 효과(흔들기 · 번쩍 · 어둠)나
 * 캐릭터 하나에 거는 효과(떨림 · 타격)를 고르면 모두의 화면에서 같이 일어난다.
 */
export function StageFxMenu({
  run,
  characters,
  focusId,
}: {
  run: Run;
  /** 고를 수 있는 캐릭터 (무대에 선 사람이 앞) */
  characters: Character[];
  /** 처음에 골라 둘 캐릭터 (지금 무대에서 말하는 쪽) */
  focusId?: string | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<string | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const picked =
    characters.find((c) => c.id === target) ??
    characters.find((c) => c.id === focusId) ??
    characters[0];

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

  const fire = (kind: StageFxKind, characterId?: string) =>
    void run({ type: 'stage.fx', payload: characterId ? { kind, characterId } : { kind } });

  return (
    <div className={styles.wrap} ref={wrap}>
      <button
        type="button"
        className={styles.trigger}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label="연출"
        data-tip="무대 연출: 흔들기 · 번쩍 · 어둠 · 떨림 · 타격"
        onClick={() => setOpen((o) => !o)}
      >
        <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden>
          <path d="M13 2 4 14h7l-1 8 9-12h-7z" />
        </svg>
        <span className={styles.word}>연출</span>
      </button>
      {open && (
        <div className={styles.pop} role="group" aria-label="무대 연출">
          <p className={styles.label}>무대 전체</p>
          <div className={styles.row}>
            {WHOLE.map(([k, label, hint]) => (
              <button key={k} type="button" title={hint} onClick={() => fire(k)}>
                {label}
              </button>
            ))}
          </div>
          {picked && (
            <>
              <p className={styles.label}>캐릭터 하나</p>
              <div className={styles.chips} role="radiogroup" aria-label="누구에게">
                {characters.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    role="radio"
                    aria-checked={c.id === picked.id}
                    onClick={() => setTarget(c.id)}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
              <div className={styles.row}>
                {ONE.map(([k, label, hint]) => (
                  <button key={k} type="button" title={hint} onClick={() => fire(k, picked.id)}>
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
