'use client';

import { term } from '@fate/glossary';
import {
  APPROACHES,
  type Approach,
  type Command,
  type RoomEvent,
  type RoomState,
} from '@fate/rules-engine';
import { useState, type ReactNode } from 'react';
import { AspectCard } from '@/components/aspect/AspectCard';
import { FatePointToken } from '@/components/fate/FatePointToken';
import { CloseGuardScope, useCloseGuard } from '@/components/ui/closeGuard';
import { useClosing } from '@/lib/motion';
import styles from './GmConsole.module.css';

type Run = (cmd: Command) => Promise<RoomEvent[]>;

export type GmTool = 'scene' | 'aspect' | 'npc' | 'conflict' | 'compel' | 'note' | 'session';
export interface GmOpen {
  tool: GmTool;
  /** 강요: 무대 특성 카드에서 눌렀을 때 미리 고른 특성 */
  aspectId?: string;
}

const TOOLS: ReadonlyArray<readonly [GmTool, string, string]> = [
  ['scene', '장면', '장면을 열고 닫아요'],
  ['aspect', term('aspect'), '장면 특성을 붙이거나 숨겨 둔 걸 공개해요'],
  ['npc', 'NPC', '적이나 조연을 바로 만들어요'],
  ['conflict', '갈등·경합', '차례가 있는 싸움, 3승 겨루기, 여러 단계 도전'],
  ['compel', term('compel'), '특성 때문에 일이 꼬이게 하고 운명점을 줘요'],
  ['note', '메모', '나만 보는 메모'],
  ['session', '세션', '세션을 열고 닫아요. 열면 운명점이 다시 채워져요'],
];

/** 화면 위쪽 GM 버튼 줄. 자주 쓰는 일은 한 번에, 나머지는 큰 창으로 */
export function GmBar({
  state,
  run,
  pending,
  lastUndoable,
  onOpen,
  onArt,
}: {
  state: RoomState;
  run: Run;
  pending: boolean;
  lastUndoable: { seq: number; text: string } | null;
  onOpen: (o: GmOpen) => void;
  onArt: () => void;
}) {
  return (
    <nav className={styles.bar} aria-label="GM 도구">
      <span className={styles.badge}>GM</span>
      {TOOLS.map(([tool, label, hint]) => (
        <button
          key={tool}
          type="button"
          className={styles.tool}
          title={hint}
          data-attention={(tool === 'scene' && !state.scene) || undefined}
          onClick={() => onOpen({ tool })}
        >
          {label}
        </button>
      ))}
      <button
        type="button"
        className={styles.tool}
        title="장면 배경 · 스탠딩과 표정 · 초상화를 그려요"
        onClick={onArt}
      >
        그림
      </button>
      <span className={styles.spacer} />
      <span className={styles.pool} title="GM 운명점 풀 (NPC가 써요)">
        GM 풀 <FatePointToken count={state.gmPool} />
        <button
          type="button"
          aria-label="GM 풀 −1"
          disabled={pending || state.gmPool === 0}
          onClick={() =>
            void run({ type: 'fate.adjust', payload: { target: 'gm_pool', delta: -1 } })
          }
        >
          −
        </button>
        <button
          type="button"
          aria-label="GM 풀 +1"
          disabled={pending}
          onClick={() =>
            void run({ type: 'fate.adjust', payload: { target: 'gm_pool', delta: 1 } })
          }
        >
          +
        </button>
      </span>
      <button
        type="button"
        className={styles.undo}
        disabled={pending || !lastUndoable}
        title={lastUndoable ? `되돌리기: ${lastUndoable.text}` : '되돌릴 기록이 없어요'}
        onClick={() =>
          lastUndoable && void run({ type: 'event.undo', payload: { targetSeq: lastUndoable.seq } })
        }
      >
        ↶ 되돌리기
      </button>
    </nav>
  );
}

/** 장면 만들기 폼. 세션이 없으면 세션부터 연다 */
function SceneForm({
  state,
  run,
  pending,
  onDone,
  submitLabel = '장면 시작',
}: {
  state: RoomState;
  run: Run;
  pending: boolean;
  onDone?: () => void;
  submitLabel?: string;
}) {
  const [name, setName] = useState('');
  const [aspects, setAspects] = useState(['', '', '']);
  return (
    <form
      className={styles.form}
      onSubmit={async (e) => {
        e.preventDefault();
        if (!state.session) {
          const started = await run({ type: 'session.start', payload: {} });
          if (!started.length) return;
        }
        const evs = await run({
          type: 'scene.start',
          payload: {
            name: name.trim(),
            aspects: aspects
              .map((t) => t.trim())
              .filter(Boolean)
              .map((text) => ({ text, hidden: false })),
          },
        });
        if (evs.length) {
          setName('');
          setAspects(['', '', '']);
          onDone?.();
        }
      }}
    >
      <label className={styles.field}>
        장면 이름
        <input
          autoFocus
          placeholder="예: 불타는 곡물 창고"
          value={name}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <div className={styles.field}>
        {term('situation')} <small>(선택 · 장면에 놓인 사실 한 줄씩)</small>
        {aspects.map((v, i) => (
          <input
            key={i}
            placeholder={['짙은 안개', '미끄러운 갑판', '겁먹은 구경꾼들'][i]}
            value={v}
            maxLength={80}
            onChange={(e) => setAspects((x) => x.map((t, j) => (j === i ? e.target.value : t)))}
          />
        ))}
      </div>
      <button type="submit" className={styles.primary} disabled={pending || !name.trim()}>
        {submitLabel}
        {!state.session && ' (세션도 같이 시작)'}
      </button>
    </form>
  );
}

/** 장면이 없을 때 가운데에 뜨는 카드 */
export function SceneStarter({
  state,
  run,
  pending,
  isGm,
}: {
  state: RoomState;
  run: Run;
  pending: boolean;
  isGm: boolean;
}) {
  if (!isGm)
    return (
      <div className={styles.starter}>
        <h2>GM이 장면을 준비하고 있어요</h2>
        <p>장면이 열리면 여기서 굴림과 지도가 보여요.</p>
      </div>
    );
  return (
    <div className={styles.starter}>
      <h2>첫 장면을 열어 볼까요?</h2>
      <p>이름만 적어도 바로 시작할 수 있어요. 지도와 NPC는 나중에 위쪽 버튼으로 더해요.</p>
      <SceneForm state={state} run={run} pending={pending} />
    </div>
  );
}

/** GM 대사 창: 쓰고 Enter를 누르면 모두의 화면에 크게 뜬다 */
export function NarrationInput({
  run,
  onEcho,
}: {
  run: Run;
  /** 서버 응답 전에 대사 창에 먼저 띄울 글 (실패하면 null) */
  onEcho?: (text: string | null) => void;
}) {
  const [text, setText] = useState('');
  const send = async () => {
    const t = text.trim();
    if (!t) return;
    // 바로 비우고 먼저 보여 준 뒤, 실패하면 되돌려 놓는다
    setText('');
    onEcho?.(t);
    const evs = await run({ type: 'narration.post', payload: { text: t } });
    onEcho?.(null);
    if (!evs.length) setText((cur) => cur || t);
  };
  return (
    <form
      className={styles.narrate}
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
    >
      <textarea
        rows={2}
        value={text}
        placeholder="여기에 장면을 묘사하면 모두의 대사 창에 떠요 (Enter 보내기 · Shift+Enter 줄바꿈)"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            void send();
          }
        }}
      />
      <button type="submit" disabled={!text.trim()}>
        보내기
      </button>
    </form>
  );
}

export function Modal({
  title,
  onClose,
  children,
  wide,
  closer,
  dirty,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  /** 안쪽에서도 닫아야 할 때(할 일을 마치면 닫힘) 바깥에서 만든 useClosing을 넘긴다 */
  closer?: [boolean, () => void];
  /** 적은 것 말고도 닫히면 잃는 게 있을 때 */
  dirty?: boolean;
}) {
  const own = useClosing(onClose);
  const [closing, close] = closer ?? own;
  const guard = useCloseGuard(close, dirty);
  return (
    <div className={styles.backdrop} data-closing={closing || undefined} {...guard.backdrop}>
      <section
        className={styles.modal}
        data-wide={wide || undefined}
        role="dialog"
        aria-label={title}
        {...guard.panel}
      >
        <header className={styles.modalHead}>
          <h2>{title}</h2>
          <button type="button" className={styles.close} onClick={close} aria-label="닫기">
            ×
          </button>
        </header>
        <CloseGuardScope value={guard.scope}>{children}</CloseGuardScope>
      </section>
      {guard.nudge}
    </div>
  );
}

/** 버튼 줄에서 고른 도구의 창 */
export function GmPanel({
  open,
  state,
  run,
  pending,
  notes,
  onClose,
}: {
  open: GmOpen;
  state: RoomState;
  run: Run;
  pending: boolean;
  notes: string[];
  onClose: () => void;
}) {
  // 할 일을 마쳐 닫힐 때도 ×를 누를 때처럼 흐려지며 닫힌다
  const closer = useClosing(onClose);
  const done = async (cmd: Command) => {
    const evs = await run(cmd);
    if (evs.length) closer[1]();
  };
  const title = TOOLS.find(([t]) => t === open.tool)?.[1] ?? 'GM';
  const props = { state, run, pending, done, onClose: closer[1] };
  return (
    <Modal title={title} onClose={onClose} closer={closer}>
      {open.tool === 'scene' && <ScenePanel {...props} />}
      {open.tool === 'aspect' && <AspectPanel {...props} />}
      {open.tool === 'npc' && <NpcPanel {...props} />}
      {open.tool === 'conflict' && <ConflictPanel {...props} />}
      {open.tool === 'compel' && (
        <CompelPanel {...props} {...(open.aspectId ? { aspectId: open.aspectId } : {})} />
      )}
      {open.tool === 'note' && <NotePanel {...props} notes={notes} />}
      {open.tool === 'session' && <SessionPanel {...props} />}
    </Modal>
  );
}

interface PanelProps {
  state: RoomState;
  run: Run;
  pending: boolean;
  done: (cmd: Command) => Promise<void>;
  onClose: () => void;
}

function ScenePanel({ state, run, pending, done, onClose }: PanelProps) {
  return (
    <>
      {state.scene && (
        <div className={styles.current}>
          <span>
            지금 장면: <b>{state.scene.name}</b>
          </span>
          <button
            type="button"
            className={styles.ghost}
            disabled={pending}
            onClick={() => void done({ type: 'scene.end', payload: {} })}
          >
            장면 끝내기
          </button>
        </div>
      )}
      <p className={styles.help}>
        {state.scene
          ? '새 장면을 열면 지금 장면은 자동으로 끝나요. 스트레스가 회복되고 장면 특성이 사라져요.'
          : '장면을 열면 GM 운명점 풀이 PC 수만큼 채워져요.'}
      </p>
      <SceneForm
        state={state}
        run={run}
        pending={pending}
        onDone={onClose}
        submitLabel={state.scene ? '새 장면으로 넘어가기' : '장면 시작'}
      />
    </>
  );
}

function AspectPanel({ state, pending, done }: PanelProps) {
  const [text, setText] = useState('');
  const [hidden, setHidden] = useState(false);
  const [free, setFree] = useState(0);
  const secret = Object.values(state.aspects).filter((a) => a.hidden);
  if (!state.scene) return <p className={styles.help}>먼저 장면을 열어 주세요.</p>;
  const sceneId = state.scene.id;
  return (
    <>
      <form
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault();
          void done({
            type: 'aspect.add',
            payload: {
              ownerType: 'scene',
              ownerId: sceneId,
              kind: 'situation',
              text: text.trim(),
              freeInvokes: free,
              hidden,
            },
          });
        }}
      >
        <label className={styles.field}>
          새 {term('situation')}
          <input
            autoFocus
            placeholder="예: 무너지는 대들보"
            value={text}
            maxLength={80}
            onChange={(e) => setText(e.target.value)}
          />
        </label>
        <div className={styles.chips}>
          <button type="button" aria-pressed={!hidden} onClick={() => setHidden(false)}>
            모두에게 보이기
          </button>
          <button type="button" aria-pressed={hidden} onClick={() => setHidden(true)}>
            숨겨 두기 (발견되면 공개)
          </button>
        </div>
        <div className={styles.chips}>
          {[0, 1, 2].map((n) => (
            <button key={n} type="button" aria-pressed={free === n} onClick={() => setFree(n)}>
              {term('freeInvoke')} {n}
            </button>
          ))}
        </div>
        <button type="submit" className={styles.primary} disabled={pending || !text.trim()}>
          붙이기
        </button>
      </form>
      {secret.length > 0 && (
        <>
          <h3 className={styles.sub}>숨겨 둔 특성 · 눌러서 공개</h3>
          <div className={styles.cards}>
            {secret.map((a) => (
              <AspectCard
                key={a.id}
                aspect={a}
                size="sm"
                note="공개하기"
                onClick={() => void done({ type: 'aspect.reveal', payload: { aspectId: a.id } })}
              />
            ))}
          </div>
        </>
      )}
    </>
  );
}

function NpcPanel({ pending, done }: PanelProps) {
  const [name, setName] = useState('');
  const [high, setHigh] = useState('');
  const [best, setBest] = useState<Approach>('forceful');
  return (
    <form
      className={styles.form}
      onSubmit={(e) => {
        e.preventDefault();
        const approaches = Object.fromEntries(
          APPROACHES.map((a) => [a, a === best ? 2 : 0]),
        ) as Record<Approach, number>;
        void done({
          type: 'character.create',
          payload: {
            name: name.trim(),
            isNpc: true,
            approaches,
            stunts: [],
            highConcept: high.trim() || name.trim(),
            aspects: [],
          },
        });
      }}
    >
      <label className={styles.field}>
        이름
        <input
          autoFocus
          placeholder="예: 밀수꾼"
          value={name}
          maxLength={40}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label className={styles.field}>
        {term('high')} <small>(비우면 이름을 그대로 써요)</small>
        <input
          placeholder="예: 부두의 칼잡이"
          value={high}
          maxLength={80}
          onChange={(e) => setHigh(e.target.value)}
        />
      </label>
      <div className={styles.field}>
        잘하는 {term('approach')} (+2)
        <div className={styles.chips}>
          {APPROACHES.map((a) => (
            <button key={a} type="button" aria-pressed={best === a} onClick={() => setBest(a)}>
              {term(a)}
            </button>
          ))}
        </div>
      </div>
      <button type="submit" className={styles.primary} disabled={pending || !name.trim()}>
        만들기
      </button>
    </form>
  );
}

type Kind = 'physical' | 'mental';

function ConflictPanel({ state, pending, done }: PanelProps) {
  const everyone = Object.values(state.characters).filter((c) => !c.takenOut);
  const [kind, setKind] = useState<Kind>('physical');
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const inConflict = everyone.filter((c) => picked[c.id] ?? true);
  const [sides, setSides] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [steps, setSteps] = useState('');
  const toggleSide = (id: string) =>
    setSides((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id].slice(-2)));

  return (
    <>
      <h3 className={styles.sub}>{term('conflict')} · 서로 해치려 할 때</h3>
      {state.conflict ? (
        <p className={styles.help}>
          {term('conflict')}이 진행 중이에요. 위쪽 띠에서 차례를 넘기거나 끝내요.
        </p>
      ) : (
        <div className={styles.form}>
          <div className={styles.chips}>
            <button
              type="button"
              aria-pressed={kind === 'physical'}
              onClick={() => setKind('physical')}
            >
              물리 · 신속이 높은 순서
            </button>
            <button
              type="button"
              aria-pressed={kind === 'mental'}
              onClick={() => setKind('mental')}
            >
              정신 · 신중이 높은 순서
            </button>
          </div>
          <div className={styles.chips}>
            {everyone.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={picked[c.id] ?? true}
                onClick={() => setPicked({ ...picked, [c.id]: !(picked[c.id] ?? true) })}
              >
                {c.name}
                {c.isNpc ? ' · NPC' : ''}
              </button>
            ))}
          </div>
          <button
            type="button"
            className={styles.primary}
            disabled={pending || inConflict.length < 2}
            onClick={() =>
              void done({
                type: 'conflict.start',
                payload: { kind, participantIds: inConflict.map((c) => c.id) },
              })
            }
          >
            {term('conflict')} 시작
          </button>
        </div>
      )}

      <h3 className={styles.sub}>{term('contest')} · 먼저 3번 이기는 겨루기</h3>
      {state.contest ? (
        <p className={styles.help}>{term('contest')}이 진행 중이에요.</p>
      ) : (
        <div className={styles.form}>
          <div className={styles.chips}>
            {everyone.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={sides.includes(c.id)}
                onClick={() => toggleSide(c.id)}
              >
                {c.name}
              </button>
            ))}
          </div>
          <button
            type="button"
            className={styles.primary}
            disabled={pending || sides.length !== 2}
            onClick={() => void done({ type: 'contest.start', payload: { sides } })}
          >
            {sides.length === 2
              ? `${sides.map((id) => state.characters[id]?.name).join(' vs ')} 시작`
              : '두 쪽을 골라 주세요'}
          </button>
        </div>
      )}

      <h3 className={styles.sub}>{term('challenge')} · 여러 번 극복해서 푸는 일</h3>
      {state.challenge ? (
        <p className={styles.help}>{term('challenge')}이 진행 중이에요.</p>
      ) : (
        <form
          className={styles.form}
          onSubmit={(e) => {
            e.preventDefault();
            void done({
              type: 'challenge.start',
              payload: {
                title: title.trim(),
                steps: steps
                  .split('\n')
                  .map((t) => t.trim())
                  .filter(Boolean)
                  .slice(0, 8),
              },
            });
          }}
        >
          <input
            placeholder="예: 무너지는 다리 건너기"
            value={title}
            maxLength={80}
            onChange={(e) => setTitle(e.target.value)}
          />
          <textarea
            rows={3}
            placeholder={'단계를 한 줄에 하나씩\n밧줄 고정하기\n아이들 먼저 보내기'}
            value={steps}
            onChange={(e) => setSteps(e.target.value)}
          />
          <button
            type="submit"
            className={styles.primary}
            disabled={pending || !title.trim() || !steps.trim()}
          >
            {term('challenge')} 시작
          </button>
        </form>
      )}
    </>
  );
}

function CompelPanel({ state, pending, done, aspectId }: PanelProps & { aspectId?: string }) {
  const preset = aspectId ? state.aspects[aspectId] : undefined;
  const pcs = Object.values(state.characters).filter((c) => !c.isNpc);
  const [target, setTarget] = useState(
    preset?.ownerType === 'character' ? preset.ownerId : (pcs[0]?.id ?? ''),
  );
  const [aspect, setAspect] = useState(aspectId ?? '');
  const [text, setText] = useState('');
  const options = Object.values(state.aspects).filter(
    (a) => !a.hidden && (a.ownerType !== 'character' || a.ownerId === target),
  );
  if (pcs.length === 0) return <p className={styles.help}>아직 PC가 없어요.</p>;
  return (
    <form
      className={styles.form}
      onSubmit={(e) => {
        e.preventDefault();
        void done({
          type: 'compel.offer',
          payload: { aspectId: aspect, targetId: target, text: text.trim() },
        });
      }}
    >
      <p className={styles.help}>
        받아들이면 {term('fatePoint')} +1, 거절하면 −1이에요. 플레이어 화면에 바로 떠요.
      </p>
      <div className={styles.field}>
        누구에게
        <div className={styles.chips}>
          {pcs.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={target === c.id}
              onClick={() => setTarget(c.id)}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>
      <div className={styles.field}>
        어떤 {term('aspect')} 때문에
        <div className={styles.cards}>
          {options.map((a) => (
            <AspectCard
              key={a.id}
              aspect={a}
              size="sm"
              highlight={aspect === a.id}
              onClick={() => setAspect(a.id)}
            />
          ))}
        </div>
      </div>
      <label className={styles.field}>
        무슨 일이 꼬이나요?
        <input
          placeholder="예: 빚쟁이가 하필 지금 나타나 앞을 막아요"
          value={text}
          maxLength={200}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      <button
        type="submit"
        className={styles.primary}
        disabled={pending || !target || !aspect || !text.trim()}
      >
        {term('compel')} 걸기
      </button>
    </form>
  );
}

function NotePanel({ pending, done, notes }: PanelProps & { notes: string[] }) {
  const [text, setText] = useState('');
  return (
    <>
      <form
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault();
          void done({ type: 'gm.note', payload: { text: text.trim() } });
        }}
      >
        <textarea
          autoFocus
          rows={3}
          placeholder="플레이어에게는 보이지 않아요"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button type="submit" className={styles.primary} disabled={pending || !text.trim()}>
          메모 남기기
        </button>
      </form>
      {notes.length > 0 && (
        <ul className={styles.notes}>
          {notes
            .slice(-8)
            .reverse()
            .map((n, i) => (
              <li key={i}>{n}</li>
            ))}
        </ul>
      )}
    </>
  );
}

function SessionPanel({ state, pending, done }: PanelProps) {
  const [summary, setSummary] = useState('');
  if (!state.session)
    return (
      <>
        <p className={styles.help}>
          새 세션을 열면 PC들의 {term('fatePoint')}이 {term('refresh')} 수치까지 다시 채워져요.
        </p>
        <button
          type="button"
          className={styles.primary}
          disabled={pending}
          onClick={() => void done({ type: 'session.start', payload: {} })}
        >
          세션 {state.sessionsPlayed + 1} 시작
        </button>
      </>
    );
  return (
    <form
      className={styles.form}
      onSubmit={(e) => {
        e.preventDefault();
        void done({
          type: 'session.end',
          payload: summary.trim() ? { summary: summary.trim() } : {},
        });
      }}
    >
      <p className={styles.help}>
        세션 {state.session.number} 진행 중이에요. 끝내면 진행 중인 장면도 닫혀요.
      </p>
      <textarea
        rows={3}
        placeholder="오늘 있었던 일 요약 (선택)"
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
      />
      <button type="submit" className={styles.primary} disabled={pending}>
        세션 끝내기
      </button>
    </form>
  );
}
