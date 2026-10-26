'use client';

import { term, tip } from '@fate/glossary';
import { APPROACHES, type Action, type Approach, type Character } from '@fate/rules-engine';
import { useEffect, useState } from 'react';
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
  /** 굴리기 버튼을 따로(판정 예고 카드의 봉인) 둘 때 */
  hideRoll?: boolean;
  onAction: (a: Action) => void;
  onApproach: (a: Approach) => void;
  onRoll: () => void;
}

const NUMERALS = ['i', 'ii', 'iii', 'iv'];

export function ActionBar({
  character,
  action,
  approach,
  disabled,
  busy,
  canDefend = false,
  focus,
  guide,
  hideRoll = false,
  onAction,
  onApproach,
  onRoll,
}: Props) {
  // 접근법 고르기: 행동을 고르면 저절로 펼쳐지고, 하나를 고르면 접힌다
  const [pickerOpen, setPickerOpen] = useState(false);
  const [openedFor, setOpenedFor] = useState<Action | null>(null);
  if (action !== openedFor) {
    setOpenedFor(action);
    setPickerOpen(!!action && !approach);
  }
  const showPicker = !!action && (pickerOpen || (!!guide && guide.focus === 'approach'));
  const best = Math.max(...APPROACHES.map((ap) => character.approaches[ap]));
  const stuntFor = (ap: Approach) =>
    character.stunts.some((st) => st.bonus?.action === action && st.bonus.approach === ap);
  const pick = (ap: Approach) => {
    onApproach(ap);
    setPickerOpen(false);
  };
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
      if (ap && action && allowApproach) pick(ap);
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
    <div className={styles.toc} data-disabled={disabled || undefined} data-tour="actionbar">
      <h4 className={styles.head}>다음 한 수</h4>
      <ol
        className={styles.rows}
        data-tour="actions"
        role="radiogroup"
        aria-label="행동"
        data-focus={focus === 'action' || undefined}
      >
        {ACTIONS.map((a, i) => {
          const on = action === a;
          return (
            <li key={a} className={styles.row} data-on={on || undefined}>
              <button
                type="button"
                role="radio"
                aria-checked={on}
                className={styles.action}
                data-tour={`action-${a}`}
                disabled={disabled || (a === 'defend' && !canDefend) || !allowAction(a)}
                onClick={() => onAction(a)}
              >
                <span className={styles.n} aria-hidden>
                  {NUMERALS[i]}
                </span>
                <span className={styles.k}>{term(a)}</span>
                <span className={styles.desc}>
                  {a === 'defend' && !canDefend ? '상대가 공격해 올 때' : tip(a)}
                </span>
                <span className={styles.dots} aria-hidden />
                {!on && (
                  <kbd className={styles.num} aria-hidden>
                    {i + 1}
                  </kbd>
                )}
              </button>
              {on && (
                <button
                  type="button"
                  className={styles.apBtn}
                  aria-expanded={showPicker}
                  aria-label={`${term('approach')} 고르기`}
                  disabled={disabled || !allowApproach}
                  data-empty={!approach || undefined}
                  onClick={() => setPickerOpen((o) => !o)}
                >
                  {approach ? (
                    <>
                      {term(approach)}{' '}
                      <b>
                        {character.approaches[approach] >= 0 ? '+' : ''}
                        {character.approaches[approach]}
                      </b>
                    </>
                  ) : (
                    `${term('approach')} 고르기`
                  )}
                </button>
              )}
              {on && showPicker && (
                <div
                  className={styles.picker}
                  role="radiogroup"
                  aria-label={term('approach')}
                  data-tour="approaches"
                  data-focus={focus === 'approach' || undefined}
                >
                  <p className={styles.pickHead}>어떻게? · {term('approach')}</p>
                  <div className={styles.grid}>
                    {APPROACHES.map((ap) => {
                      const v = character.approaches[ap];
                      return (
                        <button
                          key={ap}
                          type="button"
                          role="radio"
                          aria-checked={approach === ap}
                          className={styles.approach}
                          disabled={disabled || !allowApproach}
                          onClick={() => pick(ap)}
                        >
                          <span className={styles.tags}>
                            {stuntFor(ap) && <em className={styles.stunt}>{term('stunt')} +2</em>}
                            {v === best && <em>최고</em>}
                            <kbd className={styles.key} aria-hidden>
                              {APPROACH_KEYS[ap]}
                            </kbd>
                          </span>
                          <b>
                            {v >= 0 ? '+' : ''}
                            {v}
                          </b>
                          <span className={styles.apName}>{term(ap)}</span>
                          <span className={styles.apTip}>{tip(ap)}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {!hideRoll && (
        <div className={styles.rollRow} data-tour="roll" data-focus={focus === 'roll' || undefined}>
          <button
            type="button"
            className={styles.seal}
            disabled={!busy && (disabled || !action || !approach || !allowRoll)}
            data-busy={busy || undefined}
            aria-busy={busy || undefined}
            onClick={() => !busy && onRoll()}
          >
            {busy ? '굴리는 중' : '굴린다'}
            <kbd className={styles.space}>Space</kbd>
          </button>
        </div>
      )}
    </div>
  );
}
