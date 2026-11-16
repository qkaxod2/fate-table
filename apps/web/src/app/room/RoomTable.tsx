'use client';

import { initialOf } from '@/lib/initial';
import { term } from '@fate/glossary';
import { EXPRESSIONS } from '@fate/portrait';
import {
  APPROACHES,
  canInvoke,
  chanceAtLeast,
  formatRating,
  hasVisibleText,
  outcomeFor,
  previewInvokes,
  resolveRoll,
  sideTotal,
  stuntBonuses,
  type Action,
  type Approach,
  type Aspect,
  type Character,
  type Command,
  type InvokeMode,
  type InvokeSide,
  type Outcome,
  type PaidWith,
  type RoomEvent,
  undoneSeqs,
} from '@fate/rules-engine';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { CompelOffer } from '@/components/compel/CompelOffer';
import { StoryLog } from '@/components/log/StoryLog';
import { isDialogOpen } from '@/components/book/Leaf';
import { DiceTray, PendingDice, savedDiceMode, type DiceMode } from '@/components/roll/DiceTray';
import type { InvokeChoice } from '@/components/roll/InvokeTray';
import { ActionMenu } from '@/components/theater/ActionMenu';
import { Duel, type Played } from '@/components/theater/Duel';
import { Nameplate } from '@/components/theater/Nameplate';
import { TableView, type Seat } from '@/components/theater/TableView';
import { consequenceDepth, TraitCard } from '@/components/theater/TraitCard';
import th from '@/components/theater/theater.module.css';
import { SceneFade } from '@/components/scene/SceneFade';
import { OUTCOME_FACES, pickFace, StageCast, type CastMember } from '@/components/scene/StageCast';
import {
  beatOf,
  stageFxOf,
  TALK_IDLE_MS,
  type StageBeat,
  type StageFxKind,
} from '@/components/scene/stageBeat';
import { StageFx } from '@/components/scene/StageFx';
import { MoodPanel } from '@/components/ambience/MoodPanel';
import { SceneAmbience } from '@/components/ambience/SceneAmbience';
import { sceneImage } from '@/lib/ambience';
import { StageFxMenu } from './StageFxMenu';
import { toast, Toaster } from '@/components/ui/Toast';
import { playSfx, sfxEnabled, sfxForEvent, sfxForOutcome } from '@/fx/sfx';
import { ApiError } from '@/lib/api';
import { asset } from '@/lib/asset';
import { Presence } from '@/lib/motion';
import { describe, ERROR_COPY, JUDGE, OUTCOME_COPY } from '@/lib/copy';
import { josa } from '@/lib/josa';
import type { RemoteRoom } from '@/state/remoteRoom';
import { ExitRoomDialog } from '../rooms/ExitRoomDialog';
import { PageNav } from '@/components/nav/PageNav';
import tryStyles from '../tutorial/try.module.css';
import { ArtDialog, type ArtOpen } from './ArtDialog';
import { BringCharacter } from './BringCharacter';
import { CharacterSheet } from './CharacterSheet';
import { CommandPalette, roomCommands, ShortcutHelp } from './CommandPalette';
import { DamagePrompt } from './DamagePrompt';
import { FormatBar, formatShortcut } from '@/components/ui/FormatBar';
import { GmBar, GmPanel, NarrationInput, SceneStarter, type GmOpen } from './GmConsole';
import { RoomSettings } from './RoomSettings';
import rt from './RoomTheater.module.css';
import styles from './room.module.css';
import { Trackers } from './Trackers';
import { ZoneMap } from './ZoneMap';

const BLOCK_REASON: Record<string, string> = {
  NOT_ENOUGH_FATE_POINTS: '운명점 부족',
  ASPECT_ALREADY_INVOKED: '이번 굴림에 이미 씀',
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
  'character.expression',
]);

/** GM이 한 일 중 알림에 "되돌리기"를 달아 주는 것 */
const DONE_COPY: Partial<Record<Command['type'], string>> = {
  'aspect.add': '특성 붙임',
  'aspect.remove': '특성 지움',
  'aspect.reveal': '특성 공개',
  'character.create': '캐릭터 생성',
  'scene.start': '장면 열림',
  'scene.end': '장면 닫힘',
  'compel.offer': '강요 제안',
  'conflict.start': '갈등 시작',
  'conflict.end': '갈등 끝',
  'zone.add': '구역 생성',
  'zone.remove': '구역 지움',
  'gm.note': '메모 남김',
  'media.attach': '그림 바뀜',
  'scene.mood': '분위기 바뀜',
};

/** 장면 꼬리표 자리 (화면 비율 %): 이야기 중에는 장면 여기저기, 판정 중에는 판정판 둘레 */
const TAG_SPOTS: ReadonlyArray<readonly [number, number]> = [
  [40, 46],
  [45, 17],
  [57, 31],
  [36, 28],
  [52, 52],
  [62, 12],
];
const TAG_SPOTS_ROLL: ReadonlyArray<readonly [number, number]> = [
  [5, 52],
  [27, 3],
  [74, 56],
  [75, 14],
  [6, 68],
  [77, 70],
];

/** 손패 부채꼴: 가운데는 곧게, 바깥으로 갈수록 기운다 */
const fanOf = (i: number, n: number) => {
  const d = i - (n - 1) / 2;
  if (n <= 1 || Math.abs(d) < 0.6) return th.fan2;
  if (Math.abs(d) < 1.6) return d < 0 ? th.fan1 : th.fan3;
  return d < 0 ? th.fanL : th.fanR;
};

const signed = (n: number) => `${n >= 0 ? '+' : ''}${n}`;

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLInputElement ||
  t instanceof HTMLTextAreaElement ||
  t instanceof HTMLSelectElement ||
  (t instanceof HTMLElement && t.isContentEditable);

type PendingReward = {
  seq: number;
  rollId: string;
  kind: 'aspect' | 'boost';
  freeInvokes: 1 | 2;
};

/**
 * 마지막 확정 굴림이 남긴 이름 짓기(새 특성·부스트)가 아직 안 붙었으면 그것.
 * 화면 상태가 아니라 기록에서 계산하므로 새로고침하거나 다시 들어와도 이어진다.
 * 같은 사람이 그 뒤에 특성을 붙였거나, 다음 굴림·장면 전환이 있었으면 끝난 것으로 본다.
 */
function pendingRewardOf(events: RoomEvent[]): PendingReward | null {
  const addedBy = new Set<string | null>();
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]!;
    if (e.type === 'aspect.added') addedBy.add(e.actorId);
    else if (
      e.type === 'roll.resolved' ||
      e.type === 'scene.started' ||
      e.type === 'scene.ended' ||
      e.type === 'session.ended'
    )
      return null;
    else if (e.type === 'roll.finalized') {
      if (addedBy.has(e.actorId)) return null;
      let found: PendingReward | null = null;
      for (const r of e.payload.rewards) {
        if (r.type === 'new_aspect')
          found = {
            seq: e.seq,
            rollId: e.payload.rollId,
            kind: 'aspect',
            freeInvokes: r.freeInvokes,
          };
        if (r.type === 'boost' && r.to === 'self')
          found = { seq: e.seq, rollId: e.payload.rollId, kind: 'boost', freeInvokes: 1 };
      }
      return found;
    }
  }
  return null;
}

const skippedKey = (roomId: string) => `fate.skippedReward.${roomId}`;
function readSkipped(roomId: string): number {
  try {
    return Number(localStorage.getItem(skippedKey(roomId))) || 0;
  } catch {
    return 0;
  }
}

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
                  .then(() => toast({ text: '되돌림', key: 'done' }))
                  .catch(() => toast({ text: '되돌리지 못함', tone: 'error' })),
            },
          });
        if (cmd.type === 'event.undo') toast({ text: '되돌림', key: 'done' });
        return evs;
      } catch (e) {
        toast({
          tone: 'error',
          key: 'error',
          text:
            e instanceof ApiError ? (ERROR_COPY[e.code] ?? e.message) : '지금은 할 수 없는 행동',
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
  const [draft, setDraft] = useState('');
  const [diceMode, setDiceMode] = useState<DiceMode>(savedDiceMode);

  // 되돌린 이벤트는 기록에 줄을 긋고, 굴림 패널 계산에서는 뺀다
  const undone = useMemo(() => undoneSeqs(events), [events]);
  const liveEvents = useMemo(() => events.filter((e) => !undone.has(e.seq)), [events, undone]);
  const rollId = lastRollIdOf(liveEvents);
  // 장면이 바뀌며 취소된 판정은 무대에 남기지 않는다
  const roll =
    rollId && state.rolls[rollId]?.status !== 'cancelled' ? state.rolls[rollId] : undefined;
  const rollKey = roll ? `${roll.id}:${roll.active.animSeed}:${roll.defense?.animSeed ?? ''}` : '';
  const settled = !!roll && settledKey === rollKey;
  const activeChar = roll ? state.characters[roll.active.characterId] : undefined;
  // GM은 NPC 쪽만 대신 고른다. PC는 그 플레이어가 고르고, GM 화면에는 기다림 표시만 뜬다
  const [gmTakeOver, setGmTakeOver] = useState('');
  const mineToAnswer = (c: Character | undefined) =>
    !!c && canControl(c) && (!isGm || c.isNpc || gmTakeOver === roll?.id);
  const iRoll = mineToAnswer(activeChar);

  // 이점·부스트 이름 짓기: 기록에서 계산해서 새로고침해도 사라지지 않는다
  const [skippedReward, setSkippedReward] = useState(() => readSkipped(room.roomId));
  const pendingReward = useMemo(() => pendingRewardOf(liveEvents), [liveEvents]);
  const rewardOwnerId = pendingReward ? state.rolls[pendingReward.rollId]?.active.characterId : '';
  const prompt: Prompt =
    pendingReward &&
    rewardOwnerId &&
    pendingReward.seq > skippedReward &&
    canControl(state.characters[rewardOwnerId]) &&
    (!isGm || state.characters[rewardOwnerId]?.isNpc || gmTakeOver === pendingReward.rollId)
      ? pendingReward.kind === 'aspect'
        ? { kind: 'aspect', freeInvokes: pendingReward.freeInvokes }
        : { kind: 'boost', ownerId: rewardOwnerId }
      : null;
  const closePrompt = () => {
    if (!pendingReward) return;
    setSkippedReward(pendingReward.seq);
    try {
      localStorage.setItem(skippedKey(room.roomId), String(pendingReward.seq));
    } catch {
      /* 저장소를 못 써도 이번 화면에서는 닫힌다 */
    }
  };
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
    action: Action;
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
      toast({ text: '공격할 대상 고르기', tone: 'error', key: 'error' });
      return;
    }
    rollSound();
    setRolling({
      name: me.name,
      action,
      head: `${me.name} · ${term(approach)} ${signed(me.approaches[approach])}`,
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

  // 판정 뒤 조정: 공격자는 active, 방어자는 defense 쪽으로 발동·특기를 쓴다
  const defenseChar = roll?.defense ? state.characters[roll.defense.characterId] : undefined;
  const invokeChoices = (side: InvokeSide, payerChar: Character | undefined): InvokeChoice[] => {
    if (!roll || roll.status !== 'open' || !payerChar) return [];
    const payer = {
      characterId: payerChar.id,
      fatePoints: payerChar.isNpc ? state.gmPool : payerChar.fatePoints,
    };
    const visible = Object.values(state.aspects).filter(
      (a) =>
        !a.hidden &&
        (a.ownerType !== 'character' ||
          a.ownerId === roll.active.characterId ||
          (roll.defense && a.ownerId === roll.defense.characterId)),
    );
    return visible.map((a): InvokeChoice => {
      const previews = previewInvokes(roll, [a], payer, side);
      const owner = a.ownerType === 'character' ? state.characters[a.ownerId]?.name : undefined;
      const against = a.ownerType === 'character' && a.ownerId !== payerChar.id;
      const base = { aspect: a, ...(owner ? { owner } : {}), against };
      if (previews.length === 0) {
        const check = canInvoke(
          roll,
          a,
          payer,
          side,
          a.freeInvokes > 0 ? 'free_invoke' : 'fate_point',
        );
        return {
          ...base,
          blocked: check.ok ? '쓸 수 없음' : (BLOCK_REASON[check.code] ?? '쓸 수 없음'),
        };
      }
      const bonus = previews.find((p) => p.mode === 'bonus');
      const reroll = previews.find((p) => p.mode === 'reroll');
      return { ...base, ...(bonus ? { bonus } : {}), ...(reroll ? { reroll } : {}) };
    });
  };
  const choices = invokeChoices('active', activeChar);
  const defenseChoices = invokeChoices('defense', defenseChar);

  const onInvoke = async (
    side: InvokeSide,
    aspectId: string,
    mode: InvokeMode,
    paidWith: PaidWith,
  ) => {
    if (!roll || rerolling) return;
    if (mode === 'reroll') {
      setRerolling(true);
      rollSound();
    }
    await run({
      type: 'invoke.apply',
      payload: { rollId: roll.id, side, aspectId, mode, paidWith },
    });
    setRerolling(false);
  };

  const onDefenseDone = () => {
    if (!roll) return;
    void run({ type: 'roll.defense_ready', payload: { rollId: roll.id } });
  };

  const [finalizing, setFinalizing] = useState(false);
  const onFinalize = async () => {
    if (!roll || finalizing) return;
    setFinalizing(true);
    if (defenseAdjusting && !ownDefense && gmClosesDefense)
      await run({ type: 'roll.defense_ready', payload: { rollId: roll.id } });
    await run({
      type: 'roll.finalize',
      payload: { rollId: roll.id, reduceForBoost: false },
    });
    setFinalizing(false);
    setAction(null);
    setApproach(null);
  };

  const [naming, setNaming] = useState(false);
  const submitPrompt = async () => {
    const text = draft.trim();
    if (!text || !prompt || naming) return;
    if (prompt.kind === 'aspect' && !state.scene) return closePrompt();
    setNaming(true);
    const evs = await run({
      type: 'aspect.add',
      payload:
        prompt.kind === 'aspect'
          ? {
              ownerType: 'scene',
              ownerId: state.scene!.id,
              kind: 'situation',
              text,
              freeInvokes: prompt.freeInvokes,
              hidden: false,
            }
          : {
              ownerType: 'character',
              ownerId: prompt.ownerId,
              kind: 'boost',
              text,
              freeInvokes: 0,
              hidden: false,
            },
    });
    setNaming(false);
    // 붙지 못했으면 쓴 이름을 남겨 두고 다시 붙일 수 있게 한다
    if (evs.length) {
      closePrompt();
      setDraft('');
    }
  };

  const myStunts =
    roll && roll.status === 'open' && activeChar
      ? stuntBonuses(activeChar, roll.action, roll.active.approach)
      : [];
  const unusedStunt = myStunts.find(
    (s) => !roll?.active.modifiers.some((m) => m.source === `stunt:${s.id}`),
  );
  const defenseStunt =
    roll && roll.status === 'open' && roll.defense && defenseChar
      ? stuntBonuses(defenseChar, 'defend', roll.defense.approach).find(
          (s) => !roll.defense!.modifiers.some((m) => m.source === `stunt:${s.id}`),
        )
      : undefined;

  // 반대 굴림: 내가 움직이는 캐릭터가 공격받았을 때
  const defender =
    roll?.status === 'awaiting_defense' && roll.targetId
      ? state.characters[roll.targetId]
      : undefined;
  const iDefend = mineToAnswer(defender);
  // 공개 뒤 방어자가 조정 중인지. 공격자는 방어도 자기 쪽(GM이면 NPC)일 때만 기다리지 않는다
  const defenseAdjusting = !!roll && roll.status === 'open' && !!defenseChar && !roll.defenseReady;
  const iAdjustDefense = defenseAdjusting && mineToAnswer(defenseChar) && !iRoll;
  const ownDefense = !!defenseChar && (isGm ? defenseChar.isNpc : canControl(defenseChar));
  // GM이 "대신 고르기"를 눌렀으면 방어 조정 완료를 대신 보내고 확정한다
  const gmClosesDefense = isGm && gmTakeOver === roll?.id;
  const finalizeWait =
    defenseAdjusting && !ownDefense && !gmClosesDefense
      ? `${josa(defenseChar!.name, '이/가')} 조정을 마치길 기다리는 중`
      : undefined;

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
      : settled && defenseAdjusting && !ownDefense && !iAdjustDefense
        ? `${josa(defenseChar!.name, '이/가')} 방어를 조정하는 중…`
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
  // GM이 보낸 대사가 서버에 닿기 전까지 책 본문에 흐리게 먼저 보인다
  const [narrationEcho, setNarrationEcho] = useState<string | null>(null);
  const party = Object.values(state.characters).sort((a, b) => Number(a.isNpc) - Number(b.isNpc));
  const [chat, setChat] = useState('');
  // GM은 대사와 말하기를 한 입력 자리에서 바꿔 쓴다 (책이 빽빽해지지 않게)
  const [composeMode, setComposeMode] = useState<'narrate' | 'chat'>('narrate');
  const [sending, setSending] = useState<Array<{ id: number; text: string; fx?: boolean }>>([]);
  const chatField = useRef<HTMLInputElement>(null);
  const sendIds = useRef(0);
  const myNick = state.members[room.userId]?.nickname;
  // GM은 NPC 이름으로 말할 수 있다: 그 NPC가 무대에 서서 말풍선으로 말한다
  const [speakAs, setSpeakAs] = useState('');
  const voices = isGm ? party.filter((c) => c.isNpc && !c.takenOut) : [];
  const as = voices.some((c) => c.name === speakAs) ? speakAs : '';
  const sendChat = async (text: string) => {
    const id = ++sendIds.current;
    const who = as || myNick;
    setSending((x) => [...x, { id, text: who ? `${who}: ${text}` : text, fx: isGm }]);
    const evs = await run({ type: 'chat.post', payload: as ? { text, as } : { text } });
    setSending((x) => x.filter((m) => m.id !== id));
    return evs.length > 0;
  };
  const [copied, setCopied] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);
  const router = useRouter();
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
  const myCall =
    iDefend || (settled && iAdjustDefense)
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
  // 다른 탭·창을 보고 있을 때 차례가 오면 작은 종소리로 부른다 (화면을 보고 있으면 테두리가 빛나니 조용히)
  useEffect(() => {
    if (myCall && document.hidden) playSfx('style-chime', 0.45);
  }, [myCall]);

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

  // ---------- 스탠딩 ----------
  // 새로 들어온 이벤트에서 무대의 한 박자(말 · 맞음 · 쓰러짐 · 강요 수락)를 뽑는다.
  // 처음 기록을 불러올 때는 지난 일이므로 건너뛴다
  const newestSeq = liveEvents.at(-1)?.seq ?? 0;
  const [beatFrom, setBeatFrom] = useState(newestSeq);
  const [beat, setBeat] = useState<StageBeat | null>(null);
  // 말을 주고받는 두 사람: [왼쪽, 오른쪽]과 지금 말하는 쪽. 한동안 조용하면 내려간다
  const [talk, setTalk] = useState<{ ids: [string, string | null]; focus: string } | null>(null);
  const stageEl = useRef<HTMLElement>(null);
  // 무대 전체 효과 (흔들림 · 번쩍 · 어둠 · 맞음 · 쓰러짐 · 갈등 시작)
  const [stageFx, setStageFx] = useState<{ seq: number; kind: StageFxKind } | null>(null);
  if (newestSeq !== beatFrom) {
    setBeatFrom(newestSeq);
    let b: StageBeat | null = null;
    let f: { seq: number; kind: StageFxKind } | null = null;
    if (beatFrom > 0) {
      const mine = { userId: room.userId, character: me };
      for (let i = liveEvents.length - 1; i >= 0 && liveEvents[i]!.seq > beatFrom; i--) {
        const e = liveEvents[i]!;
        b ??= beatOf(e, state, liveEvents, mine);
        if (!f) {
          const k = stageFxOf(e);
          if (k) f = { seq: e.seq, kind: k };
        }
        if (b && f) break;
      }
    }
    if (f) setStageFx(f);
    if (b) {
      setBeat(b);
      if (b.kind === 'say') {
        const x = b.characterId;
        const home = (turnChar ?? me)?.id;
        const ids = talk?.ids;
        let next: [string, string | null];
        if (ids && (ids[0] === x || ids[1] === x)) next = ids;
        // 지금 말하던 사람은 제자리에 두고, 다른 자리에 새로 말한 사람을 세운다
        else if (ids) next = talk.focus === ids[1] ? [x, ids[1]] : [ids[0], x];
        else if (home && home !== x) next = [home, x];
        else next = [x, null];
        setTalk({ ids: next, focus: x });
      }
    }
  }
  useEffect(() => {
    if (!beat) return;
    // 말풍선이 뜰 때 작게 톡
    if (beat.kind === 'say') playSfx('speech-pop', 0.35);
    const t = window.setTimeout(() => setBeat(null), beat.hold);
    return () => window.clearTimeout(t);
  }, [beat]);
  useEffect(() => {
    if (!stageFx) return;
    const t = window.setTimeout(() => setStageFx(null), 3000);
    return () => window.clearTimeout(t);
  }, [stageFx]);
  useEffect(() => {
    if (!talk) return;
    const t = window.setTimeout(() => setTalk(null), TALK_IDLE_MS);
    return () => window.clearTimeout(t);
  }, [talk]);

  // 왼쪽: 굴리는 캐릭터 → 대화 중인 사람 → 갈등 차례 → 내 캐릭터. 오른쪽: 굴림 상대 → 대화 상대
  const showRoll = !!roll && !isFolded;
  const talkL = !showRoll && talk ? state.characters[talk.ids[0]] : undefined;
  const talkR = !showRoll && talk?.ids[1] ? state.characters[talk.ids[1]] : undefined;
  // 무대에 없던 캐릭터가 맞거나 강요를 받으면 잠깐 왼쪽에 불려 나온다
  const spot =
    !showRoll && beat && beat.kind !== 'say' && beat.characterId !== talkR?.id
      ? state.characters[beat.characterId]
      : undefined;
  const castLeft =
    (showRoll ? activeChar : undefined) ?? spot ?? talkL ?? turnChar ?? me ?? undefined;
  const castRight = showRoll && roll?.targetId ? state.characters[roll.targetId] : undefined;
  const partner = !castRight && talkR && talkR.id !== castLeft?.id ? talkR : undefined;
  /** 이 캐릭터에게 지금 걸린 박자의 표정과 말풍선 */
  const beatFor = (c: Character): Pick<CastMember, 'face' | 'say' | 'motion'> => {
    if (beat?.characterId !== c.id) return {};
    const face = pickFace(c, beat.faces);
    return {
      ...(beat.motion ? { motion: { seq: beat.seq, kind: beat.motion } } : {}),
      // 그 표정 그림이 없으면 굴림 결과 표정을 그대로 둔다
      ...(face ? { face } : {}),
      ...(beat.kind === 'say' && !showRoll && beat.text
        ? { say: { seq: beat.seq, text: beat.text, fx: !!beat.fx } }
        : {}),
    };
  };
  // GM 연출에서 고를 캐릭터: 무대에 선 사람 → 장면의 PC → 나머지 (쓰러진 사람은 빼고)
  const stageCharacters = [castLeft, castRight ?? partner, ...party].filter(
    (c, i, all): c is Character => !!c && !c.takenOut && all.findIndex((x) => x?.id === c.id) === i,
  );
  const talking = (c: Character) => !!talk && (talk.ids[0] === c.id || talk.ids[1] === c.id);
  const faceShown = roll?.status === 'final' && settled && !isFolded && outcome;
  const flip: Record<Outcome, Outcome> = {
    style: 'fail',
    success: 'fail',
    tie: 'tie',
    fail: 'success',
  };
  const [artOpen, setArtOpen] = useState<ArtOpen | null>(null);

  const overlayOpen = !!(prompt || (compel && state.aspects[compel.aspectId]) || damage || iDefend);

  // 오른쪽 이름표: 맞서는 상대 → 갈등 차례의 NPC → 첫 NPC (내 캐릭터는 왼쪽에 있으니 뺀다)
  const foe = [
    castRight,
    showRoll ? activeChar : undefined,
    turnChar?.isNpc ? turnChar : undefined,
    party.find((c) => c.isNpc && !c.takenOut),
  ].find((c) => !!c && c.id !== me?.id);

  // ---------- 장면 극장 (design-system.md 32절) ----------
  const [tableOpen, setTableOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [rerollMode, setRerollMode] = useState(false);
  const sceneArt = sceneImage(state.scene);
  const [moodOpen, setMoodOpen] = useState(false);
  // 굴리는 중이거나 판정이 펼쳐져 있으면 판정 화면 (장면이 어두워지고 판정판이 내려온다)
  const rollMode = !!rolling || showRoll;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      if (isTyping(e.target) || isDialogOpen() || overlayOpen || palette || help) return;
      e.preventDefault();
      setTableOpen((o) => !o);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [overlayOpen, palette, help]);

  // 손패: 결과를 조정할 차례인 쪽(공격자 또는 방어자)의 특성
  const handSide: InvokeSide | null =
    settled && roll?.status === 'open' && !overlayOpen
      ? iRoll
        ? 'active'
        : iAdjustDefense
          ? 'defense'
          : null
      : null;
  const handChar =
    handSide === 'active' ? activeChar : handSide === 'defense' ? defenseChar : undefined;
  const handFate = handChar ? (handChar.isNpc ? state.gmPool : handChar.fatePoints) : 0;
  const handMods =
    handSide && roll
      ? handSide === 'active'
        ? roll.active.modifiers
        : roll.defense?.modifiers
      : undefined;
  const ownAspects = (id: string | undefined) =>
    Object.values(state.aspects).filter(
      (a) =>
        !a.hidden &&
        a.ownerType === 'character' &&
        a.ownerId === id &&
        (a.kind === 'high' || a.kind === 'normal' || a.kind === 'trouble'),
    );
  const handAspects = handChar ? ownAspects(handChar.id) : [];
  // 판정 중에는 상대의 특성도 장면에 꼬리표로 붙는다 (운명점을 상대에게 주고 쓸 수 있다)
  const rival =
    handSide === 'active' ? defenseChar : handSide === 'defense' ? activeChar : undefined;
  const tagAspects = [
    ...sceneAspects,
    ...hiddenAspects,
    ...(rollMode ? ownAspects(rival?.id) : []),
  ];

  const choiceById = new Map(
    (handSide === 'defense' ? defenseChoices : choices).map((c) => [c.aspect.id, c]),
  );
  const playable = (a: Aspect) => {
    const c = choiceById.get(a.id);
    if (!handSide || !c || c.blocked) return null;
    return rerollMode ? (c.reroll ?? null) : (c.bonus ?? null);
  };
  const play = (a: Aspect) => {
    const p = playable(a);
    if (!p || !handSide) return;
    void onInvoke(
      handSide,
      a.id,
      rerollMode ? 'reroll' : 'bonus',
      p.free ? 'free_invoke' : 'fate_point',
    );
    setRerollMode(false);
  };

  // 판정판에 꽂힌 카드: 조정 중인 쪽의 것. 낸 사람이 다시 누르면 빠진다
  const playedSide: InvokeSide = handSide ?? 'active';
  const playedChar = playedSide === 'defense' ? defenseChar : activeChar;
  const played: Played[] = (
    (playedSide === 'defense' ? roll?.defense?.modifiers : roll?.active.modifiers) ?? []
  ).map((m, i) => {
    if (m.source.startsWith('stunt:')) {
      const st = playedChar?.stunts.find((x) => `stunt:${x.id}` === m.source);
      return { id: `${m.source}:${i}`, text: st?.text ?? term('stunt'), how: term('stunt') };
    }
    const id = m.source.replace(/^aspect:/, '');
    const a = state.aspects[id] ?? m.restore;
    return {
      id,
      text: a?.text ?? term('aspect'),
      how:
        m.paidWith === 'free_invoke'
          ? a?.kind === 'boost'
            ? term('boost')
            : term('freeInvoke')
          : `${term('fatePoint')} 1`,
      onRevoke:
        roll && handSide && m.paidWith
          ? () =>
              void run({
                type: 'invoke.revoke',
                payload: { rollId: roll.id, side: handSide, aspectId: id },
              })
          : undefined,
    };
  });

  const artOf = (a: Aspect) => ({
    portrait:
      a.ownerType === 'character' ? (state.characters[a.ownerId]?.portraitUrl ?? null) : null,
    scene: sceneArt,
  });
  const ownerName = (a: Aspect) =>
    a.ownerType === 'character' ? state.characters[a.ownerId]?.name : undefined;
  const highOf = (id: string) =>
    Object.values(state.aspects).find(
      (a) => !a.hidden && a.ownerType === 'character' && a.ownerId === id && a.kind === 'high',
    )?.text;
  const seatOf = (c: Character): Seat => ({
    character: c,
    image: c.portraitUrl ?? null,
    player: c.isNpc ? undefined : state.members[c.ownerId ?? '']?.nickname,
    me: c.id === me?.id,
    aspects: Object.values(state.aspects).filter(
      (a) =>
        !a.hidden &&
        a.ownerType === 'character' &&
        a.ownerId === c.id &&
        (a.kind === 'consequence' || a.kind === 'boost'),
    ),
  });
  const fan = fanOf;
  const lastLine = lines.at(-1);
  const colon = lastLine?.kind === 'chat' ? lastLine.text.indexOf(':') : -1;
  const speaker = lastLine && colon > 0 && colon < 24 ? lastLine.text.slice(0, colon) : 'GM';

  return (
    <main
      ref={stageEl}
      className={`${th.theater} ${styles.callable}`}
      data-mode={rollMode ? 'roll' : 'story'}
      data-call={myCall ?? undefined}
    >
      <Toaster />
      <div className={`${th.bg} ${rt.bg}`} style={{ backgroundImage: `url(${sceneArt})` }}>
        <SceneFade background={`url(${sceneArt})`} />
      </div>
      <StageFx fx={stageFx} stage={stageEl} />
      <div className={rt.cast}>
        <StageCast
          {...(castLeft
            ? {
                left: {
                  character: castLeft,
                  focus: castRight
                    ? roll?.status !== 'awaiting_defense'
                    : castLeft === spot || !partner || talk?.focus !== partner.id,
                  face:
                    faceShown && castLeft.id === activeChar?.id
                      ? pickFace(castLeft, OUTCOME_FACES[outcome])
                      : null,
                  portraitFallback: !castLeft.isNpc || talking(castLeft),
                  ...beatFor(castLeft),
                },
              }
            : {})}
          {...(castRight
            ? {
                right: {
                  character: castRight,
                  focus: roll?.status === 'awaiting_defense',
                  face: faceShown ? pickFace(castRight, OUTCOME_FACES[flip[outcome]]) : null,
                  hit:
                    !!faceShown &&
                    roll?.action === 'attack' &&
                    (outcome === 'success' || outcome === 'style'),
                  ...beatFor(castRight),
                },
              }
            : partner
              ? {
                  right: {
                    character: partner,
                    focus: talk?.focus === partner.id,
                    portraitFallback: true,
                    ...beatFor(partner),
                  },
                }
              : {})}
        />
      </div>

      <SceneAmbience ambience={state.scene?.ambience} />

      <header className={th.top}>
        <PageNav tone="stage" fallback="/rooms/" />
        <p className={rt.kicker}>
          {state.session ? `세션 ${state.session.number}` : '방'} · {name}
        </p>
        <h1 key={state.scene?.id ?? 'none'}>{state.scene?.name ?? '장면을 기다리는 중'}</h1>
      </header>

      <div className={th.tools}>
        {!isGm && <span className={rt.role}>{role === 'player' ? '플레이어' : '관전'}</span>}
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(joinUrl);
            setCopied(true);
            toast({ text: '초대 링크 복사됨', tone: 'success', key: 'copy' });
            setTimeout(() => setCopied(false), 1600);
          }}
          title="눌러서 초대 링크 복사"
          aria-label={`초대 코드 ${inviteCode}, 눌러서 초대 링크 복사`}
        >
          {copied ? '복사됨 ✓' : `초대 ${inviteCode}`}
        </button>
        {isGm && state.scene && (
          <button
            type="button"
            aria-pressed={moodOpen}
            onClick={() => setMoodOpen((o) => !o)}
            title="기본 배경과 시간 · 날씨 · 상태 고르기"
          >
            배경 · 분위기
          </button>
        )}
        <button type="button" className={th.tableBtn} onClick={() => setTableOpen(true)}>
          탁자 보기<kbd>Tab</kbd>
        </button>
        <span className={rt.settings} data-ink="night">
          <RoomSettings
            isGm={isGm}
            diceMode={diceMode}
            onDiceMode={setDiceMode}
            sfxOn={sfxOn}
            onSfx={setSfxOn}
            onPalette={() => setPalette(true)}
            onHelp={() => setHelp(true)}
            onExit={() => setExitOpen(true)}
          />
        </span>
      </div>

      {/* 테이블에 앉은 캐릭터: 눌러서 그 캐릭터로 움직이거나 시트를 본다 */}
      <aside className={rt.roster} aria-label="테이블의 캐릭터" data-ink="night">
        {isGm && (
          <GmBar
            state={state}
            run={run}
            pending={pending}
            lastUndoable={lastUndoable}
            onOpen={setGmOpen}
            onArt={() => setArtOpen({ tab: state.scene ? 'scene' : 'standing' })}
          />
        )}
        <ul>
          {party.map((c) => {
            const mine = controllable.some((x) => x.id === c.id);
            return (
              <li key={c.id}>
                <button
                  type="button"
                  className={rt.member}
                  data-me={c.id === me?.id || undefined}
                  data-npc={c.isNpc || undefined}
                  data-turn={c.id === turnId || undefined}
                  data-out={c.takenOut || undefined}
                  title={mine ? `${josa(c.name, '으로/로')} 움직이기` : `${c.name} 시트 보기`}
                  onClick={() => (mine && c.id !== me?.id ? setActingId(c.id) : setSheetId(c.id))}
                >
                  {c.portraitUrl ? (
                    <img src={c.portraitUrl} alt="" />
                  ) : (
                    <span>{initialOf(c.name)}</span>
                  )}
                  {c.name}
                </button>
              </li>
            );
          })}
        </ul>
        {party.length === 0 && <p className={rt.empty}>아직 테이블에 캐릭터 없음</p>}
      </aside>

      {me && (
        <div className={`${th.myPlate} ${rt.lift}`}>
          <button
            type="button"
            className={rt.plateBtn}
            onClick={() => setSheetId(me.id)}
            title="내 캐릭터 시트 열기"
          >
            <Nameplate character={me} sub={highOf(me.id)} me />
          </button>
        </div>
      )}
      {foe && (
        <div className={`${th.foePlate} ${rt.liftFoe}`}>
          <button
            type="button"
            className={rt.plateBtn}
            onClick={() => setSheetId(foe.id)}
            title={`${foe.name} 시트 보기`}
          >
            <Nameplate character={foe} sub={highOf(foe.id)} />
          </button>
        </div>
      )}

      <div className={rt.center}>
        {!state.scene && <SceneStarter state={state} run={run} pending={pending} isGm={isGm} />}
        <div className={rt.topStack} data-top-stack="" hidden={rollMode}>
          <Trackers state={state} run={run} isGm={isGm} canControl={canControl} pending={pending} />
          <ZoneMap
            state={state}
            run={run}
            isGm={isGm}
            canControl={canControl}
            pending={pending}
            auto="hidden"
          />
        </div>
        {roll && !rolling && isFolded && outcome && result && (
          <button
            type="button"
            className={styles.foldedRoll}
            data-tone={JUDGE[outcome].tone}
            onClick={() => setFolded('')}
            title="굴림 결과 펼치기"
          >
            <b>{JUDGE[outcome].word}</b>
            <span className={styles.foldedText}>
              {activeChar?.name} · {term(roll.action)} · {term(roll.active.approach)}{' '}
              <em>{signed(result.total)}</em>
            </span>
            <span className={styles.foldedMore}>다시 보기 ▴</span>
          </button>
        )}
      </div>

      {waitingOn && (
        <div className={`${styles.waitChip} ${rt.wait}`}>
          <span className={styles.dots} aria-hidden />
          {waitingOn}
          {isGm && roll && (
            <button type="button" onClick={() => setGmTakeOver(roll.id)}>
              대신 고르기
            </button>
          )}
        </div>
      )}

      {/* 장면에 깔린 특성: 장면 여기저기에 붙는다. 판정 중에는 판정판 둘레로 옮겨 간다 */}
      <div className={th.tags}>
        {tagAspects.map((a, i) => {
          const spots = rollMode ? TAG_SPOTS_ROLL : TAG_SPOTS;
          const spot = spots[i % spots.length]!;
          const lap = Math.floor(i / spots.length) * 5;
          const can = !!playable(a);
          return (
            <div
              key={a.id}
              className={`${th.tag} ${rt.tag}`}
              style={{ left: `${spot[0] + lap}%`, top: `${spot[1] + lap}%` }}
              data-hidden={a.hidden || undefined}
            >
              <TraitCard
                aspect={a}
                art={artOf(a)}
                owner={ownerName(a)}
                depth={consequenceDepth(a, state)}
                size="tag"
                badge={can ? (rerollMode ? '다시' : '+2') : a.hidden ? 'GM만' : undefined}
                state={can ? 'can' : undefined}
                onClick={can ? () => play(a) : undefined}
              />
              {isGm && !rollMode && (
                <div className={rt.aspectTools}>
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
          );
        })}
        {isGm && state.scene && !rollMode && (
          <button
            type="button"
            className={`${th.tag} ${rt.addAspect}`}
            style={{ left: '24%', top: '58%' }}
            onClick={() => setGmOpen({ tool: 'aspect' })}
          >
            + {term('aspect')} 붙이기
          </button>
        )}
      </div>

      <div className={th.duelSlot}>
        {rolling && (
          <Duel
            kind={`${term(rolling.action)} 판정`}
            me={{
              name: rolling.name,
              note: rolling.head,
              dice: <PendingDice mode={diceMode} />,
              total: null,
            }}
            opp={
              rolling.target !== undefined
                ? {
                    name: rolling.target,
                    note: `${term('defend')} 준비 중`,
                    dice: (
                      <DiceTray dice={null} rollKey="pending" sealed tone="op" mode={diceMode} />
                    ),
                    total: null,
                  }
                : { difficulty: rolling.difficulty ?? 0 }
            }
            outcome={null}
            provisional
            canRaise={false}
            played={[]}
          />
        )}
        {roll && !rolling && !isFolded && (
          <Duel
            kind={`${term(roll.action)} 판정`}
            me={{
              name: activeChar?.name ?? '',
              note: `${term(roll.active.approach)} ${signed(roll.active.rating)}`,
              dice: rerolling ? (
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
              ),
              total: roll.active.dice && settled && result ? sideTotal(roll.active) : null,
            }}
            opp={
              roll.targetId
                ? {
                    name: state.characters[roll.targetId]?.name ?? '',
                    note: roll.defense
                      ? `${term('defend')} · ${term(roll.defense.approach)} ${signed(roll.defense.rating)}`
                      : `${term('defend')} 준비 중`,
                    dice: (
                      <DiceTray
                        dice={roll.defense?.dice ?? null}
                        rollKey={`${roll.id}:d:${roll.defense?.animSeed ?? 'x'}`}
                        sealed={!roll.defense}
                        tone="op"
                        mode={diceMode}
                      />
                    ),
                    total: roll.defense?.dice && settled ? sideTotal(roll.defense) : null,
                  }
                : { difficulty: roll.difficulty ?? 0 }
            }
            outcome={settled && outcome && result ? outcome : null}
            provisional={roll.status !== 'final'}
            canRaise={!!handSide}
            played={played}
            copy={settled && outcome ? OUTCOME_COPY[roll.action][outcome] : undefined}
          >
            {roll.status === 'awaiting_defense' && (
              <p className={th.waiting}>굴림 완료. 상대를 기다리는 중</p>
            )}
            {settled && roll.status === 'open' && iRoll && unusedStunt && (
              <button
                type="button"
                className={th.ghost}
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
            {settled && iAdjustDefense && defenseStunt && (
              <button
                type="button"
                className={th.ghost}
                disabled={pending}
                onClick={() =>
                  void run({
                    type: 'stunt.apply',
                    payload: { rollId: roll.id, side: 'defense', stuntId: defenseStunt.id },
                  })
                }
              >
                {term('stunt')} 적용: {defenseStunt.text}
              </button>
            )}
            {roll.status === 'final' && settled && (
              <button type="button" className={th.ghost} onClick={() => setFolded(rollKey)}>
                이야기로
              </button>
            )}
            {settled && roll.status === 'open' && !iRoll && !iAdjustDefense && (
              <p className={th.waiting}>
                {josa(activeChar?.name ?? '', '이/가')} 결과를 정하는 중…
              </p>
            )}
          </Duel>
        )}
      </div>

      {/* 손패: 지금 조정하는 캐릭터의 특성. 누르면 판정판에 +2가 꽂힌다 */}
      <div className={th.hand} data-roll-tray="">
        {handAspects.map((a, i) => {
          const can = !!playable(a);
          const used = !!handMods?.some((m) => m.source === `aspect:${a.id}`);
          return (
            <TraitCard
              key={a.id}
              aspect={a}
              art={artOf(a)}
              badge={can ? (rerollMode ? '다시' : '+2') : undefined}
              state={can ? 'can' : used ? 'used' : 'off'}
              onClick={can ? () => play(a) : undefined}
              className={fan(i, handAspects.length)}
            />
          );
        })}
      </div>
      {handChar && (
        <div className={th.chips}>
          <div className={th.stack} aria-label={`${term('fatePoint')} ${handFate}`}>
            {Array.from({ length: Math.max(1, Math.min(handFate, 6)) }, (_, i) => (
              <i key={i} style={handFate === 0 ? { opacity: 0.2 } : undefined} />
            ))}
          </div>
          <div className={th.chipText}>
            {handChar.isNpc ? `GM ${term('fatePoint')}` : term('fatePoint')}
            <b>{handFate}</b>
          </div>
          <div className={th.modeSwitch} role="radiogroup" aria-label="카드 쓰는 법">
            <button type="button" aria-pressed={!rerollMode} onClick={() => setRerollMode(false)}>
              +2 더하기
            </button>
            <button type="button" aria-pressed={rerollMode} onClick={() => setRerollMode(true)}>
              다시 굴리기
            </button>
          </div>
        </div>
      )}
      <div className={th.go}>
        {settled && roll?.status === 'open' && iRoll && !overlayOpen && (
          <>
            {finalizeWait && <p className={th.waiting}>{finalizeWait}</p>}
            <button
              type="button"
              className={th.btn}
              disabled={!!finalizeWait || finalizing || pending}
              onClick={() => void onFinalize()}
            >
              이대로 확정
            </button>
          </>
        )}
        {settled && iAdjustDefense && !overlayOpen && (
          <button type="button" className={th.btn} disabled={pending} onClick={onDefenseDone}>
            방어 조정 완료
          </button>
        )}
      </div>

      <section
        className={`${th.dialogue} ${handSide ? '' : rt.keepSay}`}
        data-log={logOpen || undefined}
      >
        {me && !busyRoll && (
          <div className={rt.picks} data-ink="night">
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
                      onClick={() => {
                        setActingId(c.id);
                        setTargetId('');
                      }}
                    >
                      {c.portraitUrl ? (
                        <img src={c.portraitUrl} alt="" />
                      ) : (
                        <span>{initialOf(c.name)}</span>
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
                          <span>{initialOf(c.name)}</span>
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
            {me.standing && Object.keys(me.standing).length > 1 && (
              <div className={styles.chipRow} role="radiogroup" aria-label="표정">
                <span className={styles.chipLabel}>표정</span>
                {EXPRESSIONS.filter((e) => me.standing?.[e.id]).map((e) => {
                  const on = (me.expression ?? 'neutral') === e.id;
                  return (
                    <button
                      key={e.id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      className={styles.face}
                      onClick={() =>
                        !on &&
                        void run({
                          type: 'character.expression',
                          payload: {
                            characterId: me.id,
                            expression: e.id === 'neutral' ? null : e.id,
                          },
                        })
                      }
                    >
                      {e.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
        <div className={th.say}>
          <span className={th.speaker}>{speaker}</span>
          <div className={`${th.text} ${rt.text}`}>
            <StoryLog
              variant="book"
              lines={lines}
              undone={undone}
              sending={
                narrationEcho
                  ? [...sending, { id: -1, text: `GM: ${narrationEcho}`, fx: true }]
                  : sending
              }
              {...(isGm
                ? {
                    onUndo: (seq: number) =>
                      void run({ type: 'event.undo', payload: { targetSeq: seq } }),
                  }
                : {})}
            />
          </div>
          {role !== 'spectator' && (
            <div className={`${styles.composer} ${rt.composer}`} data-gm={isGm || undefined}>
              {isGm && (
                <div className={styles.composeTabs} role="tablist" aria-label="쓸 종류">
                  {(
                    [
                      ['narrate', '대사'],
                      ['chat', '말하기'],
                    ] as const
                  ).map(([m, label]) => (
                    <button
                      key={m}
                      type="button"
                      role="tab"
                      aria-selected={composeMode === m}
                      title={
                        m === 'narrate' ? 'GM 대사: 장면 묘사로 책에 기록' : '말하기: 테이블 대화'
                      }
                      onClick={() => setComposeMode(m)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
              {isGm && (
                <StageFxMenu
                  run={run}
                  characters={stageCharacters}
                  focusId={talk?.focus ?? castLeft?.id}
                />
              )}
              {isGm && composeMode === 'narrate' ? (
                <div className={styles.narrate}>
                  <NarrationInput run={run} onEcho={setNarrationEcho} />
                </div>
              ) : (
                <form
                  className={styles.chat}
                  onSubmit={(e) => {
                    e.preventDefault();
                    const text = chat.trim();
                    if (!hasVisibleText(text)) return;
                    setChat('');
                    // 못 보냈으면 쓴 글을 되살린다 (그 사이 새로 쓴 게 없을 때만)
                    void sendChat(text).then((ok) => {
                      if (!ok) setChat((cur) => (cur ? cur : text));
                    });
                  }}
                >
                  {voices.length > 0 && (
                    <select
                      className={styles.voice}
                      value={as}
                      onChange={(e) => setSpeakAs(e.target.value)}
                      aria-label="말할 사람"
                      title="NPC로 말하면 무대에 서서 말풍선으로 말한다"
                    >
                      <option value="">GM으로</option>
                      {voices.map((c) => (
                        <option key={c.id} value={c.name}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  )}
                  <input
                    ref={chatField}
                    value={chat}
                    onChange={(e) => setChat(e.target.value)}
                    onKeyDown={(e) => {
                      if (formatShortcut(e, chat, setChat)) return;
                      if (e.key === 'Escape') e.currentTarget.blur();
                    }}
                    maxLength={500}
                    placeholder={as ? `${josa(as, '으로/로')} 말하기… (Enter)` : '말하기… (Enter)'}
                    aria-label="채팅"
                  />
                  <FormatBar field={chatField} value={chat} onChange={setChat} gm={isGm} />
                  <button type="submit" disabled={!hasVisibleText(chat)}>
                    보내기
                  </button>
                </form>
              )}
            </div>
          )}
          <div className={th.sys}>
            <button type="button" onClick={() => setLogOpen((o) => !o)}>
              {logOpen ? '이야기 접기' : '지난 이야기'}
            </button>
            <button type="button" onClick={() => setTableOpen(true)}>
              탁자 보기 Tab
            </button>
            {me && (
              <button type="button" onClick={() => setSheetId(me.id)}>
                내 시트
              </button>
            )}
          </div>
        </div>
        <div className={`${th.menu} ${rt.menu}`}>
          {me ? (
            <ActionMenu
              character={me}
              action={action}
              approach={approach}
              disabled={
                !state.scene ||
                pending ||
                busyRoll ||
                !!rolling ||
                me.takenOut === true ||
                overlayOpen ||
                palette
              }
              // 난이도를 아는 굴림(공격이 아닌 것)은 접근법마다 성공할 가능성을 미리 보여 준다
              {...(action && action !== 'attack'
                ? {
                    odds: (ap: Approach) =>
                      chanceAtLeast(
                        difficulty -
                          (me.approaches[ap] + stuntBonuses(me, action, ap).length * 2) +
                          1,
                      ),
                  }
                : {})}
              onAction={(a) => {
                if (a) pickAction(a);
                else setAction(null);
                setApproach(null);
              }}
              onApproach={setApproach}
              onRoll={() => void onRoll()}
            />
          ) : (
            <p className={rt.watch}>
              {role === 'spectator'
                ? '관전 중. 이야기를 함께 본다'
                : '캐릭터를 데려오면 움직일 수 있다'}
            </p>
          )}
          {role === 'player' && (
            <BringCharacter
              run={run}
              has={controllable.length > 0}
              brought={new Set(controllable.flatMap((c) => (c.sourceKey ? [c.sourceKey] : [])))}
            />
          )}
        </div>
      </section>

      <Presence show={!!(iDefend && defender && roll)}>
        {iDefend && defender && roll && (
          <div className={tryStyles.overlay} data-overlay="">
            <div className={tryStyles.prompt} role="dialog" aria-label={`${term('defend')} 고르기`}>
              <div className={tryStyles.promptHead}>
                {activeChar?.name}의 {term(roll.action)}! {josa(defender.name, '은/는')} 어떻게
                막을까?
              </div>
              <p className={tryStyles.promptHelp}>
                {term('defend')}에 쓸 {term('approach')} 고르기. 두 결과가 동시에 공개된다.
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
      </Presence>

      <Presence show={!!(compel && state.aspects[compel.aspectId])}>
        {compel && state.aspects[compel.aspectId] && (
          <div className={tryStyles.overlay} data-overlay="">
            <CompelOffer
              aspect={state.aspects[compel.aspectId] as Aspect}
              text={compel.text}
              targetId={compel.targetId}
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
      </Presence>

      <Presence show={!!(damage && !compel)}>
        {damage && !compel && (
          <div className={tryStyles.overlay} data-overlay="">
            <DamagePrompt
              damage={damage}
              character={state.characters[damage.targetId]!}
              run={run}
              pending={pending}
            />
          </div>
        )}
      </Presence>

      <Presence show={!!prompt}>
        {prompt && (
          <div className={tryStyles.overlay} data-overlay="">
            <form
              className={tryStyles.prompt}
              onSubmit={(e) => {
                e.preventDefault();
                void submitPrompt();
              }}
            >
              <div className={tryStyles.promptHead}>
                {prompt.kind === 'aspect'
                  ? `새 ${term('aspect')} 이름 짓기 · ${term('freeInvoke')} ${prompt.freeInvokes}`
                  : `${term('boost')} 이름 짓기`}
              </div>
              <p className={tryStyles.promptHelp}>
                {prompt.kind === 'aspect'
                  ? '장면에 새로 생긴 사실을 짧은 문구로'
                  : '한 번 쓰고 사라지는 순간의 기회'}
              </p>
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') closePrompt();
                }}
                maxLength={40}
                placeholder={
                  prompt.kind === 'aspect' ? '예: 연기로 가득 찬 복도' : '예: 잠깐 휘청임'
                }
                className={tryStyles.promptInput}
              />
              <div className={tryStyles.promptButtons}>
                <button type="button" onClick={() => closePrompt()} className={tryStyles.restart}>
                  건너뛰기 <kbd aria-hidden>Esc</kbd>
                </button>
                <button
                  type="submit"
                  className={tryStyles.promptOk}
                  disabled={!draft.trim() || naming}
                >
                  붙이기 <kbd aria-hidden>Enter</kbd>
                </button>
              </div>
            </form>
          </div>
        )}
      </Presence>

      {isGm && moodOpen && state.scene && (
        <MoodPanel scene={state.scene} run={run} onClose={() => setMoodOpen(false)} />
      )}

      <TableView
        open={tableOpen}
        onClose={() => setTableOpen(false)}
        scene={{
          name: state.scene?.name ?? '장면 없음',
          image: sceneArt,
          note:
            roll && roll.status !== 'final'
              ? `${activeChar?.name ?? ''}의 ${term(roll.action)} 판정 중`
              : undefined,
        }}
        sceneAspects={[...sceneAspects, ...hiddenAspects].filter(
          (a) => a.ownerType !== 'character',
        )}
        foes={party.filter((c) => c.isNpc).map(seatOf)}
        seats={party.filter((c) => !c.isNpc).map(seatOf)}
        gmPool={state.gmPool}
        card={(a) => (
          <TraitCard
            aspect={a}
            art={artOf(a)}
            owner={ownerName(a)}
            depth={consequenceDepth(a, state)}
            size="small"
          />
        )}
      />

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
          onArt={() => {
            setArtOpen({ tab: 'standing', characterId: sheet.id });
            setSheetId(null);
          }}
        />
      )}

      {artOpen && (
        <ArtDialog
          open={artOpen}
          state={state}
          run={run}
          isGm={isGm}
          userId={room.userId}
          onClose={() => setArtOpen(null)}
        />
      )}

      {exitOpen && (
        <ExitRoomDialog
          roomId={room.roomId}
          roomName={name}
          isGm={isGm}
          onCancel={() => setExitOpen(false)}
          onDone={() => router.replace('/rooms/')}
        />
      )}
      {palette && <CommandPalette build={paletteEntries} onClose={() => setPalette(false)} />}
      {help && <ShortcutHelp isGm={isGm} onClose={() => setHelp(false)} />}
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
  const best = Math.max(...APPROACHES.map((a) => defender.approaches[a]));
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (pending || isTyping(e.target) || e.ctrlKey || e.metaKey || isDialogOpen()) return;
      const i = keys.indexOf(e.key.toLowerCase());
      if (i >= 0) onPick(APPROACHES[i]!);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pending, onPick]);
  return (
    <div
      className={styles.defendGrid}
      role="group"
      aria-label={`${term('defend')}에 쓸 ${term('approach')}`}
    >
      {APPROACHES.map((a, i) => (
        <button
          key={a}
          type="button"
          className={styles.defendBtn}
          disabled={pending}
          data-best={defender.approaches[a] === best || undefined}
          onClick={() => onPick(a)}
        >
          <kbd aria-hidden>{keys[i]!.toUpperCase()}</kbd>
          <b>{signed(defender.approaches[a])}</b>
          <span>{term(a)}</span>
        </button>
      ))}
    </div>
  );
}
