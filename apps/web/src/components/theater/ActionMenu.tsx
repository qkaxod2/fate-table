'use client';

import { term, tip } from '@fate/glossary';
import { APPROACHES, type Action, type Approach, type Character } from '@fate/rules-engine';
import { useEffect } from 'react';
import { isDialogOpen } from '../book/Leaf';
import type { CoachFocus } from '../roll/ActionBar';
import styles from './ActionMenu.module.css';

const ACTIONS: Action[] = ['overcome', 'create_advantage', 'attack', 'defend'];
const APPROACH_KEYS: Record<Approach, string> = {
  careful: 'Q',
  clever: 'W',
  flashy: 'E',
  forceful: 'A',
  quick: 'S',
  sneaky: 'D',
};
const sign = (n: number) => `${n >= 0 ? '+' : ''}${n}`;

interface Props {
  character: Character;
  action: Action | null;
  approach: Approach | null;
  disabled?: boolean;
  canDefend?: boolean;
  focus?: CoachFocus | undefined;
  /** 단계별 튜토리얼: 지금 단계의 버튼만 열어 둔다 (단축키도) */
  guide?: { focus: CoachFocus | null; action?: Action } | undefined;
  /** 접근법마다 성공할 가능성 (0~1) */
  odds?: ((ap: Approach) => number) | undefined;
  onAction: (a: Action | null) => void;
  onApproach: (a: Approach) => void;
  onRoll: () => void;
}

/**
 * 대사창 오른쪽 행동 고르기 (design-system.md 32절).
 * 한 칸 안에서 행동 → 접근법 → 굴리기 순으로 바뀐다. 게임 메뉴처럼 글자만, 고른 줄은 진홍 띠.
 */
export function ActionMenu({
  character,
  action,
  approach,
  disabled,
  canDefend = false,
  focus,
  guide,
  odds,
  onAction,
  onApproach,
  onRoll,
}: Props) {
  const allowAction = (a: Action) =>
    !guide || (guide.focus === 'action' && (!guide.action || guide.action === a));
  const allowApproach = !guide || guide.focus === 'approach';
  const allowRoll = !guide || guide.focus === 'roll';
  const best = Math.max(...APPROACHES.map((ap) => character.approaches[ap]));
  const stuntFor = (ap: Approach) =>
    character.stunts.some((st) => st.bonus?.action === action && st.bonus.approach === ap);

  useEffect(() => {
    if (disabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isDialogOpen()) return;
      const n = Number(e.key);
      if (n >= 1 && n <= 4) {
        const a = ACTIONS[n - 1]!;
        if ((a !== 'defend' || canDefend) && allowAction(a)) onAction(a);
        return;
      }
      if (e.key === 'Escape' && action && !guide) onAction(null);
      const ap = APPROACHES.find((x) => APPROACH_KEYS[x].toLowerCase() === e.key.toLowerCase());
      if (ap && action && allowApproach) onApproach(ap);
      if (e.code === 'Space' && action && approach && allowRoll) {
        e.preventDefault();
        onRoll();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // allow*는 guide에서 바로 나오는 값이라 guide만 보면 된다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled, action, approach, canDefend, guide, onAction, onApproach, onRoll]);

  const stage = !action ? 'action' : 'approach';
  return (
    <div className={styles.menu} data-tour="actionbar" data-disabled={disabled || undefined}>
      {stage === 'action' ? (
        <ol
          className={styles.list}
          data-tour="actions"
          aria-label="행동"
          data-focus={focus === 'action' || undefined}
        >
          {ACTIONS.map((a, i) => (
            <li key={a}>
              <button
                type="button"
                className={styles.row}
                data-tour={`action-${a}`}
                disabled={disabled || (a === 'defend' && !canDefend) || !allowAction(a)}
                onClick={() => onAction(a)}
              >
                <span className={styles.label}>{term(a)}</span>
                <span className={styles.note}>
                  {a === 'defend' && !canDefend ? '상대가 공격해 올 때' : tip(a)}
                </span>
                <kbd className={styles.key} aria-hidden>
                  {i + 1}
                </kbd>
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <div className={styles.pick}>
          <div className={styles.head}>
            <button
              type="button"
              className={styles.back}
              disabled={disabled || !!guide}
              onClick={() => onAction(null)}
              aria-label="행동 다시 고르기"
            >
              {term(action!)}
            </button>
            <span>어떻게?</span>
          </div>
          <div
            className={styles.grid}
            data-tour="approaches"
            role="radiogroup"
            aria-label={term('approach')}
            data-focus={focus === 'approach' || undefined}
          >
            {APPROACHES.map((ap) => {
              const v = character.approaches[ap];
              return (
                <button
                  key={ap}
                  type="button"
                  role="radio"
                  aria-checked={approach === ap}
                  className={styles.ap}
                  title={tip(ap)}
                  disabled={disabled || !allowApproach}
                  onClick={() => onApproach(ap)}
                >
                  <span className={styles.apName}>{term(ap)}</span>
                  <b>{sign(v)}</b>
                  <span className={styles.apTags}>
                    {stuntFor(ap) && <em>{term('stunt')} +2</em>}
                    {v === best && <em>최고</em>}
                    {odds && <span>{Math.round(odds(ap) * 100)}%</span>}
                  </span>
                </button>
              );
            })}
          </div>
          <div className={styles.go} data-tour="roll" data-focus={focus === 'roll' || undefined}>
            <button
              type="button"
              className={styles.roll}
              disabled={disabled || !approach || !allowRoll}
              onClick={onRoll}
            >
              굴린다
              <kbd>Space</kbd>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
