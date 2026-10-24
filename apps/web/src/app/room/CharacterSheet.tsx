'use client';

import { term } from '@fate/glossary';
import {
  ACTIONS,
  APPROACHES,
  CONSEQUENCE_SLOTS,
  formatRating,
  type Action,
  type Approach,
  type Character,
  type Command,
  type RoomEvent,
  type RoomState,
  type Stunt,
} from '@fate/rules-engine';
import { useState } from 'react';
import { AspectCard } from '@/components/aspect/AspectCard';
import { FatePointToken } from '@/components/fate/FatePointToken';
import styles from './CharacterSheet.module.css';
import { josa } from '@/lib/josa';
import { useClosing } from '@/lib/motion';

interface Props {
  character: Character;
  state: RoomState;
  run: (cmd: Command) => Promise<RoomEvent[]>;
  isGm: boolean;
  mine: boolean;
  pending: boolean;
  onClose: () => void;
  /** 스탠딩·표정·초상화 그리기 창 열기 */
  onArt: () => void;
}

const MILESTONE_LABEL = { minor: '작은', significant: '중요한', major: '큰' } as const;
const MILESTONE_HELP = {
  minor: '접근법 두 개의 값을 맞바꾸거나, 특기 하나를 바꾸거나, 특성 하나의 문구를 고칠 수 있어요.',
  significant: '작은 이정표에 더해, 접근법 하나를 +1 올리거나 특기를 하나 더 얻을 수 있어요.',
  major: '중요한 이정표에 더해, 핵심 컨셉도 고쳐 쓸 수 있어요.',
} as const;

/** 캐릭터 시트: 특성·접근법·특기·스트레스·후유증. 양보·회복·이정표 성장도 여기서 한다 */
export function CharacterSheet({
  character: c,
  state,
  run,
  isGm,
  mine,
  pending,
  onClose,
  onArt,
}: Props) {
  const [closing, close] = useClosing(onClose);
  const aspects = Object.values(state.aspects).filter(
    (a) => a.ownerType === 'character' && a.ownerId === c.id && (!a.hidden || isGm),
  );
  const owner = c.ownerId ? state.members[c.ownerId]?.nickname : undefined;
  const canEdit = isGm || mine;

  const [growing, setGrowing] = useState(false);
  const [draft, setDraft] = useState<Record<Approach, number>>(c.approaches);
  const [stunts, setStunts] = useState<Stunt[]>(c.stunts);
  const [stuntText, setStuntText] = useState('');
  const [stuntApproach, setStuntApproach] = useState<Approach>('careful');
  const [stuntAction, setStuntAction] = useState<Action>('overcome');
  const [editAspect, setEditAspect] = useState<string | null>(null);
  const [aspectText, setAspectText] = useState('');

  const changed =
    APPROACHES.some((a) => draft[a] !== c.approaches[a]) ||
    JSON.stringify(stunts) !== JSON.stringify(c.stunts);

  return (
    <div className={styles.backdrop} data-closing={closing || undefined} onClick={close}>
      <article
        className={styles.sheet}
        role="dialog"
        aria-label={`${c.name} 시트`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className={styles.head}>
          {(c.portraitUrl || c.standing?.neutral) && (
            <img className={styles.portrait} src={c.portraitUrl ?? c.standing!.neutral} alt="" />
          )}
          <div className={styles.title}>
            <h2>
              {c.name}
              {canEdit && (
                <button
                  type="button"
                  className={styles.art}
                  onClick={onArt}
                  title="스탠딩 · 표정 · 초상화 그리기"
                >
                  그림
                </button>
              )}
            </h2>
            <p>
              {c.isNpc ? 'NPC' : `플레이어 ${owner ?? ''}`}
              {c.takenOut && ` · ${term('takenOut')}`}
            </p>
            {!c.isNpc && (
              <p className={styles.fate}>
                {term('fatePoint')} <FatePointToken count={c.fatePoints} /> · {term('refresh')}{' '}
                {c.refresh}
                {isGm && (
                  <span className={styles.fateBtns}>
                    {[-1, 1].map((d) => (
                      <button
                        key={d}
                        type="button"
                        disabled={pending}
                        aria-label={`${term('fatePoint')} ${d > 0 ? '+1' : '−1'}`}
                        onClick={() =>
                          void run({ type: 'fate.adjust', payload: { target: c.id, delta: d } })
                        }
                      >
                        {d > 0 ? '+' : '−'}
                      </button>
                    ))}
                  </span>
                )}
              </p>
            )}
          </div>
          <button type="button" className={styles.close} onClick={close} aria-label="닫기">
            ×
          </button>
        </header>

        {c.milestone && (
          <div className={styles.milestone}>
            <strong>
              {MILESTONE_LABEL[c.milestone]} {term('milestone')}에 도달했어요!
            </strong>
            <p>{MILESTONE_HELP[c.milestone]}</p>
            {mine && !growing && (
              <button type="button" onClick={() => setGrowing(true)}>
                성장하기
              </button>
            )}
          </div>
        )}

        <section>
          <h3>{term('aspect')}</h3>
          <div className={styles.aspects}>
            {aspects.map((a) =>
              editAspect === a.id ? (
                <form
                  key={a.id}
                  className={styles.inlineForm}
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (aspectText.trim())
                      void run({
                        type: 'aspect.update',
                        payload: { aspectId: a.id, text: aspectText.trim() },
                      });
                    setEditAspect(null);
                  }}
                >
                  <input
                    autoFocus
                    value={aspectText}
                    maxLength={80}
                    onChange={(e) => setAspectText(e.target.value)}
                  />
                  <button type="submit" disabled={pending}>
                    고치기
                  </button>
                </form>
              ) : (
                <div key={a.id} className={styles.aspectRow}>
                  <AspectCard aspect={a} size="sm" />
                  {canEdit && a.kind !== 'consequence' && (
                    <button
                      type="button"
                      className={styles.mini}
                      onClick={() => {
                        setEditAspect(a.id);
                        setAspectText(a.text);
                      }}
                    >
                      고치기
                    </button>
                  )}
                  {(isGm || (mine && a.kind === 'boost')) && a.kind !== 'consequence' && (
                    <button
                      type="button"
                      className={styles.mini}
                      disabled={pending}
                      onClick={() =>
                        void run({ type: 'aspect.remove', payload: { aspectId: a.id } })
                      }
                    >
                      지우기
                    </button>
                  )}
                </div>
              ),
            )}
          </div>
        </section>

        <section>
          <h3>{term('approach')}</h3>
          <ul className={styles.approaches}>
            {APPROACHES.map((a) => (
              <li key={a}>
                <span>{term(a)}</span>
                {growing ? (
                  <span className={styles.stepper}>
                    <button
                      type="button"
                      onClick={() => setDraft({ ...draft, [a]: Math.max(0, draft[a] - 1) })}
                    >
                      −
                    </button>
                    <b>{draft[a]}</b>
                    <button
                      type="button"
                      onClick={() => setDraft({ ...draft, [a]: Math.min(5, draft[a] + 1) })}
                    >
                      +
                    </button>
                  </span>
                ) : (
                  <b title={formatRating(c.approaches[a])}>
                    {c.approaches[a] >= 0 ? '+' : ''}
                    {c.approaches[a]}
                  </b>
                )}
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h3>{term('stunt')}</h3>
          {(growing ? stunts : c.stunts).length === 0 && <p className={styles.muted}>없음</p>}
          <ul className={styles.stunts}>
            {(growing ? stunts : c.stunts).map((s) => (
              <li key={s.id} data-used={s.usedThisSession || undefined}>
                <span>
                  {s.text}
                  {s.bonus && (
                    <small>
                      {' '}
                      ({term(s.bonus.approach)} · {term(s.bonus.action)} +2)
                    </small>
                  )}
                  {s.kind === 'once_per_session' && <small> · 세션당 1회</small>}
                </span>
                {growing && (
                  <button
                    type="button"
                    className={styles.mini}
                    onClick={() => setStunts(stunts.filter((x) => x.id !== s.id))}
                  >
                    빼기
                  </button>
                )}
              </li>
            ))}
          </ul>
          {growing && (
            <form
              className={styles.stuntForm}
              onSubmit={(e) => {
                e.preventDefault();
                if (!stuntText.trim()) return;
                setStunts([
                  ...stunts,
                  {
                    id: crypto.randomUUID().slice(0, 8),
                    text: stuntText.trim(),
                    kind: 'bonus',
                    bonus: { approach: stuntApproach, action: stuntAction, value: 2 },
                  },
                ]);
                setStuntText('');
              }}
            >
              <input
                placeholder="새 특기 (예: 칼날 같은 혀)"
                value={stuntText}
                maxLength={80}
                onChange={(e) => setStuntText(e.target.value)}
              />
              <select
                value={stuntApproach}
                onChange={(e) => setStuntApproach(e.target.value as Approach)}
              >
                {APPROACHES.map((a) => (
                  <option key={a} value={a}>
                    {term(a)}
                  </option>
                ))}
              </select>
              <select
                value={stuntAction}
                onChange={(e) => setStuntAction(e.target.value as Action)}
              >
                {ACTIONS.map((a) => (
                  <option key={a} value={a}>
                    {term(a)}
                  </option>
                ))}
              </select>
              <button type="submit">추가</button>
            </form>
          )}
          {growing && (
            <div className={styles.row}>
              <button
                type="button"
                className={styles.ghost}
                onClick={() => {
                  setGrowing(false);
                  setDraft(c.approaches);
                  setStunts(c.stunts);
                }}
              >
                취소
              </button>
              <button
                type="button"
                className={styles.primary}
                disabled={pending || !changed}
                onClick={() => {
                  void run({
                    type: 'character.update',
                    payload: { id: c.id, patch: { approaches: draft, stunts } },
                  }).then((evs) => {
                    if (evs.length) setGrowing(false);
                  });
                }}
              >
                성장 확정
              </button>
            </div>
          )}
        </section>

        <section>
          <h3>
            {term('stress')} · {term('consequence')}
          </h3>
          <div className={styles.stress}>
            {c.stress.map((used, i) => (
              <span key={i} data-used={used || undefined}>
                {i + 1}
              </span>
            ))}
          </div>
          <ul className={styles.cons}>
            {CONSEQUENCE_SLOTS.map((slot) => {
              const cur = c.consequences[slot];
              const asp = cur ? state.aspects[cur.aspectId] : undefined;
              return (
                <li key={slot} data-filled={!!cur || undefined}>
                  <span className={styles.slot}>
                    {term(slot)} <small>−{slot === 'mild' ? 2 : slot === 'moderate' ? 4 : 6}</small>
                  </span>
                  <span className={styles.consText}>
                    {asp?.text ?? (cur ? '후유증' : '비어 있음')}
                    {cur?.recovering && <small> · 회복 중</small>}
                  </span>
                  {cur && !cur.recovering && canEdit && (
                    <button
                      type="button"
                      className={styles.mini}
                      disabled={pending}
                      onClick={() =>
                        void run({
                          type: 'consequence.startRecovery',
                          payload: { characterId: c.id, slot },
                        })
                      }
                    >
                      회복 시작
                    </button>
                  )}
                  {cur && isGm && (
                    <button
                      type="button"
                      className={styles.mini}
                      disabled={pending}
                      onClick={() =>
                        void run({
                          type: 'consequence.clear',
                          payload: { characterId: c.id, slot },
                        })
                      }
                    >
                      지우기
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        {(canEdit || isGm) && (
          <footer className={styles.footer}>
            {canEdit && state.conflict && !c.takenOut && (
              <button
                type="button"
                className={styles.ghost}
                disabled={pending}
                title="지기로 하고 장면에서 빠져요. 운명점을 받아요."
                onClick={() => {
                  if (window.confirm(`${josa(c.name, '이/가')} ${term('concede')}할까요?`))
                    void run({ type: 'character.concede', payload: { characterId: c.id } });
                }}
              >
                {term('concede')}하기
              </button>
            )}
            {isGm && !c.isNpc && (
              <span className={styles.row}>
                {term('milestone')} 주기
                {(['minor', 'significant', 'major'] as const).map((size) => (
                  <button
                    key={size}
                    type="button"
                    className={styles.mini}
                    disabled={pending}
                    onClick={() =>
                      void run({
                        type: 'milestone.grant',
                        payload: { characterIds: [c.id], size },
                      })
                    }
                  >
                    {MILESTONE_LABEL[size]}
                  </button>
                ))}
              </span>
            )}
          </footer>
        )}
      </article>
    </div>
  );
}
