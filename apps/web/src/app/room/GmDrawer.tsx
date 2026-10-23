'use client';

import { term } from '@fate/glossary';
import {
  APPROACHES,
  type Approach,
  type Aspect,
  type Command,
  type RoomEvent,
  type RoomState,
} from '@fate/rules-engine';
import { useState } from 'react';
import { FatePointToken } from '@/components/fate/FatePointToken';
import styles from './room.module.css';

interface Props {
  state: RoomState;
  run: (cmd: Command) => Promise<RoomEvent[]>;
  hiddenAspects: Aspect[];
  pending: boolean;
  /** 가장 최근에 되돌릴 수 있는 기록 */
  lastUndoable: { seq: number; text: string } | null;
  notes: string[];
}

type Kind = 'physical' | 'mental';

/** GM 도구: 장면, 이야기, 특성, NPC, 운명점, 강요 */
export function GmDrawer({ state, run, hiddenAspects, pending, lastUndoable, notes }: Props) {
  const pcs = Object.values(state.characters).filter((c) => !c.isNpc);
  const everyone = Object.values(state.characters).filter((c) => !c.takenOut);

  // 갈등 · 경합 · 도전
  const [kind, setKind] = useState<Kind>('physical');
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const inConflict = everyone.filter((c) => picked[c.id] ?? true);
  const [sideA, setSideA] = useState('');
  const [sideB, setSideB] = useState('');
  const [chTitle, setChTitle] = useState('');
  const [chSteps, setChSteps] = useState('');
  // 메모
  const [note, setNote] = useState('');

  // 장면
  const [sceneName, setSceneName] = useState('');
  const [sceneAspects, setSceneAspects] = useState(['', '', '']);
  // 이야기
  const [narration, setNarration] = useState('');
  // 특성
  const [aspectText, setAspectText] = useState('');
  const [aspectHidden, setAspectHidden] = useState(false);
  // NPC
  const [npcName, setNpcName] = useState('');
  const [npcHigh, setNpcHigh] = useState('');
  const [npcBest, setNpcBest] = useState<Approach>('forceful');
  // 강요
  const [compelTarget, setCompelTarget] = useState('');
  const [compelAspect, setCompelAspect] = useState('');
  const [compelText, setCompelText] = useState('');
  const compelAspects = Object.values(state.aspects).filter(
    (a) => !a.hidden && (a.ownerId === compelTarget || a.ownerType !== 'character'),
  );

  return (
    <section className={styles.gm} aria-label="GM 도구">
      <div className={styles.panelHead}>GM 도구</div>

      <details open={!state.scene}>
        <summary>장면</summary>
        {state.scene ? (
          <button
            type="button"
            className={styles.ghost}
            disabled={pending}
            onClick={() => void run({ type: 'scene.end', payload: {} })}
          >
            「{state.scene.name}」 끝내기
          </button>
        ) : (
          <form
            className={styles.form}
            onSubmit={(e) => {
              e.preventDefault();
              void run({
                type: 'scene.start',
                payload: {
                  name: sceneName.trim(),
                  aspects: sceneAspects
                    .map((t) => t.trim())
                    .filter(Boolean)
                    .map((text) => ({ text, hidden: false })),
                },
              });
              setSceneName('');
              setSceneAspects(['', '', '']);
            }}
          >
            <input
              placeholder="장면 이름 (예: 불타는 곡물 창고)"
              value={sceneName}
              maxLength={60}
              onChange={(e) => setSceneName(e.target.value)}
            />
            {sceneAspects.map((v, i) => (
              <input
                key={i}
                placeholder={`${term('situation')} ${i + 1} (선택)`}
                value={v}
                maxLength={80}
                onChange={(e) =>
                  setSceneAspects((x) => x.map((t, j) => (j === i ? e.target.value : t)))
                }
              />
            ))}
            <button type="submit" disabled={pending || !sceneName.trim() || !state.session}>
              장면 시작
            </button>
          </form>
        )}
      </details>

      <details>
        <summary>이야기 들려주기</summary>
        <form
          className={styles.form}
          onSubmit={(e) => {
            e.preventDefault();
            void run({ type: 'narration.post', payload: { text: narration.trim() } });
            setNarration('');
          }}
        >
          <textarea
            rows={3}
            placeholder="장면을 묘사해 주세요. 아래 대사 창에 크게 나와요."
            value={narration}
            onChange={(e) => setNarration(e.target.value)}
          />
          <button type="submit" disabled={pending || !narration.trim()}>
            보내기
          </button>
        </form>
      </details>

      <details>
        <summary>{term('aspect')} 추가 · 공개</summary>
        <form
          className={styles.form}
          onSubmit={(e) => {
            e.preventDefault();
            if (!state.scene) return;
            void run({
              type: 'aspect.add',
              payload: {
                ownerType: 'scene',
                ownerId: state.scene.id,
                kind: 'situation',
                text: aspectText.trim(),
                freeInvokes: 0,
                hidden: aspectHidden,
              },
            });
            setAspectText('');
          }}
        >
          <input
            placeholder={`새 ${term('situation')}`}
            value={aspectText}
            maxLength={80}
            onChange={(e) => setAspectText(e.target.value)}
          />
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={aspectHidden}
              onChange={(e) => setAspectHidden(e.target.checked)}
            />
            숨겨 두기 (발견되면 공개)
          </label>
          <button type="submit" disabled={pending || !aspectText.trim() || !state.scene}>
            추가
          </button>
        </form>
        {hiddenAspects.map((a) => (
          <button
            key={a.id}
            type="button"
            className={styles.ghost}
            onClick={() => void run({ type: 'aspect.reveal', payload: { aspectId: a.id } })}
          >
            공개: 「{a.text}」
          </button>
        ))}
      </details>

      <details>
        <summary>NPC 만들기</summary>
        <form
          className={styles.form}
          onSubmit={(e) => {
            e.preventDefault();
            const approaches = Object.fromEntries(
              APPROACHES.map((a) => [a, a === npcBest ? 2 : 0]),
            ) as Record<Approach, number>;
            void run({
              type: 'character.create',
              payload: {
                name: npcName.trim(),
                isNpc: true,
                approaches,
                stunts: [],
                highConcept: npcHigh.trim(),
                aspects: [],
              },
            });
            setNpcName('');
            setNpcHigh('');
          }}
        >
          <input
            placeholder="이름"
            value={npcName}
            maxLength={40}
            onChange={(e) => setNpcName(e.target.value)}
          />
          <input
            placeholder={term('high')}
            value={npcHigh}
            maxLength={80}
            onChange={(e) => setNpcHigh(e.target.value)}
          />
          <label className={styles.inline}>
            잘하는 {term('approach')} (+2)
            <select value={npcBest} onChange={(e) => setNpcBest(e.target.value as Approach)}>
              {APPROACHES.map((a) => (
                <option key={a} value={a}>
                  {term(a)}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={pending || !npcName.trim() || !npcHigh.trim()}>
            만들기
          </button>
        </form>
      </details>

      <details>
        <summary>{term('fatePoint')}</summary>
        <p className={styles.muted}>
          GM 풀 <FatePointToken count={state.gmPool} />
        </p>
        <ul className={styles.fateList}>
          {pcs.map((c) => (
            <li key={c.id}>
              <span>{c.name}</span>
              <FatePointToken count={c.fatePoints} />
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  void run({ type: 'fate.adjust', payload: { target: c.id, delta: -1 } })
                }
              >
                −
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  void run({ type: 'fate.adjust', payload: { target: c.id, delta: 1 } })
                }
              >
                +
              </button>
            </li>
          ))}
        </ul>
      </details>

      <details>
        <summary>{term('compel')}</summary>
        <form
          className={styles.form}
          onSubmit={(e) => {
            e.preventDefault();
            void run({
              type: 'compel.offer',
              payload: { aspectId: compelAspect, targetId: compelTarget, text: compelText.trim() },
            });
            setCompelText('');
          }}
        >
          <select value={compelTarget} onChange={(e) => setCompelTarget(e.target.value)}>
            <option value="">누구에게</option>
            {pcs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select value={compelAspect} onChange={(e) => setCompelAspect(e.target.value)}>
            <option value="">어떤 {term('aspect')}으로</option>
            {compelAspects.map((a) => (
              <option key={a.id} value={a.id}>
                {a.text}
              </option>
            ))}
          </select>
          <input
            placeholder="무슨 일이 꼬이나요?"
            value={compelText}
            maxLength={200}
            onChange={(e) => setCompelText(e.target.value)}
          />
          <button
            type="submit"
            disabled={pending || !compelTarget || !compelAspect || !compelText.trim()}
          >
            {term('compel')} 걸기
          </button>
        </form>
      </details>

      <details>
        <summary>
          {term('conflict')} · {term('contest')} · {term('challenge')}
        </summary>
        {state.conflict ? (
          <p className={styles.muted}>
            {term('conflict')} 진행 중이에요. 위쪽 띠에서 차례를 넘겨요.
          </p>
        ) : (
          <form
            className={styles.form}
            onSubmit={(e) => {
              e.preventDefault();
              void run({
                type: 'conflict.start',
                payload: { kind, participantIds: inConflict.map((c) => c.id) },
              });
            }}
          >
            <label className={styles.inline}>
              종류
              <select value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
                <option value="physical">물리 (신속 순)</option>
                <option value="mental">정신 (신중 순)</option>
              </select>
            </label>
            {everyone.map((c) => (
              <label key={c.id} className={styles.check}>
                <input
                  type="checkbox"
                  checked={picked[c.id] ?? true}
                  onChange={(e) => setPicked({ ...picked, [c.id]: e.target.checked })}
                />
                {c.name}
                {c.isNpc ? ' (NPC)' : ''}
              </label>
            ))}
            <button type="submit" disabled={pending || inConflict.length < 2}>
              {term('conflict')} 시작
            </button>
          </form>
        )}

        {!state.contest && (
          <form
            className={styles.form}
            onSubmit={(e) => {
              e.preventDefault();
              void run({ type: 'contest.start', payload: { sides: [sideA, sideB] } });
            }}
          >
            <div className={styles.inline}>{term('contest')} (먼저 3승)</div>
            <select value={sideA} onChange={(e) => setSideA(e.target.value)}>
              <option value="">한쪽</option>
              {everyone.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select value={sideB} onChange={(e) => setSideB(e.target.value)}>
              <option value="">다른 쪽</option>
              {everyone
                .filter((c) => c.id !== sideA)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
            <button type="submit" disabled={pending || !sideA || !sideB || sideA === sideB}>
              {term('contest')} 시작
            </button>
          </form>
        )}

        {!state.challenge && (
          <form
            className={styles.form}
            onSubmit={(e) => {
              e.preventDefault();
              const steps = chSteps
                .split('\n')
                .map((t) => t.trim())
                .filter(Boolean)
                .slice(0, 8);
              void run({ type: 'challenge.start', payload: { title: chTitle.trim(), steps } });
              setChTitle('');
              setChSteps('');
            }}
          >
            <div className={styles.inline}>{term('challenge')}</div>
            <input
              placeholder="무엇을 해내야 하나요? (예: 무너지는 다리 건너기)"
              value={chTitle}
              maxLength={80}
              onChange={(e) => setChTitle(e.target.value)}
            />
            <textarea
              rows={3}
              placeholder={'단계를 한 줄에 하나씩\n밧줄 고정하기\n아이들 먼저 보내기'}
              value={chSteps}
              onChange={(e) => setChSteps(e.target.value)}
            />
            <button type="submit" disabled={pending || !chTitle.trim() || !chSteps.trim()}>
              {term('challenge')} 시작
            </button>
          </form>
        )}
      </details>

      <details>
        <summary>되돌리기 · 메모</summary>
        <button
          type="button"
          className={styles.ghost}
          disabled={pending || !lastUndoable}
          onClick={() =>
            lastUndoable &&
            void run({ type: 'event.undo', payload: { targetSeq: lastUndoable.seq } })
          }
        >
          ↶ 마지막 기록 되돌리기{lastUndoable ? `: ${lastUndoable.text.slice(0, 30)}` : ''}
        </button>
        <p className={styles.muted}>기록 줄에 마우스를 올려 ↶를 눌러도 돼요.</p>
        <form
          className={styles.form}
          onSubmit={(e) => {
            e.preventDefault();
            void run({ type: 'gm.note', payload: { text: note.trim() } });
            setNote('');
          }}
        >
          <textarea
            rows={2}
            placeholder="나만 보는 메모 (플레이어에게 안 보여요)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <button type="submit" disabled={pending || !note.trim()}>
            메모 남기기
          </button>
        </form>
        {notes.length > 0 && (
          <ul className={styles.notes}>
            {notes.slice(-5).map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        )}
      </details>

      <details>
        <summary>세션</summary>
        {state.session ? (
          <button
            type="button"
            className={styles.ghost}
            disabled={pending}
            onClick={() => void run({ type: 'session.end', payload: {} })}
          >
            세션 {state.session.number} 끝내기
          </button>
        ) : (
          <button
            type="button"
            className={styles.ghost}
            disabled={pending}
            onClick={() => void run({ type: 'session.start', payload: {} })}
          >
            새 세션 시작 ({term('fatePoint')} {term('refresh')})
          </button>
        )}
      </details>
    </section>
  );
}
