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
  /** 방어는 상대가 공격할 때만 굴린다 */
  canDefend?: boolean;
  /** 체험 안내가 가리키는 곳을 빛나게 한다 */
  focus?: CoachFocus;
  onAction: (a: Action) => void;
  onApproach: (a: Approach) => void;
  onRoll: () => void;
}

export function ActionBar({
  character,
  action,
  approach,
  disabled,
  canDefend = false,
  focus,
  onAction,
  onApproach,
  onRoll,
}: Props) {
  useEffect(() => {
    if (disabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const n = Number(e.key);
      if (n >= 1 && n <= 4) {
        const a = ACTIONS[n - 1]!;
        if (a !== 'defend' || canDefend) onAction(a);
        return;
      }
      const ap = APPROACHES.find((x) => APPROACH_KEYS[x].toLowerCase() === e.key.toLowerCase());
      if (ap && action) onApproach(ap);
      if (e.code === 'Space' && action && approach) {
        e.preventDefault();
        onRoll();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [disabled, action, approach, canDefend, onAction, onApproach, onRoll]);

  return (
    <div className={styles.bar} data-disabled={disabled || undefined}>
      <div
        className={styles.actions}
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
            disabled={disabled || (a === 'defend' && !canDefend)}
            onClick={() => onAction(a)}
            title={tip(a)}
          >
            <span className={styles.num}>0{i + 1}</span>
            {term(a)}
          </button>
        ))}
      </div>
      {action && (
        <div
          className={styles.approaches}
          role="radiogroup"
          aria-label={term('approach')}
          data-focus={focus === 'approach' || undefined}
        >
          {APPROACHES.map((ap) => (
            <button
              key={ap}
              type="button"
              role="radio"
              aria-checked={approach === ap}
              className={styles.approach}
              disabled={disabled}
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
      <div className={styles.rollCol} data-focus={focus === 'roll' || undefined}>
        <button
          type="button"
          className={styles.roll}
          disabled={disabled || !action || !approach}
          onClick={onRoll}
        >
          굴리기
        </button>
        <span className={styles.space}>SPACE</span>
      </div>
    </div>
  );
}
