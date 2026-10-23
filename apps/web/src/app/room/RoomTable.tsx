'use client';

import { term } from '@fate/glossary';
import {
  APPROACHES,
  canInvoke,
  formatRating,
  outcomeFor,
  previewInvokes,
  resolveRoll,
  stuntBonuses,
  sumDice,
  type Action,
  type Approach,
  type Aspect,
  type Character,
  type Command,
  type InvokeMode,
  type Outcome,
  type PaidWith,
  type Reward,
  type RoomEvent,
  undoneSeqs,
} from '@fate/rules-engine';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { AspectCard } from '@/components/aspect/AspectCard';
import { CompelOffer } from '@/components/compel/CompelOffer';
import { StoryLog } from '@/components/log/StoryLog';
import { PartyRail } from '@/components/party/PartyRail';
import { ActionBar } from '@/components/roll/ActionBar';
import {
  DICE_MODES,
  DiceTray,
  saveDiceMode,
  savedDiceMode,
  type DiceMode,
} from '@/components/roll/DiceTray';
import { InvokeTray, type InvokeChoice } from '@/components/roll/InvokeTray';
import { OutcomeBanner } from '@/components/roll/OutcomeBanner';
import { playSfx, setSfxEnabled, sfxEnabled, sfxForEvent, sfxForOutcome } from '@/fx/sfx';
import { ApiError } from '@/lib/api';
import { asset } from '@/lib/asset';
import { describe, ERROR_COPY } from '@/lib/copy';
import type { RemoteRoom } from '@/state/remoteRoom';
import tryStyles from '../tutorial/try.module.css';
import { BringCharacter } from './BringCharacter';
import { CharacterSheet } from './CharacterSheet';
import { DamagePrompt } from './DamagePrompt';
import { GmBar, GmPanel, NarrationInput, SceneStarter, type GmOpen } from './GmConsole';
import styles from './room.module.css';
import { Trackers } from './Trackers';
import { ZoneMap } from './ZoneMap';

const BLOCK_REASON: Record<string, string> = {
  NOT_ENOUGH_FATE_POINTS: '운명점이 부족해요',
  ASPECT_ALREADY_INVOKED: '이번 굴림에 이미 썼어요',
};

type Prompt = { kind: 'aspect'; freeInvokes: 1 | 2 } | { kind: 'boost'; ownerId: string } | null;

function lastRollIdOf(events: RoomEvent[]): string | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const p = events[i]!.payload as { rollId?: unknown };
    if (p && typeof p === 'object' && typeof p.rollId === 'string') return p.rollId;
  }
  return null;
}

export function RoomTable({
  room,
  name,
  inviteCode,
}: {
  room: RemoteRoom;
  name: string;
  inviteCode: string;
}) {
  const { state, events, live } = useSyncExternalStore(
    room.subscribe,
    room.getSnapshot,
    room.getSnapshot,
  );
  const role = state.members[room.userId]?.role ?? 'spectator';
  const isGm = role === 'gm';

  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const run = useCallback(
    async (cmd: Command) => {
      setError(null);
      setPending(true);
      try {
        return await room.run(cmd);
      } catch (e) {
        setError(
          e instanceof ApiError
            ? (ERROR_COPY[e.code] ?? e.message)
            : '지금은 할 수 없는 행동이에요.',
        );
        return [];
      } finally {
        setPending(false);
      }
    },
    [room],
  );

  // 내가 움직일 수 있는 캐릭터 (GM은 모두, 플레이어는 자기 PC)
  const controllable = Object.values(state.characters).filter((c) =>
    isGm ? true : !c.isNpc && c.ownerId === room.userId,
  );
  const [actingId, setActingId] = useState<string | null>(null);
  const me: Character | null =
    controllable.find((c) => c.id === actingId) ??
    controllable.find((c) => (isGm ? c.isNpc : true)) ??
    controllable[0] ??
    null;
  const canControl = (c: Character | undefined) =>
    !!c && (isGm || (!c.isNpc && c.ownerId === room.userId));

  // ---------- 굴림 ----------
  const [action, setAction] = useState<Action | null>(null);
  const [approach, setApproach] = useState<Approach | null>(null);
  const [difficulty, setDifficulty] = useState(2);
  const [targetId, setTargetId] = useState<string>('');
  const [settledKey, setSettledKey] = useState('');
  const [selectedAspect, setSelectedAspect] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<Prompt>(null);
  const [draft, setDraft] = useState('');
  const [diceMode, setDiceMode] = useState<DiceMode>(savedDiceMode);

  // 되돌린 이벤트는 기록에 줄을 긋고, 굴림 패널 계산에서는 뺀다
  const undone = useMemo(() => undoneSeqs(events), [events]);
  const liveEvents = useMemo(() => events.filter((e) => !undone.has(e.seq)), [events, undone]);
  const rollId = lastRollIdOf(liveEvents);
  const roll = rollId ? state.rolls[rollId] : undefined;
  const rollKey = roll ? `${roll.id}:${roll.active.animSeed}:${roll.defense?.animSeed ?? ''}` : '';
  const settled = !!roll && settledKey === rollKey;
  const activeChar = roll ? state.characters[roll.active.characterId] : undefined;
  const iRoll = canControl(activeChar);
  const busyRoll = !!roll && roll.status !== 'final';

  const targets = Object.values(state.characters).filter((c) => c.id !== me?.id && !c.takenOut);
  const onRoll = useCallback(() => {
    if (!me || !action || !approach || busyRoll) return;
    const needsTarget = action === 'attack';
    if (needsTarget && !targetId) {
      setError('공격할 대상을 골라 주세요.');
      return;
    }
    setSelectedAspect(null);
    void run({
      type: 'roll.request',
      payload: {
        characterId: me.id,
        action,
        approach,
        ...(needsTarget ? { targetId } : { difficulty }),
      },
    });
  }, [me, action, approach, busyRoll, targetId, difficulty, run]);

  const choices: InvokeChoice[] = useMemo(() => {
    if (!roll || roll.status !== 'open' || !activeChar) return [];
    const payer = {
      characterId: activeChar.id,
      fatePoints: activeChar.isNpc ? state.gmPool : activeChar.fatePoints,
    };
    const visible = Object.values(state.aspects).filter(
      (a) =>
        !a.hidden &&
        (a.ownerType !== 'character' ||
          a.ownerId === activeChar.id ||
          (roll.defense && a.ownerId === roll.defense.characterId)),
    );
    return visible.map((a): InvokeChoice => {
      const previews = previewInvokes(roll, [a], payer);
      const owner = a.ownerType === 'character' ? state.characters[a.ownerId]?.name : undefined;
      const against = a.ownerType === 'character' && a.ownerId !== activeChar.id;
      const base = { aspect: a, ...(owner ? { owner } : {}), against };
      if (previews.length === 0) {
        const check = canInvoke(
          roll,
          a,
          payer,
          'active',
          a.freeInvokes > 0 ? 'free_invoke' : 'fate_point',
        );
        return {
          ...base,
          blocked: check.ok ? '쓸 수 없어요' : (BLOCK_REASON[check.code] ?? '쓸 수 없어요'),
        };
      }
      const bonus = previews.find((p) => p.mode === 'bonus');
      const reroll = previews.find((p) => p.mode === 'reroll');
      return { ...base, ...(bonus ? { bonus } : {}), ...(reroll ? { reroll } : {}) };
    });
  }, [roll, activeChar, state]);

  const onInvoke = (aspectId: string, mode: InvokeMode, paidWith: PaidWith) => {
    if (!roll) return;
    void run({
      type: 'invoke.apply',
      payload: { rollId: roll.id, side: 'active', aspectId, mode, paidWith },
    });
    setSelectedAspect(null);
  };

  const onFinalize = async () => {
    if (!roll) return;
    const evs = await run({
      type: 'roll.finalize',
      payload: { rollId: roll.id, reduceForBoost: false },
    });
    const fin = evs.find((e) => e.type === 'roll.finalized');
    if (fin && fin.type === 'roll.finalized')
      askRewards(fin.payload.rewards, roll.active.characterId);
    setAction(null);
    setApproach(null);
  };

  const askRewards = (rewards: Reward[], ownerId: string) => {
    for (const r of rewards) {
      if (r.type === 'new_aspect') setPrompt({ kind: 'aspect', freeInvokes: r.freeInvokes });
      if (r.type === 'boost' && r.to === 'self') setPrompt({ kind: 'boost', ownerId });
    }
  };

  const submitPrompt = () => {
    const text = draft.trim();
    if (!text || !prompt) return;
    if (prompt.kind === 'aspect') {
      if (!state.scene) return setPrompt(null);
      void run({
        type: 'aspect.add',
        payload: {
          ownerType: 'scene',
          ownerId: state.scene.id,
          kind: 'situation',
          text,
          freeInvokes: prompt.freeInvokes,
          hidden: false,
        },
      });
    } else {
      void run({
        type: 'aspect.add',
        payload: {
          ownerType: 'character',
          ownerId: prompt.ownerId,
          kind: 'boost',
          text,
          freeInvokes: 0,
          hidden: false,
        },
      });
    }
    setPrompt(null);
    setDraft('');
  };

  const myStunts =
    roll && roll.status === 'open' && activeChar
      ? stuntBonuses(activeChar, roll.action, roll.active.approach)
      : [];
  const unusedStunt = myStunts.find(
    (s) => !roll?.active.modifiers.some((m) => m.source === `stunt:${s.id}`),
  );

  // 반대 굴림: 내가 움직이는 캐릭터가 공격받았을 때
  const defender =
    roll?.status === 'awaiting_defense' && roll.targetId
      ? state.characters[roll.targetId]
      : undefined;
  const iDefend = canControl(defender);

  const result =
    roll && roll.active.dice && (roll.defense?.dice ?? roll.targetId === null)
      ? resolveRoll(roll)
      : null;
  const outcome: Outcome | null =
    roll && result ? (roll.result?.outcome ?? outcomeFor(roll, 'active')) : null;

  // ---------- 강요 · 피해 ----------
  const myCompel = Object.values(state.compels).find(
    (c) => canControl(state.characters[c.targetId]) && !isGm,
  );
  const gmCompelFor = isGm
    ? Object.values(state.compels).find((c) => state.characters[c.targetId]?.isNpc)
    : undefined;
  const compel = myCompel ?? gmCompelFor;
  const damage = Object.values(state.pendingDamage).find((d) =>
    canControl(state.characters[d.targetId]),
  );

  // ---------- 효과음 ----------
  const [sfxOn, setSfxOn] = useState(sfxEnabled);
  const heard = useRef<number | null>(null);
  useEffect(() => {
    const last = events.at(-1)?.seq ?? 0;
    if (heard.current === null || !live) {
      heard.current = last;
      return;
    }
    const names = new Set(
      events
        .filter((e) => e.seq > heard.current!)
        .map(sfxForEvent)
        .filter((n) => n !== null),
    );
    heard.current = last;
    names.forEach((n) => playSfx(n));
  }, [events, live]);
  const outcomeKey = settled && outcome && roll ? `${rollKey}:${outcome}` : null;
  useEffect(() => {
    if (!outcomeKey) return;
    const o = outcomeKey.split(':').at(-1) as Outcome;
    playSfx('dice-settle', 0.5);
    const t = setTimeout(() => playSfx(sfxForOutcome(o)), 220);
    return () => clearTimeout(t);
  }, [outcomeKey]);

  // ---------- 화면 ----------
  const sceneAspects = Object.values(state.aspects).filter(
    (a) =>
      !a.hidden && (a.ownerType !== 'character' || a.kind === 'boost' || a.kind === 'consequence'),
  );
  const hiddenAspects = isGm
    ? Object.values(state.aspects).filter((a) => a.hidden && a.ownerType !== 'character')
    : [];
  const [gmOpen, setGmOpen] = useState<GmOpen | null>(null);
  const lines = events.map((e) => describe(e, state)).filter((l) => l !== null);
  const lastUndoable =
    [...lines].reverse().find((l) => l.undoable !== false && !undone.has(l.seq)) ?? null;
  const notes = liveEvents.flatMap((e) => (e.type === 'gm.note' ? [e.payload.text] : []));
  const [sheetId, setSheetId] = useState<string | null>(null);
  const sheet = sheetId ? state.characters[sheetId] : undefined;
  const narration = [...liveEvents].reverse().find((e) => e.type === 'narration.posted');
  const party = Object.values(state.characters).sort((a, b) => Number(a.isNpc) - Number(b.isNpc));
  const [chat, setChat] = useState('');
  const [copied, setCopied] = useState(false);
  const joinUrl = `${location.origin}${asset('/join/')}?code=${inviteCode}`;

  return (
    <main
      className={tryStyles.stage}
      style={{
        backgroundImage: `linear-gradient(180deg, rgb(12 14 26 / .35), rgb(12 14 26 / .92)), url(${asset('/try/bg.jpg')})`,
      }}
    >
      <header className={tryStyles.top}>
        <div>
          <div className={tryStyles.kicker}>
            {state.session ? `SESSION ${String(state.session.number).padStart(2, '0')}` : 'ROOM'} ·{' '}
            {name}
          </div>
          <h1 className={tryStyles.sceneName}>{state.scene?.name ?? '장면을 기다리는 중'}</h1>
        </div>
        <div className={tryStyles.topRight}>
          <button
            type="button"
            className={tryStyles.restart}
            onClick={() => {
              void navigator.clipboard?.writeText(joinUrl);
              setCopied(true);
              setTimeout(() => setCopied(false), 1600);
            }}
            title={joinUrl}
          >
            {copied ? '링크 복사됨' : `초대 ${inviteCode}`}
          </button>
          <label className={tryStyles.mode}>
            주사위 연출
            <select
              value={diceMode}
              onChange={(e) => {
                const m = e.target.value as DiceMode;
                setDiceMode(m);
                saveDiceMode(m);
              }}
            >
              {DICE_MODES.map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className={tryStyles.restart}
            aria-pressed={sfxOn}
            onClick={() => {
              setSfxEnabled(!sfxOn);
              setSfxOn(!sfxOn);
            }}
          >
            효과음 {sfxOn ? '켜짐' : '꺼짐'}
          </button>
          <span className={styles.role}>
            {isGm ? 'GM' : role === 'player' ? '플레이어' : '관전'}
          </span>
        </div>
      </header>

      {isGm && (
        <GmBar
          state={state}
          run={run}
          pending={pending}
          lastUndoable={lastUndoable}
          onOpen={setGmOpen}
        />
      )}

      <div className={tryStyles.body}>
        <div className={tryStyles.left}>
          {party.length > 0 ? (
            <PartyRail
              onSelect={setSheetId}
              members={party.map((c) => ({
                character: c,
                ...(c.portraitUrl ? { image: c.portraitUrl } : {}),
                active: c.id === me?.id,
                status: c.isNpc ? 'NPC' : (state.members[c.ownerId ?? '']?.nickname ?? ''),
              }))}
            />
          ) : (
            <p className={styles.empty}>아직 테이블에 캐릭터가 없어요.</p>
          )}
          {controllable.length > 1 && (
            <label className={styles.acting}>
              지금 움직일 캐릭터
              <select value={me?.id ?? ''} onChange={(e) => setActingId(e.target.value)}>
                {controllable.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.isNpc ? ' (NPC)' : ''}
                  </option>
                ))}
              </select>
            </label>
          )}
          {role === 'player' && <BringCharacter run={run} has={controllable.length > 0} />}
        </div>

        <div className={`${tryStyles.center} ${styles.center}`}>
          {!state.scene && <SceneStarter state={state} run={run} pending={pending} isGm={isGm} />}
          <div className={styles.topStack}>
            <Trackers
              state={state}
              run={run}
              isGm={isGm}
              canControl={canControl}
              pending={pending}
            />
            <ZoneMap
              state={state}
              run={run}
              isGm={isGm}
              canControl={canControl}
              pending={pending}
              auto={!roll ? 'full' : roll.status === 'final' ? 'compact' : 'hidden'}
            />
          </div>
          {me?.portraitUrl && (
            <img className={tryStyles.standee} src={me.portraitUrl} alt={me.name} />
          )}

          {roll && (
            <div className={tryStyles.rollPanel}>
              <div className={tryStyles.sides}>
                <div className={tryStyles.side}>
                  <div className={tryStyles.sideHead}>
                    {activeChar?.name} · {term(roll.action)} · {term(roll.active.approach)}{' '}
                    {roll.active.rating >= 0 ? '+' : ''}
                    {roll.active.rating}
                  </div>
                  <DiceTray
                    dice={roll.active.dice}
                    rollKey={`${roll.id}:${roll.active.animSeed}`}
                    sealed={roll.status === 'awaiting_defense'}
                    mode={diceMode}
                    onSettled={() => setSettledKey(rollKey)}
                  />
                  {roll.active.dice && settled && result && (
                    <div className={tryStyles.total}>
                      {result.total >= 0 ? '+' : ''}
                      {result.total} <small>{formatRating(result.total).split(' ')[0]}</small>
                      {roll.active.modifiers.length > 0 && (
                        <small className={tryStyles.mods}>
                          주사위 {sumDice(roll.active.dice)} · {term('approach')}{' '}
                          {roll.active.rating} ·{' '}
                          {roll.active.modifiers.map((m) => `+${m.value}`).join(' ')}
                        </small>
                      )}
                    </div>
                  )}
                  {roll.status === 'awaiting_defense' && (
                    <div className={tryStyles.waiting}>굴림 완료 · 상대 응답 대기 중</div>
                  )}
                </div>
                {roll.targetId ? (
                  <>
                    <div className={tryStyles.vs}>VS</div>
                    <div className={tryStyles.side}>
                      <div className={tryStyles.sideHead}>
                        {state.characters[roll.targetId]?.name} · {term('defend')}
                      </div>
                      <DiceTray
                        dice={roll.defense?.dice ?? null}
                        rollKey={`${roll.id}:d:${roll.defense?.animSeed ?? 'x'}`}
                        sealed={!roll.defense}
                        tone="op"
                        mode={diceMode}
                      />
                    </div>
                  </>
                ) : (
                  <div className={tryStyles.difficulty}>
                    난이도 {formatRating(roll.difficulty ?? 0)}
                  </div>
                )}
              </div>

              {settled && outcome && result && (
                <OutcomeBanner
                  action={roll.action}
                  outcome={outcome}
                  total={result.total}
                  provisional={roll.status !== 'final' && iRoll}
                />
              )}

              {settled && roll.status === 'open' && iRoll && (
                <>
                  {unusedStunt && (
                    <button
                      type="button"
                      className={tryStyles.stunt}
                      onClick={() =>
                        void run({
                          type: 'stunt.apply',
                          payload: { rollId: roll.id, side: 'active', stuntId: unusedStunt.id },
                        })
                      }
                    >
                      {term('stunt')} 적용: {unusedStunt.text}
                    </button>
                  )}
                  <InvokeTray
                    choices={choices}
                    fatePoints={activeChar?.isNpc ? state.gmPool : (activeChar?.fatePoints ?? 0)}
                    selectedId={selectedAspect}
                    onSelect={setSelectedAspect}
                    onInvoke={onInvoke}
                    onFinalize={() => void onFinalize()}
                  />
                </>
              )}
              {settled && roll.status === 'open' && !iRoll && (
                <p className={tryStyles.waiting}>{activeChar?.name}이(가) 결과를 정하는 중…</p>
              )}
            </div>
          )}

          {iDefend && defender && roll && (
            <div className={tryStyles.overlay}>
              <div className={tryStyles.prompt}>
                <div className={tryStyles.promptHead}>
                  {activeChar?.name}의 {term(roll.action)}! {defender.name}은(는) 어떻게 막을까요?
                </div>
                <p className={tryStyles.promptHelp}>
                  {term('defend')}에 쓸 {term('approach')}을 골라요. 두 결과가 동시에 공개돼요.
                </p>
                <div className={styles.defendGrid}>
                  {APPROACHES.map((a) => (
                    <button
                      key={a}
                      type="button"
                      className={styles.defendBtn}
                      disabled={pending}
                      onClick={() =>
                        void run({ type: 'roll.defend', payload: { rollId: roll.id, approach: a } })
                      }
                    >
                      {term(a)} {defender.approaches[a] >= 0 ? '+' : ''}
                      {defender.approaches[a]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {compel && state.aspects[compel.aspectId] && (
            <div className={tryStyles.overlay}>
              <CompelOffer
                aspect={state.aspects[compel.aspectId] as Aspect}
                text={compel.text}
                fatePoints={
                  state.characters[compel.targetId]?.isNpc
                    ? state.gmPool
                    : (state.characters[compel.targetId]?.fatePoints ?? 0)
                }
                onAccept={() =>
                  void run({
                    type: 'compel.respond',
                    payload: { compelId: compel.id, accept: true },
                  })
                }
                onRefuse={() =>
                  void run({
                    type: 'compel.respond',
                    payload: { compelId: compel.id, accept: false },
                  })
                }
              />
            </div>
          )}

          {damage && !compel && (
            <div className={tryStyles.overlay}>
              <DamagePrompt
                damage={damage}
                character={state.characters[damage.targetId]!}
                run={run}
                pending={pending}
              />
            </div>
          )}

          {prompt && (
            <div className={tryStyles.overlay}>
              <form
                className={tryStyles.prompt}
                onSubmit={(e) => {
                  e.preventDefault();
                  submitPrompt();
                }}
              >
                <div className={tryStyles.promptHead}>
                  {prompt.kind === 'aspect'
                    ? `새 ${term('aspect')} 이름 짓기 · ${term('freeInvoke')} ${prompt.freeInvokes}`
                    : `${term('boost')} 이름 짓기`}
                </div>
                <p className={tryStyles.promptHelp}>
                  {prompt.kind === 'aspect'
                    ? '장면에 새로 생긴 사실을 짧은 문구로 적어요.'
                    : '한 번 쓰고 사라지는 순간의 기회예요.'}
                </p>
                <input
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  maxLength={40}
                  className={tryStyles.promptInput}
                />
                <div className={tryStyles.promptButtons}>
                  <button
                    type="button"
                    onClick={() => setPrompt(null)}
                    className={tryStyles.restart}
                  >
                    건너뛰기
                  </button>
                  <button type="submit" className={tryStyles.promptOk} disabled={!draft.trim()}>
                    붙이기
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>

        <div className={tryStyles.right}>
          <div className={tryStyles.aspectsHead}>ASPECTS ON STAGE</div>
          <div className={tryStyles.aspects}>
            {[...sceneAspects, ...hiddenAspects].map((a) => (
              <div key={a.id} className={styles.stageAspect} data-hidden={a.hidden || undefined}>
                <AspectCard
                  aspect={a}
                  {...(a.ownerType === 'character'
                    ? { owner: state.characters[a.ownerId]?.name ?? '' }
                    : {})}
                  {...(a.hidden ? { note: 'GM만 보여요' } : {})}
                />
                {isGm && (
                  <div className={styles.aspectTools}>
                    {a.hidden ? (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() =>
                          void run({ type: 'aspect.reveal', payload: { aspectId: a.id } })
                        }
                      >
                        공개
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setGmOpen({ tool: 'compel', aspectId: a.id })}
                      >
                        {term('compel')}
                      </button>
                    )}
                    {a.kind !== 'consequence' && (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() =>
                          void run({ type: 'aspect.remove', payload: { aspectId: a.id } })
                        }
                      >
                        지우기
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
            {isGm && state.scene && (
              <button
                type="button"
                className={styles.ghost}
                onClick={() => setGmOpen({ tool: 'aspect' })}
              >
                + {term('aspect')} 붙이기
              </button>
            )}
          </div>
          <StoryLog
            lines={lines}
            undone={undone}
            {...(isGm
              ? {
                  onUndo: (seq: number) =>
                    void run({ type: 'event.undo', payload: { targetSeq: seq } }),
                }
              : {})}
          />
          {role !== 'spectator' && (
            <form
              className={styles.chat}
              onSubmit={(e) => {
                e.preventDefault();
                const text = chat.trim();
                if (!text) return;
                void run({ type: 'chat.post', payload: { text } });
                setChat('');
              }}
            >
              <input
                value={chat}
                onChange={(e) => setChat(e.target.value)}
                maxLength={500}
                placeholder="말하기…"
                aria-label="채팅"
              />
              <button type="submit" disabled={!chat.trim()}>
                보내기
              </button>
            </form>
          )}
        </div>
      </div>

      {isGm && gmOpen && (
        <GmPanel
          key={`${gmOpen.tool}:${gmOpen.aspectId ?? ''}`}
          open={gmOpen}
          state={state}
          run={run}
          pending={pending}
          notes={notes}
          onClose={() => setGmOpen(null)}
        />
      )}

      {sheet && (
        <CharacterSheet
          key={sheet.id}
          character={sheet}
          state={state}
          run={run}
          isGm={isGm}
          mine={!sheet.isNpc && sheet.ownerId === room.userId}
          pending={pending}
          onClose={() => setSheetId(null)}
        />
      )}

      <footer className={tryStyles.bottom}>
        <div className={tryStyles.dialogue}>
          <div className={tryStyles.speaker}>G M</div>
          <p className={tryStyles.say}>
            {narration && narration.type === 'narration.posted' ? narration.payload.text : ''}
          </p>
          {isGm && <NarrationInput run={run} pending={pending} />}
          {error && <p className={tryStyles.error}>{error}</p>}
        </div>
        {me && (
          <div className={styles.actionWrap}>
            {action && (
              <div className={styles.rollOptions}>
                {action === 'attack' ? (
                  <label>
                    대상
                    <select value={targetId} onChange={(e) => setTargetId(e.target.value)}>
                      <option value="">고르기</option>
                      {targets.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <label>
                    난이도
                    <select
                      value={difficulty}
                      onChange={(e) => setDifficulty(Number(e.target.value))}
                    >
                      {[0, 1, 2, 3, 4, 5, 6].map((n) => (
                        <option key={n} value={n}>
                          {formatRating(n)}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            )}
            <ActionBar
              character={me}
              action={action}
              approach={approach}
              disabled={pending || busyRoll || me.takenOut === true}
              onAction={setAction}
              onApproach={setApproach}
              onRoll={onRoll}
            />
          </div>
        )}
      </footer>
    </main>
  );
}
