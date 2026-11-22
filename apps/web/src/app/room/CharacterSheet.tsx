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
import { Leaf } from '@/components/book/Leaf';
import { CopyButton } from '@/components/ui/CopyButton';
import { characterToText } from '@/lib/sheetText';
import { npcFromCharacter, saveNpc } from '@/lib/gmLibrary';
import { draftFromCharacter, findMyCharacter, saveMyCharacter } from '@/lib/myCharacters';
import styles from './CharacterSheet.module.css';
import { josa } from '@/lib/josa';
import { playSfx } from '@/fx/sfx';

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
  minor:
    '접근법 두 개 값 맞바꾸기, 핵심 컨셉 말고 특성 하나 고쳐 쓰기, 특기 하나 바꾸기, 새 특기 얻기(4개째부터 재충전 −1) 중 하나',
  significant: '작은 이정표에 더해 접근법 하나 +1',
  major: '중요한 이정표에 더해 핵심 컨셉도 고쳐 쓰기 가능',
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
  const aspects = Object.values(state.aspects).filter(
    (a) => a.ownerType === 'character' && a.ownerId === c.id && (!a.hidden || isGm),
  );
  const owner = c.ownerId ? state.members[c.ownerId]?.nickname : undefined;
  const canEdit = isGm || mine;
  const highConcept = aspects.find((a) => a.kind === 'high')?.text;
  const best = Math.max(...APPROACHES.map((a) => c.approaches[a]));

  const [growing, setGrowing] = useState(false);
  const [draft, setDraft] = useState<Record<Approach, number>>(c.approaches);
  const [stunts, setStunts] = useState<Stunt[]>(c.stunts);
  const [stuntText, setStuntText] = useState('');
  const [stuntApproach, setStuntApproach] = useState<Approach>('careful');
  const [stuntAction, setStuntAction] = useState<Action>('overcome');
  const [editAspect, setEditAspect] = useState<string | null>(null);
  const [aspectText, setAspectText] = useState('');
  /** 보관함 저장: 플레이어는 내 캐릭터 보관함(성장 반영), GM은 NPC 보관함 */
  const [keepState, setKeepState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const keep = async () => {
    setKeepState('saving');
    try {
      const all = Object.values(state.aspects);
      if (c.isNpc) await saveNpc(npcFromCharacter(c, all));
      else {
        const base = c.sourceKey ? await findMyCharacter(c.sourceKey) : null;
        saveMyCharacter(draftFromCharacter(c, all, base));
      }
      setKeepState('saved');
    } catch {
      setKeepState('failed');
    }
  };
  /** 자발적 강요를 적는 중인 특성 */
  const [compelOn, setCompelOn] = useState<string | null>(null);
  const [compelText, setCompelText] = useState('');
  const compelWaiting = Object.values(state.compels).some((x) => x.targetId === c.id);
  const canPropose = mine && !c.isNpc && !compelWaiting;
  /** 지나온 이야기를 고치는 중이면 그 글 */
  const [story, setStory] = useState<string | null>(null);

  const changed =
    APPROACHES.some((a) => draft[a] !== c.approaches[a]) ||
    JSON.stringify(stunts) !== JSON.stringify(c.stunts);

  const dirty =
    changed ||
    !!stuntText.trim() ||
    editAspect !== null ||
    (story !== null && story.trim() !== (c.backstory ?? ''));

  return (
    <Leaf
      label={`${c.name} 시트`}
      kicker={c.isNpc ? 'NPC 시트' : '캐릭터 시트'}
      title={c.name}
      onClose={onClose}
      dirty={dirty}
      aside={
        <span className={styles.asideBtns}>
          <CopyButton
            className={styles.art}
            title="시트 내용을 클립보드에 글로 복사"
            getText={() => characterToText(c, aspects)}
          />
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
          {((mine && !c.isNpc) || (isGm && c.isNpc)) && (
            <button
              type="button"
              className={styles.art}
              disabled={keepState === 'saving'}
              onClick={() => void keep()}
              title={
                c.isNpc
                  ? '이 NPC를 GM 보관함에 저장해 다른 방에서도 꺼내 쓰기'
                  : c.sourceKey
                    ? '이 방에서 자란 모습(접근법·특기·특성)을 내 캐릭터 보관함에 덮어쓰기'
                    : '이 캐릭터를 내 캐릭터 보관함에 저장'
              }
            >
              {keepState === 'saved'
                ? '저장됨 ✓'
                : keepState === 'failed'
                  ? '저장 실패'
                  : c.isNpc
                    ? 'NPC 보관'
                    : '보관함에 저장'}
            </button>
          )}
        </span>
      }
    >
      <div className={styles.head}>
        {(c.portraitUrl || c.standing?.neutral) && (
          <img className={styles.portrait} src={c.portraitUrl ?? c.standing!.neutral} alt="" />
        )}
        <dl className={styles.meta}>
          <div>
            <dt>{c.isNpc ? '진행' : '플레이어'}</dt>
            <dd>
              {c.isNpc ? 'GM' : (owner ?? '—')}
              {c.takenOut && <span className={styles.out}> · {term('takenOut')}</span>}
            </dd>
          </div>
          {highConcept && (
            <div>
              <dt>{term('high')}</dt>
              <dd className={styles.concept}>{highConcept}</dd>
            </div>
          )}
          {!c.isNpc && (
            <div>
              <dt>{term('fatePoint')}</dt>
              <dd className={styles.fate}>
                <FatePointToken count={c.fatePoints} />
                <small>
                  {term('refresh')} {c.refresh}
                </small>
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
              </dd>
            </div>
          )}
        </dl>
      </div>

      {c.milestone && (
        <div className={styles.milestone}>
          <strong>
            {MILESTONE_LABEL[c.milestone]} {term('milestone')} 도달
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
        <ul className={styles.aspects}>
          {aspects.map((a) =>
            editAspect === a.id ? (
              <li key={a.id}>
                <form
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
                    aria-label={`${term('aspect')} 문구`}
                    value={aspectText}
                    maxLength={80}
                    onChange={(e) => setAspectText(e.target.value)}
                  />
                  <span className={styles.row}>
                    <button
                      type="button"
                      className={styles.ghost}
                      onClick={() => setEditAspect(null)}
                    >
                      취소
                    </button>
                    <button type="submit" className={styles.primary} disabled={pending}>
                      고치기
                    </button>
                  </span>
                </form>
              </li>
            ) : (
              <li key={a.id} className={styles.aspectItem}>
                <AspectCard aspect={a} size="sm" />
                {compelOn === a.id && (
                  <form
                    className={styles.inlineForm}
                    onSubmit={(e) => {
                      e.preventDefault();
                      const text = compelText.trim();
                      if (!text) return;
                      void run({
                        type: 'compel.propose',
                        payload: { aspectId: a.id, characterId: c.id, text },
                      }).then((evs) => {
                        if (evs.length) {
                          setCompelOn(null);
                          setCompelText('');
                        }
                      });
                    }}
                  >
                    <input
                      autoFocus
                      aria-label={`${term('compel')} 상황`}
                      placeholder="이 특성 때문에 어떻게 꼬일까?"
                      value={compelText}
                      maxLength={200}
                      onChange={(e) => setCompelText(e.target.value)}
                    />
                    <span className={styles.row}>
                      <button type="submit" disabled={!compelText.trim() || pending}>
                        GM에게 제안
                      </button>
                      <button type="button" onClick={() => setCompelOn(null)}>
                        그만두기
                      </button>
                    </span>
                  </form>
                )}
                {(canEdit || isGm) && a.kind !== 'consequence' && (
                  <span className={styles.cardTools}>
                    {canPropose && compelOn !== a.id && (
                      <button
                        type="button"
                        title={`이 특성으로 일이 꼬이게 하고 ${term('fatePoint')} +1 받기 (GM이 정함)`}
                        onClick={() => {
                          setCompelOn(a.id);
                          setCompelText('');
                        }}
                      >
                        {term('compel')} 제안
                      </button>
                    )}
                    {canEdit && (
                      <button
                        type="button"
                        aria-label={`"${a.text}" 고치기`}
                        title="고치기"
                        onClick={() => {
                          setEditAspect(a.id);
                          setAspectText(a.text);
                        }}
                      >
                        고치기
                      </button>
                    )}
                    {(isGm || (mine && a.kind === 'boost')) && (
                      <button
                        type="button"
                        aria-label={`"${a.text}" 지우기`}
                        title="지우기"
                        disabled={pending}
                        onClick={() =>
                          void run({ type: 'aspect.remove', payload: { aspectId: a.id } })
                        }
                      >
                        지우기
                      </button>
                    )}
                  </span>
                )}
              </li>
            ),
          )}
        </ul>
      </section>

      <section>
        <h3>{term('approach')}</h3>
        <ul className={styles.approaches}>
          {APPROACHES.map((a) => (
            <li key={a} data-best={c.approaches[a] === best || undefined}>
              <span>{term(a)}</span>
              {growing ? (
                <span className={styles.stepper}>
                  <button
                    type="button"
                    onClick={() => {
                      playSfx('paper-tap', undefined, 0.9);
                      setDraft({ ...draft, [a]: Math.max(0, draft[a] - 1) });
                    }}
                  >
                    −
                  </button>
                  <b>{draft[a]}</b>
                  <button
                    type="button"
                    onClick={() => {
                      playSfx('paper-tap', undefined, 1.1);
                      setDraft({ ...draft, [a]: Math.min(5, draft[a] + 1) });
                    }}
                  >
                    +
                  </button>
                </span>
              ) : (
                <b title={formatRating(c.approaches[a])}>
                  {c.approaches[a] >= 0 ? '+' : ''}
                  {c.approaches[a]}
                  <small>{formatRating(c.approaches[a]).split(' ')[0]}</small>
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
            <select value={stuntAction} onChange={(e) => setStuntAction(e.target.value as Action)}>
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
        <div className={styles.stress} aria-label={term('stress')}>
          {c.stress.map((used, i) => (
            <span
              key={i}
              data-used={used || undefined}
              aria-label={`${i + 1}번 칸 ${used ? '참' : '비어 있음'}`}
            >
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

      <section>
        <h3>
          지나온 이야기
          {canEdit && story === null && (
            <button
              type="button"
              className={styles.mini}
              onClick={() => setStory(c.backstory ?? '')}
            >
              {c.backstory ? '고치기' : '적기'}
            </button>
          )}
        </h3>
        {story !== null ? (
          <form
            className={styles.storyForm}
            onSubmit={(e) => {
              e.preventDefault();
              void run({
                type: 'character.update',
                payload: { id: c.id, patch: { backstory: story.trim() } },
              }).then((evs) => {
                if (evs.length) setStory(null);
              });
            }}
          >
            <textarea
              autoFocus
              aria-label="지나온 이야기"
              value={story}
              maxLength={4000}
              rows={6}
              placeholder="어디서 왔고, 무엇을 잃었고, 왜 지금 여기 있는지"
              onChange={(e) => setStory(e.target.value)}
            />
            <span className={styles.row}>
              <small className={styles.count}>{story.length} / 4000</small>
              <button type="button" className={styles.ghost} onClick={() => setStory(null)}>
                취소
              </button>
              <button type="submit" className={styles.primary} disabled={pending}>
                저장
              </button>
            </span>
          </form>
        ) : c.backstory ? (
          <p className={styles.story}>{c.backstory}</p>
        ) : (
          <p className={styles.muted}>{canEdit ? '아직 적지 않음' : '없음'}</p>
        )}
      </section>

      {(canEdit || isGm) && (
        <footer className={styles.footer}>
          {canEdit && state.conflict && !c.takenOut && (
            <button
              type="button"
              className={styles.ghost}
              disabled={pending}
              title="지기로 하고 장면에서 빠진다. 운명점을 받는다."
              onClick={() => {
                if (
                  window.confirm(
                    `${josa(c.name, '이/가')} ${term('concede')}한다. 확인을 누르면 진행`,
                  )
                )
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
    </Leaf>
  );
}
