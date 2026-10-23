'use client';

import { term } from '@fate/glossary';
import {
  CONTEST_VICTORIES_TO_WIN,
  type Character,
  type Command,
  type Outcome,
  type RoomEvent,
  type RoomState,
} from '@fate/rules-engine';
import { useState } from 'react';
import styles from './Trackers.module.css';

interface Props {
  state: RoomState;
  run: (cmd: Command) => Promise<RoomEvent[]>;
  isGm: boolean;
  canControl: (c: Character | undefined) => boolean;
  pending: boolean;
}

const OUTCOMES: Outcome[] = ['fail', 'tie', 'success', 'style'];

/** 진행 중인 갈등 차례 · 경합 승수 · 도전 단계. 장면 위쪽 띠로 보여 준다 */
export function Trackers({ state, run, isGm, canControl, pending }: Props) {
  const { conflict, contest, challenge } = state;
  const [twoWins, setTwoWins] = useState(false);
  if (!conflict && !contest && !challenge) return null;
  const nameOf = (id: string) => state.characters[id]?.name ?? '???';

  return (
    <div className={styles.wrap}>
      {conflict && (
        <section className={styles.bar} aria-label={term('conflict')}>
          <div className={styles.head}>
            <span className={styles.kicker}>
              {conflict.kind === 'physical' ? '물리' : '정신'} {term('conflict')} · {conflict.round}
              라운드
            </span>
            {(() => {
              const current = state.characters[conflict.order[conflict.index] ?? ''];
              const mine = canControl(current);
              return (
                <span className={styles.actions}>
                  {mine && !isGm && <strong className={styles.yourTurn}>내 차례예요!</strong>}
                  {(isGm || mine) && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => void run({ type: 'conflict.next', payload: {} })}
                    >
                      다음 차례 →
                    </button>
                  )}
                  {isGm && (
                    <button
                      type="button"
                      className={styles.ghost}
                      disabled={pending}
                      onClick={() => void run({ type: 'conflict.end', payload: {} })}
                    >
                      갈등 끝내기
                    </button>
                  )}
                </span>
              );
            })()}
          </div>
          <ol className={styles.order}>
            {conflict.order.map((id, i) => {
              const c = state.characters[id];
              return (
                <li
                  key={id}
                  className={styles.turn}
                  data-current={i === conflict.index || undefined}
                  data-out={c?.takenOut || undefined}
                  data-npc={c?.isNpc || undefined}
                >
                  {c?.portraitUrl ? (
                    <img src={c.portraitUrl} alt="" />
                  ) : (
                    <span className={styles.initial}>{c?.name.slice(0, 1)}</span>
                  )}
                  <span>{c?.name ?? '???'}</span>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {contest && (
        <section className={styles.bar} aria-label={term('contest')}>
          <div className={styles.head}>
            <span className={styles.kicker}>
              {term('contest')} · 먼저 {CONTEST_VICTORIES_TO_WIN}승
            </span>
            {isGm && (
              <span className={styles.actions}>
                <label className={styles.check}>
                  <input
                    type="checkbox"
                    checked={twoWins}
                    onChange={(e) => setTwoWins(e.target.checked)}
                  />
                  {term('style')} (2승)
                </label>
                <button
                  type="button"
                  className={styles.ghost}
                  disabled={pending}
                  onClick={() => void run({ type: 'contest.end', payload: {} })}
                >
                  끝내기
                </button>
              </span>
            )}
          </div>
          <div className={styles.contest}>
            {contest.sides.map((id) => (
              <div key={id} className={styles.contestSide}>
                <span>{nameOf(id)}</span>
                <span className={styles.pips}>
                  {Array.from({ length: CONTEST_VICTORIES_TO_WIN }, (_, i) => (
                    <span key={i} data-on={(contest.victories[id] ?? 0) > i || undefined} />
                  ))}
                </span>
                {isGm && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      void run({
                        type: 'contest.exchange',
                        payload: { winnerId: id, victories: twoWins ? 2 : 1 },
                      })
                    }
                  >
                    이 쪽 승리
                  </button>
                )}
              </div>
            ))}
            {isGm && (
              <button
                type="button"
                className={styles.ghost}
                disabled={pending}
                onClick={() =>
                  void run({ type: 'contest.exchange', payload: { winnerId: null, victories: 1 } })
                }
              >
                무승부 (반전 요소)
              </button>
            )}
          </div>
        </section>
      )}

      {challenge && (
        <section className={styles.bar} aria-label={term('challenge')}>
          <div className={styles.head}>
            <span className={styles.kicker}>
              {term('challenge')} · {challenge.title}
            </span>
            {isGm && (
              <span className={styles.actions}>
                <button
                  type="button"
                  className={styles.ghost}
                  disabled={pending}
                  onClick={() => void run({ type: 'challenge.end', payload: {} })}
                >
                  끝내기
                </button>
              </span>
            )}
          </div>
          <ol className={styles.steps}>
            {challenge.steps.map((st, i) => (
              <li key={i} data-outcome={st.outcome}>
                <span>{st.label}</span>
                {isGm ? (
                  <select
                    value={st.outcome ?? ''}
                    disabled={pending}
                    onChange={(e) =>
                      void run({
                        type: 'challenge.step',
                        payload: { index: i, outcome: e.target.value as Outcome },
                      })
                    }
                  >
                    <option value="" disabled>
                      결과
                    </option>
                    {OUTCOMES.map((o) => (
                      <option key={o} value={o}>
                        {term(o)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <small>{st.outcome ? term(st.outcome) : '남음'}</small>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
