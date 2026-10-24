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
  PendingDice,
  saveDiceMode,
  savedDiceMode,
  type DiceMode,
} from '@/components/roll/DiceTray';
import { InvokeTray, type InvokeChoice } from '@/components/roll/InvokeTray';
import { OutcomeBanner } from '@/components/roll/OutcomeBanner';
import { toast, Toaster } from '@/components/ui/Toast';
import { playSfx, setSfxEnabled, sfxEnabled, sfxForEvent, sfxForOutcome } from '@/fx/sfx';
import { ApiError } from '@/lib/api';
import { asset } from '@/lib/asset';
import { describe, ERROR_COPY, JUDGE } from '@/lib/copy';
import { josa } from '@/lib/josa';
import type { RemoteRoom } from '@/state/remoteRoom';
import tryStyles from '../tutorial/try.module.css';
import { BringCharacter } from './BringCharacter';
import { CharacterSheet } from './CharacterSheet';
import { CommandPalette, roomCommands, ShortcutHelp } from './CommandPalette';
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

/** 기다리는 동안 다른 버튼을 잠글 필요가 없는 가벼운 명령 */
const LIGHT: ReadonlySet<Command['type']> = new Set([
  'chat.post',
  'narration.post',
  'gm.note',
  'fate.adjust',
  'token.move',
  'zone.update',
  'event.undo',
]);

/** GM이 한 일 중 알림에 "되돌리기"를 달아 주는 것 */
const DONE_COPY: Partial<Record<Command['type'], string>> = {
  'aspect.add': '특성을 붙였어요',
  'aspect.remove': '특성을 지웠어요',
  'aspect.reveal': '특성을 공개했어요',
  'character.create': '캐릭터를 만들었어요',
  'scene.start': '장면을 열었어요',
  'scene.end': '장면을 닫았어요',
  'compel.offer': '강요를 걸었어요',
  'conflict.start': '갈등을 시작했어요',
  'conflict.end': '갈등을 끝냈어요',
  'zone.add': '구역을 만들었어요',
  'zone.remove': '구역을 지웠어요',
  'gm.note': '메모를 남겼어요',
};

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLInputElement ||
  t instanceof HTMLTextAreaElement ||
  t instanceof HTMLSelectElement ||
  (t instanceof HTMLElement && t.isContentEditable);

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

  // 무거운 명령(굴림·장면·생성)만 세어서 두 번 누르기를 막고, 채팅 같은 건 막지 않는다
  const [inflight, setInflight] = useState(0);
  const pending = inflight > 0;
  const run = useCallback(
    async (cmd: Command): Promise<RoomEvent[]> => {
      const heavy = !LIGHT.has(cmd.type);
      if (heavy) setInflight((n) => n + 1);
      try {
        const evs = await room.run(cmd);
        const done = DONE_COPY[cmd.type];
        const first = evs[0];
        if (done && first && room.actor.role === 'gm')
          toast({
            text: done,
            tone: 'success',
            key: 'done',
            action: {
              label: '되돌리기',
              run: () =>
                void room
                  .run({ type: 'event.undo', payload: { targetSeq: first.seq } })
                  .then(() => toast({ text: '되돌렸어요', key: 'done' }))
                  .catch(() => toast({ text: '되돌리지 못했어요', tone: 'error' })),
            },
          });
        if (cmd.type === 'event.undo') toast({ text: '되돌렸어요', key: 'done' });
        return evs;
      } catch (e) {
        toast({
          tone: 'error',
          key: 'error',
          text:
            e instanceof ApiError
              ? (ERROR_COPY[e.code] ?? e.message)
              : '지금은 할 수 없는 행동이에요.',
        });
        return [];
      } finally {
        if (heavy) setInflight((n) => n - 1);
      }
    },
    [room],
  );

  // 내가 움직일 수 있는 캐릭터 (GM은 모두, 플레이어는 자기 PC)
  const controllable = Object.values(state.characters).filter((c) =>
    isGm ? true : !c.isNpc && c.ownerId === room.userId,
  );
  const canControl = (c: Character | undefined) =>
    !!c && (isGm || (!c.isNpc && c.ownerId === room.userId));

  // 갈등에서 내 캐릭터 차례가 오면 그 캐릭터가 먼저 골라진다 (그 차례에 직접 바꾸기 전까지)
  const turnId = state.conflict?.order[state.conflict.index];
  const turnKey = state.conflict ? `${state.conflict.round}:${state.conflict.index}` : '';
  const turnChar = turnId ? state.characters[turnId] : undefined;
  const myTurn = !!turnChar && canControl(turnChar) && (!isGm || turnChar.isNpc);
  const [acting, setActing] = useState<{ id: string | null; turn: string }>({ id: null, turn: '' });
  const setActingId = (id: string) => setActing({ id, turn: turnKey });
  const actingId = myTurn && acting.turn !== turnKey ? turnId : acting.id;
  const me: Character | null =
    controllable.find((c) => c.id === actingId) ??
    controllable.find((c) => (isGm ? c.isNpc : true)) ??
    controllable[0] ??
    null;

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
  // GM은 NPC 쪽만 대신 고른다. PC는 그 플레이어가 고르고, GM 화면에는 기다림 표시만 뜬다
  const [gmTakeOver, setGmTakeOver] = useState('');
  const mineToAnswer = (c: Character | undefined) =>
    !!c && canControl(c) && (!isGm || c.isNpc || gmTakeOver === roll?.id);
  const iRoll = mineToAnswer(activeChar);
  const busyRoll = !!roll && roll.status !== 'final';

  // 공격 대상: 반대편(PC ↔ NPC)을 앞에 둔다
  const targets = Object.values(state.characters)
    .filter((c) => c.id !== me?.id && !c.takenOut)
    .sort((a, b) => Number(a.isNpc === me?.isNpc) - Number(b.isNpc === me?.isNpc));
  const opponents = targets.filter((c) => c.isNpc !== me?.isNpc);
  const pickAction = (a: Action) => {
    setAction(a);
    // 상대가 하나뿐이면 미리 골라 둔다
    if (a === 'attack' && !targets.some((c) => c.id === targetId) && opponents.length === 1)
      setTargetId(opponents[0]!.id);
  };

  // 굴리기를 누른 순간부터 서버 결과가 올 때까지 주사위가 굴러간다
  const [rolling, setRolling] = useState<{
    name: string;
    head: string;
    target?: string;
    difficulty?: number;
  } | null>(null);
  const [quickKey, setQuickKey] = useState('');
  const soundedRoll = useRef(false);
  const rollSound = () => {
    soundedRoll.current = true;
    playSfx('dice-roll', 0.6);
  };
  const [rerolling, setRerolling] = useState(false);
  const onRoll = async () => {
    if (!me || !action || !approach || busyRoll || rolling) return;
    const needsTarget = action === 'attack';
    if (needsTarget && !targets.some((c) => c.id === targetId)) {
      toast({ text: '공격할 대상을 골라 주세요.', tone: 'error', key: 'error' });
      return;
    }
    setSelectedAspect(null);
    rollSound();
    setRolling({
      name: me.name,
      head: `${me.name} · ${term(action)} · ${term(approach)} ${me.approaches[approach] >= 0 ? '+' : ''}${me.approaches[approach]}`,
      ...(needsTarget ? { target: state.characters[targetId]?.name ?? '' } : { difficulty }),
    });
    const evs = await run({
      type: 'roll.request',
      payload: {
        characterId: me.id,
        action,
        approach,
        ...(needsTarget ? { targetId } : { difficulty }),
      },
    });
    const id = lastRollIdOf(evs);
    if (id) setQuickKey(id);
    setRolling(null);
  };

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

  const onInvoke = async (aspectId: string, mode: InvokeMode, paidWith: PaidWith) => {
    if (!roll || rerolling) return;
    setSelectedAspect(null);
    if (mode === 'reroll') {
      setRerolling(true);
      rollSound();
    }
    await run({
      type: 'invoke.apply',
      payload: { rollId: roll.id, side: 'active', aspectId, mode, paidWith },
    });
    setRerolling(false);
  };

  const [finalizing, setFinalizing] = useState(false);
  const onFinalize = async () => {
    if (!roll || finalizing) return;
    setFinalizing(true);
    const evs = await run({
      type: 'roll.finalize',
      payload: { rollId: roll.id, reduceForBoost: false },
    });
    const fin = evs.find((e) => e.type === 'roll.finalized');
    if (fin && fin.type === 'roll.finalized')
      askRewards(fin.payload.rewards, roll.active.characterId);
    setFinalizing(false);
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
  const iDefend = mineToAnswer(defender);

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
    mineToAnswer(state.characters[d.targetId]),
  );
  const damageWait = damage
    ? undefined
    : Object.values(state.pendingDamage).find((d) => state.characters[d.targetId]);
  const waitingOn =
    defender && !iDefend
      ? `${josa(defender.name, '이/가')} 막을 방법을 고르는 중…`
      : damageWait
        ? `${josa(state.characters[damageWait.targetId]!.name, '이/가')} 피해를 받아내는 중…`
        : null;

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
    // 내가 굴리기를 누를 때 이미 굴리는 소리를 냈으면 겹치지 않게 뺀다
    if (soundedRoll.current && names.delete('dice-roll')) soundedRoll.current = false;
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
  const [narrationEcho, setNarrationEcho] = useState<string | null>(null);
  const said =
    narrationEcho ??
    (narration && narration.type === 'narration.posted' ? narration.payload.text : '');
  const party = Object.values(state.characters).sort((a, b) => Number(a.isNpc) - Number(b.isNpc));
  const [chat, setChat] = useState('');
  const [sending, setSending] = useState<Array<{ id: number; text: string }>>([]);
  const sendIds = useRef(0);
  const myNick = state.members[room.userId]?.nickname;
  const sendChat = async (text: string) => {
    const id = ++sendIds.current;
    setSending((x) => [...x, { id, text: myNick ? `${myNick}: ${text}` : text }]);
    await run({ type: 'chat.post', payload: { text } });
    setSending((x) => x.filter((m) => m.id !== id));
  };
  const [copied, setCopied] = useState(false);
  const joinUrl = `${location.origin}${asset('/join/')}?code=${inviteCode}`;

  // 확정된 굴림은 잠시 뒤 한 줄로 접혀서 무대를 비켜 준다
  const [folded, setFolded] = useState('');
  const finalKey = roll?.status === 'final' && settled && !prompt ? rollKey : '';
  useEffect(() => {
    if (!finalKey) return;
    const t = window.setTimeout(() => setFolded(finalKey), 3500);
    return () => window.clearTimeout(t);
  }, [finalKey]);
  const isFolded = !!roll && folded === rollKey && !rolling;

  // 나에게 무언가 물어볼 때: 탭 제목에 표시하고 화면 테두리를 한 번 빛낸다
  const myCall = iDefend
    ? '방어'
    : compel && myCompel
      ? term('compel')
      : damage
        ? '피해'
        : myTurn && !busyRoll
          ? '내 차례'
          : null;
  useEffect(() => {
    const base = `${state.scene?.name ?? name} · 운명점 테이블`;
    document.title = myCall ? `● ${myCall} · ${base}` : base;
  }, [myCall, state.scene?.name, name]);

  // ---------- 단축키 ----------
  const [palette, setPalette] = useState(false);
  const [help, setHelp] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = isTyping(e.target);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette((v) => !v);
        return;
      }
      if (e.key === 'Escape') {
        setPalette(false);
        setHelp(false);
        return;
      }
      if (typing) return;
      if (e.key === '/' && !e.ctrlKey) {
        e.preventDefault();
        setPalette(true);
      } else if (e.key === '?') {
        e.preventDefault();
        setHelp((v) => !v);
      } else if (
        isGm &&
        (e.ctrlKey || e.metaKey) &&
        e.key.toLowerCase() === 'z' &&
        lastUndoable &&
        !pending
      ) {
        e.preventDefault();
        void run({ type: 'event.undo', payload: { targetSeq: lastUndoable.seq } });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isGm, lastUndoable, pending, run]);
  const paletteEntries = () =>
    roomCommands({
      state,
      run,
      isGm,
      openGm: setGmOpen,
      openSheet: setSheetId,
      openHelp: () => setHelp(true),
      chat: (t) => void sendChat(t),
    });

  const overlayOpen = !!(prompt || (compel && state.aspects[compel.aspectId]) || damage || iDefend);

  return (
    <main
      className={`${tryStyles.stage} ${styles.shell}`}
      data-call={myCall ?? undefined}
      style={{
        backgroundImage: `linear-gradient(180deg, rgb(12 14 26 / .35), rgb(12 14 26 / .92)), url(${asset('/try/bg.jpg')})`,
      }}
    >
      <Toaster />
      <header className={tryStyles.top}>
        <div>
          <div className={tryStyles.kicker}>
            {state.session ? `SESSION ${String(state.session.number).padStart(2, '0')}` : 'ROOM'} ·{' '}
            {name}
          </div>
          <h1 className={tryStyles.sceneName} key={state.scene?.id ?? 'none'}>
            {state.scene?.name ?? '장면을 기다리는 중'}
          </h1>
        </div>
        <div className={tryStyles.topRight}>
          <button
            type="button"
            className={styles.topBtn}
            onClick={() => {
              void navigator.clipboard?.writeText(joinUrl);
              setCopied(true);
              toast({ text: '초대 링크를 복사했어요', tone: 'success', key: 'copy' });
              setTimeout(() => setCopied(false), 1600);
            }}
            title={joinUrl}
          >
            {copied ? '복사됨 ✓' : `초대 ${inviteCode}`}
          </button>
          <div className={styles.seg} role="radiogroup" aria-label="주사위 연출">
            {DICE_MODES.map(([v, label]) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={diceMode === v}
                title={`주사위 연출: ${label}`}
                onClick={() => {
                  setDiceMode(v);
                  saveDiceMode(v);
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className={styles.topBtn}
            aria-pressed={sfxOn}
            title={sfxOn ? '효과음 끄기' : '효과음 켜기'}
            onClick={() => {
              setSfxEnabled(!sfxOn);
              setSfxOn(!sfxOn);
            }}
          >
            {sfxOn ? '♪ 소리' : '♪ 꺼짐'}
          </button>
          <button
            type="button"
            className={styles.topBtn}
            title="명령 창 (Ctrl+K) · 단축키는 ?"
            aria-label="명령 창 열기"
            onClick={() => setPalette(true)}
          >
            <kbd>Ctrl K</kbd>
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

      <div className={`${tryStyles.body} ${styles.body}`}>
        <div className={`${tryStyles.left} ${styles.scroll}`}>
          {party.length > 0 ? (
            <PartyRail
              onSelect={(id) =>
                controllable.some((c) => c.id === id) ? setActingId(id) : setSheetId(id)
              }
              onSheet={setSheetId}
              selectHint={(id) =>
                controllable.some((c) => c.id === id) ? '(으)로 움직이기' : '시트 보기'
              }
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
              auto={
                rolling
                  ? 'hidden'
                  : !roll || isFolded
                    ? 'full'
                    : roll.status === 'final'
                      ? 'compact'
                      : 'hidden'
              }
            />
          </div>
          {me?.portraitUrl && (
            <img className={tryStyles.standee} src={me.portraitUrl} alt={me.name} />
          )}

          {waitingOn && (
            <div className={styles.waitChip}>
              <span className={styles.dots} aria-hidden />
              {waitingOn}
              {isGm && roll && (
                <button type="button" onClick={() => setGmTakeOver(roll.id)}>
                  대신 고르기
                </button>
              )}
            </div>
          )}

          {rolling && (
            <div className={tryStyles.rollPanel} data-pending>
              <div className={tryStyles.sides}>
                <div className={tryStyles.side}>
                  <div className={tryStyles.sideHead}>{rolling.head}</div>
                  <PendingDice mode={diceMode} />
                </div>
                {rolling.target !== undefined ? (
                  <>
                    <div className={tryStyles.vs}>VS</div>
                    <div className={tryStyles.side}>
                      <div className={tryStyles.sideHead}>
                        {rolling.target} · {term('defend')}
                      </div>
                      <DiceTray dice={null} rollKey="pending" sealed tone="op" mode={diceMode} />
                    </div>
                  </>
                ) : (
                  <div className={tryStyles.difficulty}>
                    난이도 {formatRating(rolling.difficulty ?? 0)}
                  </div>
                )}
              </div>
            </div>
          )}

          {roll && !rolling && isFolded && outcome && result && (
            <button
              type="button"
              className={styles.foldedRoll}
              data-tone={JUDGE[outcome].tone}
              onClick={() => setFolded('')}
              title="굴림 결과 펼치기"
            >
              <b>{JUDGE[outcome].latin}</b>
              {activeChar?.name} · {term(roll.action)} · {term(roll.active.approach)} ·{' '}
              {result.total >= 0 ? '+' : ''}
              {result.total}
              <span>다시 보기 ▴</span>
            </button>
          )}

          {roll && !rolling && !isFolded && (
            <div className={tryStyles.rollPanel}>
              <div className={tryStyles.sides}>
                <div className={tryStyles.side}>
                  <div className={tryStyles.sideHead}>
                    {activeChar?.name} · {term(roll.action)} · {term(roll.active.approach)}{' '}
                    {roll.active.rating >= 0 ? '+' : ''}
                    {roll.active.rating}
                  </div>
                  {rerolling ? (
                    <PendingDice mode={diceMode} />
                  ) : (
                    <DiceTray
                      dice={roll.active.dice}
                      rollKey={`${roll.id}:${roll.active.animSeed}`}
                      sealed={roll.status === 'awaiting_defense'}
                      mode={diceMode}
                      quick={quickKey === roll.id}
                      onSettled={() => setSettledKey(rollKey)}
                    />
                  )}
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
                      disabled={pending}
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
                  {!overlayOpen && !palette && !help && (
                    <InvokeTray
                      choices={choices}
                      fatePoints={activeChar?.isNpc ? state.gmPool : (activeChar?.fatePoints ?? 0)}
                      selectedId={selectedAspect}
                      onSelect={setSelectedAspect}
                      onInvoke={(id, mode, paid) => void onInvoke(id, mode, paid)}
                      onFinalize={() => void onFinalize()}
                    />
                  )}
                </>
              )}
              {settled && roll.status === 'open' && !iRoll && (
                <p className={tryStyles.waiting}>
                  {josa(activeChar?.name ?? '', '이/가')} 결과를 정하는 중…
                </p>
              )}
            </div>
          )}

          {iDefend && defender && roll && (
            <div className={tryStyles.overlay}>
              <div className={tryStyles.prompt}>
                <div className={tryStyles.promptHead}>
                  {activeChar?.name}의 {term(roll.action)}! {josa(defender.name, '은/는')} 어떻게
                  막을까요?
                </div>
                <p className={tryStyles.promptHelp}>
                  {term('defend')}에 쓸 {term('approach')}을 골라요. 두 결과가 동시에 공개돼요.
                  <br />
                  <small>키보드 Q W E / A S D</small>
                </p>
                <DefendGrid
                  defender={defender}
                  pending={pending}
                  onPick={(a) => {
                    rollSound();
                    void run({ type: 'roll.defend', payload: { rollId: roll.id, approach: a } });
                  }}
                />
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
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setPrompt(null);
                  }}
                  maxLength={40}
                  className={tryStyles.promptInput}
                />
                <div className={tryStyles.promptButtons}>
                  <button
                    type="button"
                    onClick={() => setPrompt(null)}
                    className={tryStyles.restart}
                  >
                    건너뛰기 <kbd aria-hidden>Esc</kbd>
                  </button>
                  <button type="submit" className={tryStyles.promptOk} disabled={!draft.trim()}>
                    붙이기 <kbd aria-hidden>Enter</kbd>
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>

        <div className={`${tryStyles.right} ${styles.right}`}>
          <div className={styles.rightScroll}>
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
              sending={sending}
              {...(isGm
                ? {
                    onUndo: (seq: number) =>
                      void run({ type: 'event.undo', payload: { targetSeq: seq } }),
                  }
                : {})}
            />
          </div>
          {role !== 'spectator' && (
            <form
              className={styles.chat}
              onSubmit={(e) => {
                e.preventDefault();
                const text = chat.trim();
                if (!text) return;
                setChat('');
                void sendChat(text);
              }}
            >
              <input
                value={chat}
                onChange={(e) => setChat(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') e.currentTarget.blur();
                }}
                maxLength={500}
                placeholder="말하기… (Enter)"
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

      {palette && <CommandPalette build={paletteEntries} onClose={() => setPalette(false)} />}
      {help && <ShortcutHelp isGm={isGm} onClose={() => setHelp(false)} />}

      <footer className={`${tryStyles.bottom} ${styles.bottom}`}>
        {!isGm && !said && <div aria-hidden />}
        {(isGm || said) && (
          <div className={tryStyles.dialogue}>
            <div className={tryStyles.speaker}>G M</div>
            {said && (
              <p className={tryStyles.say} key={said} data-fresh>
                {said}
              </p>
            )}
            {isGm && <NarrationInput run={run} onEcho={setNarrationEcho} />}
          </div>
        )}
        {me && (
          <div className={styles.actionWrap}>
            {controllable.length > 1 && (
              <div className={styles.chipRow} role="radiogroup" aria-label="움직일 캐릭터">
                <span className={styles.chipLabel}>누구로?</span>
                {controllable
                  .filter((c) => !c.takenOut)
                  .map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      role="radio"
                      aria-checked={c.id === me.id}
                      className={styles.who}
                      data-turn={c.id === turnId || undefined}
                      disabled={busyRoll}
                      onClick={() => {
                        setActingId(c.id);
                        setTargetId('');
                      }}
                    >
                      {c.portraitUrl ? (
                        <img src={c.portraitUrl} alt="" />
                      ) : (
                        <span>{c.name.slice(0, 1)}</span>
                      )}
                      {c.name}
                    </button>
                  ))}
              </div>
            )}
            {action && (
              <div
                className={styles.chipRow}
                aria-label={action === 'attack' ? '공격 대상' : '난이도'}
              >
                <span className={styles.chipLabel}>
                  {action === 'attack' ? '누구를?' : '난이도'}
                </span>
                {action === 'attack'
                  ? targets.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        aria-pressed={targetId === c.id}
                        className={styles.who}
                        data-npc={c.isNpc || undefined}
                        onClick={() => setTargetId(c.id)}
                      >
                        {c.portraitUrl ? (
                          <img src={c.portraitUrl} alt="" />
                        ) : (
                          <span>{c.name.slice(0, 1)}</span>
                        )}
                        {c.name}
                      </button>
                    ))
                  : [0, 1, 2, 3, 4, 5, 6].map((n) => (
                      <button
                        key={n}
                        type="button"
                        aria-pressed={difficulty === n}
                        className={styles.level}
                        title={formatRating(n)}
                        onClick={() => setDifficulty(n)}
                      >
                        +{n} <small>{formatRating(n).split(' ')[0]}</small>
                      </button>
                    ))}
              </div>
            )}
            <ActionBar
              character={me}
              action={action}
              approach={approach}
              disabled={pending || busyRoll || me.takenOut === true || overlayOpen || palette}
              busy={!!rolling}
              onAction={pickAction}
              onApproach={setApproach}
              onRoll={() => void onRoll()}
            />
          </div>
        )}
      </footer>
    </main>
  );
}

/** 방어 접근법 고르기. Q W E / A S D로도 고른다 */
function DefendGrid({
  defender,
  pending,
  onPick,
}: {
  defender: Character;
  pending: boolean;
  onPick: (a: Approach) => void;
}) {
  const keys = 'qweasd';
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (pending || isTyping(e.target) || e.ctrlKey || e.metaKey) return;
      const i = keys.indexOf(e.key.toLowerCase());
      if (i >= 0) onPick(APPROACHES[i]!);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pending, onPick]);
  return (
    <div className={styles.defendGrid}>
      {APPROACHES.map((a, i) => (
        <button
          key={a}
          type="button"
          className={styles.defendBtn}
          disabled={pending}
          onClick={() => onPick(a)}
        >
          <kbd aria-hidden>{keys[i]!.toUpperCase()}</kbd> {term(a)} {defender.approaches[a] >= 0 ? '+' : ''}
          {defender.approaches[a]}
        </button>
      ))}
    </div>
  );
}
