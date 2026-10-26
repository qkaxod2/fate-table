'use client';

import { term, tip } from '@fate/glossary';
import { APPROACHES, type Action, type Approach, type Character } from '@fate/rules-engine';
import { useEffect } from 'react';
import styles from './ActionBar.module.css';

const ACTIONS: Action[] = ['overcome', 'create_advantage', 'attack', 'defend'];
const APPROACH_KEYS: Record<Approach, string> = {
  careful: 'Q',
  clever: 'W',
  flashy: 'E',
  forceful: 'A',
  quick: 'S',
  sneaky: 'D',
};

export type CoachFocus = 'action' | 'approach' | 'roll';

interface Props {
  character: Character;
  action: Action | null;
  approach: Approach | null;
  disabled?: boolean;
  /** 굴리기를 눌러 서버 결과를 기다리는 중 */
  busy?: boolean;
  /** 방어는 상대가 공격할 때만 굴린다 */
  canDefend?: boolean;
  /** 체험 안내가 가리키는 곳을 빛나게 한다 */
  focus?: CoachFocus;
  /**
   * 단계별 튜토리얼: 지금 단계(focus)의 버튼만 누를 수 있게 잠근다 (단축키도).
   * action이 있으면 행동 버튼 중에서도 그것만 열어 둔다.
   */
  guide?: { focus: CoachFocus | null; action?: Action };
  onAction: (a: Action) => void;
  onApproach: (a: Approach) => void;
  onRoll: () => void;
}

export function ActionBar({
  character,
  action,
  approach,
  disabled,
  busy,
  canDefend = false,
  focus,
  guide,
  onAction,
  onApproach,
  onRoll,
}: Props) {
  const allowAction = (a: Action) =>
    !guide || (guide.focus === 'action' && (!guide.action || guide.action === a));
  const allowApproach = !guide || guide.focus === 'approach';
  const allowRoll = !guide || guide.focus === 'roll';

  useEffect(() => {
    if (disabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const n = Number(e.key);
      if (n >= 1 && n <= 4) {
        const a = ACTIONS[n - 1]!;
        if ((a !== 'defend' || canDefend) && allowAction(a)) onAction(a);
        return;
      }
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

  return (
    <div className={styles.bar} data-disabled={disabled || undefined} data-tour="actionbar">
      <div
        className={styles.actions}
        data-tour="actions"
        role="radiogroup"
        aria-label="행동"
        data-focus={focus === 'action' || undefined}
      >
        {ACTIONS.map((a, i) => (
          <button
            key={a}
            type="button"
            role="radio"
            aria-checked={action === a}
            className={styles.action}
            data-tour={`action-${a}`}
            disabled={disabled || (a === 'defend' && !canDefend) || !allowAction(a)}
            onClick={() => onAction(a)}
            title={tip(a)}
          >
            <kbd className={styles.num}>{i + 1}</kbd>
            {term(a)}
          </button>
        ))}
      </div>
      {action && (
        <div
          className={styles.approaches}
          role="radiogroup"
          aria-label={term('approach')}
          data-tour="approaches"
          data-focus={focus === 'approach' || undefined}
        >
          {APPROACHES.map((ap) => (
            <button
              key={ap}
              type="button"
              role="radio"
              aria-checked={approach === ap}
              className={styles.approach}
              disabled={disabled || !allowApproach}
              onClick={() => onApproach(ap)}
              title={tip(ap)}
            >
              <span className={styles.key}>{APPROACH_KEYS[ap]}</span>
              {term(ap)} {character.approaches[ap] >= 0 ? '+' : ''}
              {character.approaches[ap]}
            </button>
          ))}
        </div>
      )}
      <div className={styles.rollCol} data-tour="roll" data-focus={focus === 'roll' || undefined}>
        <button
          type="button"
          className={styles.roll}
          disabled={!busy && (disabled || !action || !approach || !allowRoll)}
          data-busy={busy || undefined}
          aria-busy={busy || undefined}
          onClick={() => !busy && onRoll()}
        >
          {busy ? '굴리는 중' : '굴리기'}
        </button>
        <kbd className={styles.space}>Space</kbd>
      </div>
    </div>
  );
}
