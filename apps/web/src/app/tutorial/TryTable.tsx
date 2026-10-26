'use client';

import { LADDER_LABELS, term, tip } from '@fate/glossary';
import {
  type Outcome,
  absorbOptions,
  APPROACHES,
  canInvoke,
  CommandError,
  formatRating,
  outcomeFor,
  previewInvokes,
  resolveRoll,
  sideTotal,
  stuntBonuses,
  sumDice,
  type Action,
  type Actor,
  type Approach,
  type Aspect,
  type Command,
  type Dice,
  type InvokeMode,
  type PaidWith,
  type Reward,
  type RollState,
  type RoomState,
} from '@fate/rules-engine';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { AspectCard } from '@/components/aspect/AspectCard';
import { CompelOffer } from '@/components/compel/CompelOffer';
import { StoryLog } from '@/components/log/StoryLog';
import { FoePlate } from '@/components/book/FoePlate';
import { MySheet } from '@/components/book/MySheet';
import { ActionBar, type CoachFocus } from '@/components/roll/ActionBar';
import { DICE_MODES, DiceTray, saveDiceMode, type DiceMode } from '@/components/roll/DiceTray';
import { InvokeTray, type InvokeChoice } from '@/components/roll/InvokeTray';
import { OutcomeBanner } from '@/components/roll/OutcomeBanner';
import { RollPreview } from '@/components/roll/RollPreview';
import { CoachMark, type Coach } from '@/components/tutorial/CoachMark';
import { Spotlight } from '@/components/tutorial/Spotlight';
import { BOSS, SAMPLE_CHARACTERS, SCENE, type SampleCharacter } from '@/content/oneshot';
import { playSfx, setSfxEnabled, sfxEnabled, sfxForEvent, sfxForOutcome } from '@/fx/sfx';
import { asset } from '@/lib/asset';
import { Presence, reducedMotion, revealOnNarrow } from '@/lib/motion';
import { Typewriter } from '@/components/ui/Typewriter';
import { describe, ERROR_COPY, OUTCOME_COPY } from '@/lib/copy';
import { josa } from '@/lib/josa';
import { LocalRoom } from '@/state/localRoom';
import book from './book.module.css';
import styles from './try.module.css';

const ME: Actor = { userId: 'me', role: 'player' };
const GM: Actor = { userId: 'gm', role: 'gm' };

const BLOCK_REASON: Record<string, string> = {
  NOT_ENOUGH_FATE_POINTS: '운명점이 부족해요',
  ASPECT_ALREADY_INVOKED: '이번 굴림에 이미 썼어요',
};

const COMPEL_TEXT: Record<string, string> = {
  hayun: '맹세가 발목을 잡아요. 도적이 인질을 앞세우자, 하윤은 칼을 거둘 수밖에 없어요.',
  leo: '레오가 불길 옆 약병을 "잠깐만 확인"하다가 연기가 확 번져요.',
  mira: '미라는 동료의 신호를 믿지 못하고 혼자 움직이다 위치가 드러나요.',
};

/**
 * 단계별 튜토리얼 순서: 소개 → 1 극복 → 2 이점 만들기 → 3 공격 → 4 방어 → 자유 진행.
 * 진행 중에는 지금 단계의 버튼만 열어 두고 나머지는 어둡게 덮어 막는다.
 */
type Lesson = 'intro' | Action | 'free';
const LESSONS: Action[] = ['overcome', 'create_advantage', 'attack', 'defend'];

/** 행동마다: 무엇인지, 언제 쓰는지, 지금 해 볼 일 */
const LESSON_COPY: Record<Action, { title: string; body: string; example: string }> = {
  overcome: {
    title: `${term('overcome')}: 앞을 막는 걸 넘어서요`,
    body: '길을 막는 장애물을 넘을 때 써요. 불길 뚫고 달리기, 잠긴 문 열기 같은 일이죠. 정해진 난이도보다 높게 나오면 넘어가요.',
    example: `불길이 앞을 막고 있어요. 1번 ${josa(`"${term('overcome')}"`, '을/를')} 눌러 뚫어 봐요.`,
  },
  create_advantage: {
    title: `${term('create_advantage')}: 싸우기 전에 판을 깔아요`,
    body: `바로 이기기보다 유리한 상황을 준비해요. 성공하면 장면에 새 ${term('aspect')}을 붙이고, 그걸 공짜로 쓸 ${term('freeInvoke')}도 받아요. 연기로 두목의 눈을 가리는 것처럼요.`,
    example: `2번 ${josa(`"${term('create_advantage')}"`, '을/를')} 눌러 싸우기 전에 판을 깔아 봐요.`,
  },
  attack: {
    title: `${term('attack')}: 상대에게 피해를 줘요`,
    body: `상대를 쓰러뜨리거나 물러나게 할 때 써요. 상대도 ${term('defend')}로 맞서 굴리고, 내가 이긴 만큼 피해가 들어가요. 못 버티면 상대는 장면에서 탈락해요.`,
    example: `3번 ${josa(`"${term('attack')}"`, '을/를')} 눌러 다락 위 두목을 노려 봐요.`,
  },
  defend: {
    title: `${term('defend')}: 공격이나 방해를 막아요`,
    body: '누가 나를 공격하거나 방해하면, 내 차례가 아니어도 바로 굴려 맞서요. 이기면 피해를 피하고, 지면 진 차이만큼 받아요.',
    example: `두목이 도끼를 치켜들었어요! 4번 ${josa(`"${term('defend')}"`, '을/를')} 눌러 막아요.`,
  },
};

/** 행동 × 결과 4단계가 실제로 무슨 뜻인지 (용어집 기준, 입문자용으로 풀어서) */
const OUTCOME_DETAIL: Record<Action, Record<Outcome, string>> = {
  overcome: {
    fail: '실패: 넘지 못해요. 아니면 GM이 정한 큰 대가를 치르고 억지로 넘을 수도 있어요.',
    tie: '동점: 넘어가긴 하지만 작은 대가가 따라요. 옷이 그을리거나 시간이 걸리는 식이죠.',
    success: '성공: 깔끔하게 넘어가요.',
    style: `대성공: 깔끔하게 넘어가고 ${term('boost')}까지 얻어요.`,
  },
  create_advantage: {
    fail: `실패: ${term('aspect')}을 못 만들거나, 만들어도 상대가 그 ${term('freeInvoke')}을 가져가요.`,
    tie: `동점: 오래가는 ${term('aspect')} 대신 한 번 쓰고 사라지는 ${term('boost')}를 얻어요.`,
    success: `성공: 새 ${term('aspect')}을 붙이고 ${term('freeInvoke')} 1개를 받아요.`,
    style: `대성공: 새 ${term('aspect')}을 붙이고 ${term('freeInvoke')} 2개를 받아요.`,
  },
  attack: {
    fail: '실패: 빗나가요. 피해는 없어요.',
    tie: `동점: 피해는 못 주지만 ${term('boost')}를 얻어요.`,
    success: `성공: 이긴 차이만큼 피해를 줘요. 상대는 ${term('stress')}나 ${term('consequence')}으로 받아내야 해요.`,
    style: `대성공: 차이만큼 피해를 줘요. 원하면 피해를 1 덜 주는 대신 ${term('boost')}를 얻을 수도 있어요.`,
  },
  defend: {
    fail: '실패: 상대의 공격이 통해요. 진 차이만큼 피해를 받아요.',
    tie: `동점: 막긴 했지만 상대가 ${term('boost')}를 얻어요.`,
    success: '성공: 막아내요. 피해를 하나도 받지 않아요.',
    style: `대성공: 막아내고 ${term('boost')}까지 얻어요.`,
  },
};
const OUTCOME_ORDER: Outcome[] = ['fail', 'tie', 'success', 'style'];

/**
 * 튜토리얼 장마다 정해 둔 굴림 결과 (상대 수치와의 차이). 네 장을 지나면 결과 4단계를 다 겪는다:
 * 1장 실패 → 발동으로 성공, 2장 대성공, 3장 동점 → 무료 발동으로 성공, 4장 방어 대성공.
 */
const SCRIPT: Record<Action, { first: number; reroll: number }> = {
  overcome: { first: -1, reroll: 1 },
  create_advantage: { first: 3, reroll: 3 },
  attack: { first: 0, reroll: 2 },
  defend: { first: 3, reroll: 3 },
};
const OUTCOME_RULE =
  '상대보다 낮으면 실패, 같으면 동점, 1~2 높으면 성공, 3 이상 높으면 대성공이에요. 화면에는 차례로 MISS, GOOD, GREAT, PERFECT라고 떠요.';

const sign = (n: number) => `${n >= 0 ? '+' : ''}${n}`;
const faces = (d: Dice) => d.map((f) => (f > 0 ? '＋' : f < 0 ? '－' : '○')).join(' ');

/** 설명만 하는 카드: 읽고 다음을 누르면 사라지고, then이 있으면 이어서 실행한다 */
interface Note {
  chapter: string;
  step: number;
  title: string;
  body: string;
  points?: string[];
  /** "더 보기" 대신 쓸 문구 */
  moreLabel?: string;
  example?: string;
  open?: string[];
  ring?: string;
  label?: string;
  then?: () => void;
}

interface Tour {
  coach: Coach & { focus?: CoachFocus };
  /** 밝게 남길 곳 (안내 카드는 항상 남긴다) */
  open: string[];
  ring?: string;
  /** 단계별 진행 중이면 행동 막대를 이 단계로 잠근다 */
  guide?: { focus: CoachFocus | null; action?: Action };
  lockFinalize?: boolean;
}

function findId(state: RoomState, name: string): string {
  return Object.values(state.characters).find((c) => c.name === name)!.id;
}

function setupRoom(pick: SampleCharacter): LocalRoom {
  const room = new LocalRoom();
  room.run(GM, { type: 'character.create', payload: BOSS });
  for (const s of SAMPLE_CHARACTERS) {
    room.run(GM, {
      type: 'character.create',
      payload: { ...s.create, ownerId: s.key === pick.key ? ME.userId : 'bot' },
    });
  }
  room.run(GM, { type: 'session.start', payload: { title: '튜토리얼' } });
  room.run(GM, { type: 'scene.start', payload: { name: SCENE.name, aspects: SCENE.aspects } });
  room.run(GM, { type: 'narration.post', payload: { text: SCENE.opening } });
  // 튜토리얼이 길어지지 않게 두목은 이미 많이 다친 채로 시작한다: 스트레스 1·2번 칸과 중상·중태가 차 있다
  const bossId = findId(room.getSnapshot().state, BOSS.name);
  const hurt = (
    stressBox: 1 | 2 | null,
    consequences: { slot: 'moderate' | 'severe'; text: string }[],
  ) => ({
    type: 'damage.absorbed' as const,
    actorId: GM.userId,
    visibility: 'public' as const,
    payload: {
      rollId: `prelude-${stressBox ?? 'c'}`,
      targetId: bossId,
      stressBox,
      consequences: consequences.map((c) => ({ ...c, aspectId: `prelude-${c.slot}` })),
    },
  });
  room.seed([
    hurt(1, []),
    hurt(2, []),
    hurt(null, [
      { slot: 'moderate', text: '깊게 베인 어깨' },
      { slot: 'severe', text: '부러진 갈비뼈' },
    ]),
  ]);
  return room;
}

export function TryTable() {
  const [pick, setPick] = useState<SampleCharacter | null>(null);
  const room = useMemo(() => (pick ? setupRoom(pick) : null), [pick]);
  if (!pick || !room) return <Picker onPick={setPick} />;
  return <Table room={room} pick={pick} onRestart={() => setPick(null)} />;
}

function Picker({ onPick }: { onPick: (s: SampleCharacter) => void }) {
  // 고른 카드가 앞으로 나서고 나머지가 물러난 뒤에 무대로 넘어간다
  const [chosen, setChosen] = useState<string | null>(null);
  const choose = (s: SampleCharacter) => {
    if (chosen) return;
    // 좁은 화면에서는 카드를 고르려고 내려온 만큼 무대도 내려가 있으니 맨 위에서 시작한다
    const go = () => {
      onPick(s);
      window.scrollTo(0, 0);
    };
    if (reducedMotion()) return go();
    setChosen(s.key);
    playSfx('token-flip', 0.35);
    window.setTimeout(go, 560);
  };
  return (
    <main className={styles.picker} data-chosen={chosen ? '' : undefined}>
      <header className={styles.pickHead}>
        <p className={styles.pickKicker}>튜토리얼 · 첫 장면 「{SCENE.name}」</p>
        <h1 className={styles.pickTitle}>누구로 플레이할까요?</h1>
        <p className={styles.pickLead}>
          한 명을 골라 5분 안에 첫 굴림까지 가 봐요. 규칙은 몰라도 괜찮아요.
        </p>
      </header>
      <ol className={styles.pickGrid} aria-label="등장인물">
        {SAMPLE_CHARACTERS.map((s, i) => {
          // 가장 높은 접근법 둘: 이 캐릭터가 무엇을 잘하는지 한눈에
          const top = (Object.entries(s.create.approaches) as [Approach, number][])
            .sort((a, b) => b[1] - a[1])
            .slice(0, 2);
          return (
            <li key={s.key} className={styles.pickItem}>
              <button
                type="button"
                className={styles.pickCard}
                data-chosen={chosen === s.key || undefined}
                aria-label={`${josa(s.name, '으로/로')} 시작하기. ${s.blurb}. ${term('high')}: ${s.create.highConcept}. ${term('trouble')}: ${s.create.trouble}`}
                onClick={() => choose(s)}
              >
                <span className={styles.pickPhoto} aria-hidden>
                  <img src={asset(s.image)} alt="" className={styles.pickImg} />
                  <span className={styles.pickNo}>{i + 1}</span>
                </span>
                <span className={styles.pickInfo} aria-hidden>
                  <span className={styles.pickName}>{s.name}</span>
                  <span className={styles.pickBlurb}>{s.blurb}</span>
                  <span className={styles.pickIndex}>
                    <span className={styles.pickLabel}>{term('high')}</span>
                    <span className={styles.pickHand}>{s.create.highConcept}</span>
                    <span className={styles.pickLabel} data-trouble>
                      {term('trouble')}
                    </span>
                    <span className={styles.pickHand}>{s.create.trouble}</span>
                  </span>
                  <span className={styles.pickStats}>
                    {top.map(([a, v]) => (
                      <span key={a}>
                        <b>{sign(v)}</b> {term(a)}
                      </span>
                    ))}
                  </span>
                  <span className={styles.pickGo}>{josa(s.name, '으로/로')} 시작 →</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </main>
  );
}

type Prompt = { kind: 'aspect'; freeInvokes: 1 | 2 } | { kind: 'boost' } | null;

function Table({
  room,
  pick,
  onRestart,
}: {
  room: LocalRoom;
  pick: SampleCharacter;
  onRestart: () => void;
}) {
  const { state, events } = useSyncExternalStore(
    room.subscribe,
    room.getSnapshot,
    room.getSnapshot,
  );
  const meId = useMemo(() => findId(room.getSnapshot().state, pick.name), [room, pick]);
  const bossId = useMemo(() => findId(room.getSnapshot().state, BOSS.name), [room]);
  const me = state.characters[meId]!;
  const boss = state.characters[bossId]!;

  const [action, setAction] = useState<Action | null>(null);
  const [approach, setApproach] = useState<Approach | null>(null);
  const [rollId, setRollId] = useState<string | null>(null);
  const [settled, setSettled] = useState(false);
  // 좁은 화면: 결과가 나오면 패널이 다시 보이게 (안내 카드가 위에 생겨도)
  useEffect(() => {
    if (settled) revealOnNarrow(document.querySelector('[data-roll-panel]'));
  }, [settled]);
  const [selectedAspect, setSelectedAspect] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<Prompt>(null);
  const [draft, setDraft] = useState('');
  const [diceMode, setDiceMode] = useState<DiceMode>('3d');
  const [error, setError] = useState<string | null>(null);
  const compelled = useRef(false);
  const [lesson, setLesson] = useState<Lesson>('intro');
  const [introStep, setIntroStep] = useState(0);
  // 이번 굴림에서 발동을 한 번 해 봤는지 (튜토리얼 발동 단계는 한 번이면 충분하다)
  const [invokedRoll, setInvokedRoll] = useState<string | null>(null);
  // 읽고 넘기는 설명 카드 줄 (굴림 뒤 해설, 강요 소개 등)
  const [notes, setNotes] = useState<Note[]>([]);
  // 결과 해설 카드를 이미 본 굴림
  const [explained, setExplained] = useState<string | null>(null);
  // 캐릭터를 고른 뒤에만 그려지는 화면이라 처음부터 브라우저 설정을 읽어도 된다
  const [sfxOn, setSfxOn] = useState(sfxEnabled);

  // 새 이벤트마다 어울리는 효과음 (한 번에 같은 소리는 한 번만)
  const heard = useRef(-1);
  useEffect(() => {
    const last = events.at(-1)?.seq ?? -1;
    if (heard.current < 0) {
      heard.current = last;
      return;
    }
    const names = new Set(
      events
        .filter((e) => e.seq > heard.current)
        .map(sfxForEvent)
        .filter((n) => n !== null),
    );
    heard.current = last;
    names.forEach((n) => playSfx(n));
  }, [events]);

  const roll: RollState | undefined = rollId ? state.rolls[rollId] : undefined;
  const final = roll?.status === 'final';
  const busy = !!roll && !final;
  // 두목이 나를 공격해 와서 내가 막을 차례
  const defending = roll?.status === 'awaiting_defense' && roll.targetId === meId;
  const myRoll = !!roll && roll.active.characterId === meId;

  const run = useCallback(
    (actor: Actor, cmd: Command) => {
      try {
        setError(null);
        return room.run(actor, cmd);
      } catch (e) {
        const code = e instanceof CommandError ? e.code : '';
        setError(ERROR_COPY[code] ?? '지금은 할 수 없는 행동이에요.');
        return [];
      }
    },
    [room],
  );

  const onRoll = useCallback(() => {
    if (!action || !approach) return;
    const scripted = lesson === action;
    if (defending && roll) {
      // 두목은 완력 +3, 주사위 0으로 공격해 온다
      if (scripted)
        room.forceDice(boss.approaches.forceful + SCRIPT.defend.first - me.approaches[approach]);
      setSettled(false);
      run(ME, { type: 'roll.defend', payload: { rollId: roll.id, approach } });
      return;
    }
    if (busy) return;
    setSettled(false);
    setSelectedAspect(null);
    const isAttack = action === 'attack';
    if (scripted) {
      // 두목의 방어는 신속 + 주사위 0
      const opp = isAttack ? boss.approaches.quick : SCENE.overcomeDifficulty;
      room.forceDice(opp + SCRIPT[action].first - me.approaches[approach]);
      if (isAttack) room.forceDice(0);
    }
    const evs = run(ME, {
      type: 'roll.request',
      payload: {
        characterId: meId,
        action,
        approach,
        ...(isAttack ? { targetId: bossId } : { difficulty: SCENE.overcomeDifficulty }),
      },
    });
    const first = evs[0];
    if (!first) return;
    const id = 'rollId' in first.payload ? (first.payload.rollId as string) : null;
    setRollId(id);
    if (isAttack && id) {
      // GM(자동)이 잠시 뒤 방어 굴림. 그 전까지 내 주사위도 봉인되어 아무도 볼 수 없다.
      window.setTimeout(
        () => run(GM, { type: 'roll.defend', payload: { rollId: id, approach: 'quick' } }),
        900,
      );
    }
  }, [action, approach, busy, defending, roll, run, meId, bossId, lesson, room, boss, me]);

  /** 4장: 두목(GM 자동)이 나를 공격한다. 주사위는 내가 막을 때까지 가려져 있다 */
  const bossAttacks = useCallback(() => {
    setAction(null);
    setApproach(null);
    setSettled(false);
    if (lesson === 'defend') room.forceDice(0);
    const evs = run(GM, {
      type: 'roll.request',
      payload: { characterId: bossId, action: 'attack', approach: 'forceful', targetId: meId },
    });
    const first = evs[0];
    if (first && 'rollId' in first.payload) setRollId(first.payload.rollId as string);
  }, [run, bossId, meId, lesson, room]);

  const myStunts =
    roll && !final && myRoll ? stuntBonuses(me, roll.action, roll.active.approach) : [];
  const unusedStunt = myStunts.find(
    (s) => !roll?.active.modifiers.some((m) => m.source === `stunt:${s.id}`),
  );

  const choices: InvokeChoice[] = useMemo(() => {
    if (!roll || roll.status !== 'open' || roll.active.characterId !== meId) return [];
    const payer = { characterId: meId, fatePoints: me.fatePoints };
    const visible = Object.values(state.aspects).filter(
      (a) =>
        !a.hidden &&
        (a.ownerType !== 'character' ||
          a.ownerId === meId ||
          (roll.defense && a.ownerId === roll.defense.characterId)),
    );
    return visible.map((a): InvokeChoice => {
      const previews = previewInvokes(roll, [a], payer);
      const owner = a.ownerType === 'character' ? state.characters[a.ownerId]?.name : undefined;
      const against = a.ownerType === 'character' && a.ownerId !== meId;
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
  }, [roll, state, me.fatePoints, meId]);

  const onInvoke = (aspectId: string, mode: InvokeMode, paidWith: PaidWith) => {
    if (!roll) return;
    if (mode === 'reroll') setSettled(false);
    if (mode === 'reroll' && lesson === roll.action && roll.active.dice) {
      // 정해 둔 결과로 다시 굴린다: 지금 보너스는 그대로 두고 주사위만 바꾼다
      const { total, shifts } = resolveRoll(roll);
      const opp = total - shifts;
      const rest = total - sumDice(roll.active.dice);
      room.forceDice(opp + SCRIPT[roll.action].reroll - rest);
    }
    setInvokedRoll(roll.id);
    if (lesson !== 'free') {
      const used = state.aspects[aspectId];
      const left = paidWith === 'fate_point' ? me.fatePoints - 1 : me.fatePoints;
      setNotes([
        {
          chapter: `${term('invoke')} 정리`,
          step: 4,
          title:
            paidWith === 'fate_point'
              ? `${term('fatePoint')} ◆ 하나를 썼어요. 이제 ${left}개 남았어요`
              : `${term('freeInvoke')} ● 하나를 썼어요. ${josa(term('fatePoint'), '은/는')} 그대로 ${left}개예요`,
          body:
            paidWith === 'fate_point'
              ? `${josa(term('fatePoint'), '은/는')} 저절로 다시 생기지 않아요. ${left === 0 ? `이제 0개라서, 앞으로는 ●가 있는 카드로만 ${term('invoke')}할 수 있어요. ${josa(term('compel'), '을/를')} 받아들이면 다시 생겨요.` : `${left}개를 다 쓰면 그 뒤로는 ●가 있는 카드로만 ${term('invoke')}할 수 있어요.`}`
              : used?.kind === 'boost'
                ? `${term('boost')}에는 ●가 하나뿐이라, 쓰자마자 카드째 사라져요.`
                : `"${used?.text ?? ''}"의 ●가 하나 줄었어요. ●를 다 써도 ${term('aspect')}은 남고, 그 뒤로는 ◆를 내야 해요.`,
          open: ['[data-roll-panel]'],
          ring: paidWith === 'fate_point' ? '[data-tour="fate"]' : '[data-tour="invoke-cards"]',
          example:
            mode === 'bonus'
              ? '+2가 합계에 더해졌어요. 결과가 어떻게 바뀌었는지 볼까요?'
              : '주사위를 새로 굴렸어요. 결과가 어떻게 바뀌었는지 볼까요?',
          label: '결과 보기',
        },
      ]);
    }
    run(ME, {
      type: 'invoke.apply',
      payload: { rollId: roll.id, side: 'active', aspectId, mode, paidWith },
    });
    setSelectedAspect(null);
  };

  /** 보상을 처리하고, 피해가 들어갔으면 어떻게 받아냈는지 한 줄로 돌려준다 (튜토리얼 해설용) */
  const handleRewards = useCallback(
    (rewards: Reward[], target: string | null): string | null => {
      for (const r of rewards) {
        if (r.type === 'new_aspect') setPrompt({ kind: 'aspect', freeInvokes: r.freeInvokes });
        if (r.type === 'boost' && r.to === 'self') setPrompt({ kind: 'boost' });
      }
      const pending = Object.values(room.getSnapshot().state.pendingDamage).find(
        (d) => d.targetId === target,
      );
      if (pending) {
        // 자동: 가장 덜 아픈 조합으로 받아내고, 못 받으면 탈락 (두목은 GM이, 내 캐릭터는 내가)
        const targetNow = room.getSnapshot().state.characters[pending.targetId]!;
        const plan = absorbOptions(pending.shifts, targetNow)[0];
        const mine = pending.targetId === meId;
        const who = mine ? '나' : targetNow.name;
        const NAMES = mine
          ? ({ mild: '그을린 팔', moderate: '금이 간 갈비뼈', severe: '깊은 도끼 상처' } as const)
          : ({
              mild: '그을린 소매',
              moderate: '깊게 베인 어깨',
              severe: '부러진 도끼 자루',
            } as const);
        window.setTimeout(() => {
          run(
            mine ? ME : GM,
            plan
              ? {
                  type: 'damage.absorb',
                  payload: {
                    rollId: pending.rollId,
                    takeOut: false,
                    stressBox: plan.stressBox,
                    consequences: plan.consequences.map((slot) => ({ slot, text: NAMES[slot] })),
                  },
                }
              : {
                  type: 'damage.absorb',
                  payload: {
                    rollId: pending.rollId,
                    takeOut: true,
                    stressBox: null,
                    consequences: [],
                  },
                },
          );
        }, 700);
        if (!plan) return `${josa(who, '은/는')} 더 버틸 칸이 없어 탈락해요!`;
        const parts = [
          ...(plan.stressBox ? [`${term('stress')} ${plan.stressBox}번 칸`] : []),
          ...plan.consequences.map((slot) => term(slot)),
        ];
        const used = parts.map((x, k) => (k < parts.length - 1 ? josa(x, '과/와') : x)).join(' ');
        const scars = plan.consequences.map((slot) => `"${NAMES[slot]}"`).join(', ');
        return `${josa(`피해 ${pending.shifts}`, '이/가')} 들어갔어요. ${josa(who, '은/는')} ${josa(used, '으로/로')} 버텨요.${scars ? ` 상처 ${josa(scars, '은/는')} ${term('aspect')}으로 남아요.` : ''}`;
      }
      return null;
    },
    [room, run, meId],
  );

  const onFinalize = () => {
    if (!roll) return;
    // 보스(GM 자동)는 방어 뒤에 따로 조정하지 않는다
    if (roll.defense && !roll.defenseReady)
      run(GM, { type: 'roll.defense_ready', payload: { rollId: roll.id } });
    const evs = run(ME, {
      type: 'roll.finalize',
      payload: { rollId: roll.id, reduceForBoost: false },
    });
    const fin = evs.find((e) => e.type === 'roll.finalized');
    if (!fin || fin.type !== 'roll.finalized') return;
    const hurt = handleRewards(fin.payload.rewards, roll.targetId);
    setAction(null);
    setApproach(null);
    // 이번 장의 행동을 마치면 해설을 읽고 다음 장으로
    if (lesson === roll.action) {
      setLesson(LESSONS[LESSONS.indexOf(roll.action) + 1] ?? 'free');
      setNotes(afterNotes(roll.action, fin.payload.outcome, hurt));
    }
  };

  /** 막아 낸 뒤 확정: 내 쪽 조정을 마치고, GM(자동)이 공격을 확정한다 */
  const onDefenseFinalize = () => {
    if (!roll) return;
    run(ME, { type: 'roll.defense_ready', payload: { rollId: roll.id } });
    const evs = run(GM, {
      type: 'roll.finalize',
      payload: { rollId: roll.id, reduceForBoost: false },
    });
    const fin = evs.find((e) => e.type === 'roll.finalized');
    if (!fin || fin.type !== 'roll.finalized') return;
    const hurt = handleRewards([], roll.targetId);
    setAction(null);
    setApproach(null);
    if (lesson === 'defend') {
      setLesson('free');
      setNotes(afterNotes('defend', outcomeFor(roll, 'defense'), hurt));
    }
  };

  /** 1장이 끝나면 GM이 약점에 강요를 건다. 미리 무엇인지 설명하고 나서 건다 */
  const offerCompel = useCallback(() => {
    const trouble = Object.values(room.getSnapshot().state.aspects).find(
      (a) => a.ownerId === meId && a.kind === 'trouble',
    );
    if (!trouble || compelled.current) return;
    compelled.current = true;
    run(GM, {
      type: 'compel.offer',
      payload: { aspectId: trouble.id, targetId: meId, text: COMPEL_TEXT[pick.key]! },
    });
  }, [room, run, meId, pick.key]);

  /** 각 장을 마친 뒤 실제 결과를 놓고 해 주는 해설 */
  const afterNotes = (a: Action, o: Outcome, hurt: string | null): Note[] => {
    const n = LESSONS.indexOf(a);
    const chapter = `${n + 1}장 정리`;
    const out: Note[] = [
      {
        chapter,
        step: 4,
        title: `방금 결과: ${OUTCOME_COPY[a][o]}`,
        body: OUTCOME_DETAIL[a][o],
        points: OUTCOME_ORDER.filter((x) => x !== o).map((x) => OUTCOME_DETAIL[a][x]),
        moreLabel: '다른 결과였다면?',
        example: `${josa(term(a), '은/는')} 결과마다 이렇게 달라져요.`,
        label: '알겠어요',
      },
    ];
    const gotBoost =
      (a === 'overcome' && o === 'style') ||
      ((a === 'create_advantage' || a === 'attack') && o === 'tie') ||
      (a === 'defend' && o === 'style');
    if (gotBoost)
      out.push({
        chapter,
        step: 4,
        title: `${term('boost')}가 뭐예요?`,
        body: `순간적으로 생긴 작은 기회예요. ${term('aspect')}처럼 ${term('invoke')}해서 +2를 받지만, 한 번 쓰면 사라지고 ${term('fatePoint')}도 들지 않아요.`,
        example:
          '예: "흔들리는 발판", "연기 사이로 난 틈". 다음 굴림이 아쉬울 때 공짜 +2로 써 봐요.',
        label: '다음',
      });
    if (a === 'create_advantage' && (o === 'success' || o === 'style'))
      out.push({
        chapter,
        step: 4,
        title: `${term('freeInvoke')}은 공짜 +2예요`,
        body: `방금 이름 지은 ${term('aspect')}이 무대 아래 장면 카드로 붙었어요. 카드의 ●만큼 ${josa(term('fatePoint'), '을/를')} 내지 않고 ${term('invoke')}할 수 있어요.`,
        points: [
          `${term('freeInvoke')}은 이 ${term('aspect')}을 만든 나나 동료가 쓸 수 있어요.`,
          `다 써도 ${term('aspect')}은 장면에 남아요. 그 뒤로는 ${josa(term('fatePoint'), '을/를')} 내고 ${term('invoke')}하면 돼요.`,
          `이게 ${term('create_advantage')}의 핵심이에요. 미리 준비해 두고, 결정적인 공격에서 공짜로 꺼내 써요.`,
        ],
        moreLabel: '누가, 언제 쓰나요?',
        open: ['[data-tour="aspects"]'],
        ring: '[data-tour="aspects"]',
        example: `다음 장 ${term('attack')}에서 굴림이 아쉬우면 이 카드를 써 봐요.`,
        label: '다음',
      });
    if (hurt)
      out.push({
        chapter,
        step: 4,
        title: '피해는 이렇게 받아내요',
        body: hurt,
        points: [
          `${term('stress')}: 1번, 2번, 3번 칸이 있어요. 받은 피해와 같거나 더 큰 번호의 빈 칸 하나를 채우면 그 피해를 막아요. 장면이 끝나면 다시 비워져요.`,
          `${term('consequence')}: ${term('mild')}은 피해 2, ${term('moderate')}은 4, ${term('severe')}는 6까지 막아 줘요. 대신 상처가 ${term('aspect')}으로 남고, 때린 쪽은 그 상처에 ${term('freeInvoke')} 하나를 얻어요.`,
          '칸과 후유증을 다 써도 못 막으면 탈락해요. 장면에서 빠지고, 어떻게 쓰러지는지는 이긴 쪽이 정해요.',
        ],
        moreLabel: `${term('stress')} · ${term('consequence')} 다시 보기`,
        open: ['[data-tour="party"]'],
        ring: '[data-tour="party"]',
        example:
          a === 'defend'
            ? `내 기록지에서 ${term('stress')} 칸과 ${term('consequence')} 줄을 확인해 봐요.`
            : `${josa(BOSS.name, '은/는')} 이제 ${term('stress')} 3번 칸과 ${term('mild')}만 남았어요. 조금만 더!`,
        label: '다음',
      });
    if (a === 'overcome')
      out.push({
        chapter: '막간 · 강요',
        step: 4,
        title: `GM이 ${josa(term('trouble'), '을/를')} 건드려요: ${term('compel')}`,
        body: `GM이 "네 ${term('trouble')} 때문에 일이 이렇게 꼬여"라고 제안하는 거예요. 받아들이면 곤란해지는 대신 ${term('fatePoint')} 1개를 받아요.`,
        points: [
          `받아들이면: 일이 꼬이는 대신 ${term('fatePoint')} 1개를 받아요. ${josa(term('fatePoint'), '을/를')} 모으는 가장 기본적인 방법이에요.`,
          `거절하면: ${term('fatePoint')} 1개를 내고 꼬이는 걸 막아요.`,
          `모은 ${josa(term('fatePoint'), '으로/로')} 나중에 ${josa(term('aspect'), '을/를')} ${term('invoke')}해 +2를 받아요. 꼬였다가 멋지게 뒤집는 흐름이죠.`,
          '서사형 TRPG에서는 캐릭터가 곤란해질수록 이야기가 재미있어져요.',
        ],
        moreLabel: '받으면? 거절하면?',
        example: '처음이라면 받아들이는 걸 추천해요.',
        label: '강요받아 보기',
        then: offerCompel,
      });
    return out;
  };

  // 체험 시나리오 트리거: 첫 굴림이 확정되면 GM이 약점에 강요를 한 번 건다 (design-system.md 14절 6단계)
  useEffect(() => {
    if (compelled.current || !final || lesson !== 'free') return;
    const trouble = Object.values(state.aspects).find(
      (a) => a.ownerId === meId && a.kind === 'trouble',
    );
    if (!trouble) return;
    // 기다리는 사이 특성이 바뀌어 다시 걸려도 (새 특성 이름 짓기 등) 강요는 한 번만 건다
    const t = window.setTimeout(() => {
      compelled.current = true;
      run(GM, {
        type: 'compel.offer',
        payload: { aspectId: trouble.id, targetId: meId, text: COMPEL_TEXT[pick.key]! },
      });
    }, 1800);
    return () => window.clearTimeout(t);
  }, [final, state.aspects, meId, pick.key, run, lesson]);

  const compel = Object.values(state.compels).find((c) => c.targetId === meId);

  const compelNotes = (accepted: boolean): Note[] => [
    {
      chapter: '막간 · 강요',
      step: 4,
      title: accepted
        ? `${term('fatePoint')} +1! 이야기가 꼬였어요`
        : `${term('fatePoint')} 1개를 내고 막았어요`,
      body: accepted
        ? `기록지의 동전이 하나 늘었어요. 곤란해진 대가로, 나중에 ${josa(term('aspect'), '을/를')} ${term('invoke')}해 멋지게 뒤집을 힘을 얻은 거예요.`
        : `거절은 언제든 할 수 있지만 ${josa(term('fatePoint'), '이/가')} 들어요. 이야기가 재미있어진다면 받아들이는 편이 대개 이득이에요.`,
      open: ['[data-tour="party"]'],
      ring: '[data-tour="party"]',
      example: `${josa(term('fatePoint'), '은/는')} ${josa(term('compel'), '을/를')} 받아들여서 얻고, ${term('invoke')}할 때 써요.`,
      label: '2장으로',
    },
  ];

  const submitPrompt = () => {
    const text = draft.trim();
    if (!text || !prompt) return;
    run(
      ME,
      prompt.kind === 'aspect'
        ? {
            type: 'aspect.add',
            payload: {
              ownerType: 'scene',
              ownerId: state.scene!.id,
              kind: 'situation',
              text,
              freeInvokes: prompt.freeInvokes,
              hidden: false,
            },
          }
        : {
            type: 'aspect.add',
            payload: {
              ownerType: 'character',
              ownerId: meId,
              kind: 'boost',
              text,
              freeInvokes: 0,
              hidden: false,
            },
          },
    );
    setPrompt(null);
    setDraft('');
  };

  const sceneAspects = Object.values(state.aspects).filter(
    (a) =>
      !a.hidden && (a.ownerType !== 'character' || a.kind === 'boost' || a.kind === 'consequence'),
  );
  const lines = events.map((e) => describe(e, state)).filter((l) => l !== null);

  const myOutcomeNow =
    roll?.status === 'open' && roll.active.dice && myRoll ? outcomeFor(roll, 'active') : null;
  const canInvokeNow = choices.some((c) => !c.blocked && (c.bonus || c.reroll));
  // ● 무료 발동이 남아 있어 운명점 없이 쓸 수 있는 카드
  const freeCard = choices.find(
    (c) => !c.blocked && c.aspect.freeInvokes > 0 && (c.bonus || c.reroll),
  );
  const best = useMemo(
    () =>
      (Object.entries(me.approaches) as [Approach, number][]).reduce((x, y) =>
        y[1] > x[1] ? y : x,
      ),
    [me.approaches],
  );
  const scenePlay = Object.values(state.aspects).find(
    (a) => a.ownerType === 'scene' && a.freeInvokes > 0,
  );

  /** 실제 굴림을 한 줄씩 풀어 준다: 주사위 → 접근법 → 보너스 → 합계 → 상대 → 차이 → 결과 */
  const explainRoll = useCallback(
    (r: RollState, side: 'active' | 'defense') => {
      const describeSide = (sd: RollState['active']) => {
        const dice = sumDice(sd.dice!);
        const total = sideTotal(sd);
        const mods = sd.modifiers.map(
          (m) =>
            `${m.source.startsWith('stunt:') ? term('stunt') : term('invoke')} ${sign(m.value)}`,
        );
        return {
          total,
          line: `주사위 ${faces(sd.dice!)} = ${sign(dice)}, ${term(sd.approach)} ${sign(sd.rating)}${mods.length ? `, ${mods.join(', ')}` : ''} → ${formatRating(total)}`,
        };
      };
      const mine = side === 'active' ? r.active : r.defense!;
      const other = side === 'active' ? r.defense : r.active;
      const m = describeSide(mine);
      const o = other ? describeSide(other) : null;
      const opp = o ? o.total : (r.difficulty ?? 0);
      const shifts = m.total - opp;
      const outcome = outcomeFor(r, side);
      const action = side === 'defense' ? 'defend' : r.action;
      const oppName = other ? (state.characters[other.characterId]?.name ?? '상대') : '난이도';
      const summary = `내 ${sign(m.total)} − ${oppName} ${sign(opp)} = 차이 ${sign(shifts)} → ${OUTCOME_COPY[action][outcome]}`;
      return {
        title: '결과를 읽어 볼까요?',
        body: summary,
        points: [
          `${term('fateDice')}는 ＋를 +1, ○를 0, －를 −1로 읽어요.`,
          `나: ${m.line}`,
          o ? `${oppName}: ${o.line}` : `넘어야 할 난이도: ${formatRating(opp)}`,
          OUTCOME_RULE,
        ],
        moreLabel: '한 줄씩 계산해 보기',
        example:
          side === 'active' && (outcome === 'fail' || outcome === 'tie')
            ? `하지만 아직 확정 전이라 ${josa(term('aspect'), '을/를')} ${term('invoke')}해 바꿀 수 있어요.`
            : OUTCOME_DETAIL[action][outcome],
        summary,
      };
    },
    [state.characters],
  );

  const tour = useMemo((): Tour | undefined => {
    if (compel || prompt) return undefined;
    if (boss.takenOut)
      return {
        open: [],
        coach: {
          step: 4,
          total: 4,
          clear: true,
          title: `${josa(boss.name, '을/를')} 쓰러뜨렸어요!`,
          body: `행동을 고르고, 굴리고, ${term('aspect')}을 ${term('invoke')}해 판을 뒤집는 법을 다 익혔어요. 이제 진짜 게임을 시작해 볼까요?`,
          links: [
            { href: '/create/', label: '캐릭터 만들기' },
            { href: '/rooms/new/', label: '친구들과 방 만들기' },
          ],
        },
      };

    const note = notes[0];
    if (note)
      return {
        open: note.open ?? [],
        ...(note.ring ? { ring: note.ring } : {}),
        guide: { focus: null },
        coach: {
          step: note.step,
          total: 4,
          chapter: note.chapter,
          title: note.title,
          body: note.body,
          ...(note.points ? { points: note.points } : {}),
          ...(note.moreLabel ? { moreLabel: note.moreLabel } : {}),
          ...(note.example ? { example: note.example } : {}),
          next: {
            label: note.label ?? '다음',
            onClick: () => {
              setNotes((q) => q.slice(1));
              note.then?.();
            },
          },
        },
      };

    if (lesson === 'intro') {
      const next = (label: string) => ({ label, onClick: () => setIntroStep((n) => n + 1) });
      const total = 9;
      const steps: Tour[] = [
        {
          open: [],
          coach: {
            step: 1,
            total,
            chapter: '시작하기',
            title: '서사형 TRPG는 다 같이 이야기를 만드는 놀이예요',
            body: 'GM이 장면을 들려주면, 나는 내 캐릭터가 뭘 할지 말로 정해요. 결과가 뻔하지 않을 때만 주사위를 굴려요.',
            example: '정답은 없어요. "내 캐릭터라면 어떻게 할까?"만 떠올리면 돼요.',
            points: ['이기고 지는 것보다, 멋진 장면이 나오면 그게 성공이에요.'],
            moreLabel: '이기면 끝인가요?',
            next: next('알겠어요'),
          },
        },
        {
          open: ['[data-tour="dialogue"]'],
          ring: '[data-tour="dialogue"]',
          coach: {
            step: 2,
            total,
            chapter: '시작하기',
            title: '책 본문이 GM의 목소리예요',
            body: '불타는 곡물 창고에 도적들이 튀어나왔어요. 다락 위에선 도적 두목이 도끼를 들고 웃고 있고요. 두목은 앞서 동료들과 싸우다 이미 크게 다쳤어요.',
            example: 'GM의 말을 읽고 "지금 무슨 상황이지?"부터 떠올려요.',
            points: ['이야기는 언제나 GM의 묘사에서 시작해요. 새 장면이 열리면 여기부터 읽어요.'],
            next: next('읽었어요'),
          },
        },
        {
          open: ['[data-tour="party"]'],
          ring: '[data-tour="party"]',
          coach: {
            step: 3,
            total,
            chapter: '시작하기',
            title: `이게 내 캐릭터, ${josa(pick.name, '이에요/예요')}`,
            body: `캐릭터는 숫자보다 짧은 문구로 표현해요. ${term('high')}은 "${pick.create.highConcept}", ${term('trouble')}은 ${josa(`"${pick.create.trouble}"`, '이에요/예요')}. 이런 문구를 ${term('aspect')}이라고 불러요.`,
            example: `${term('trouble')}은 일을 꼬이게 하지만, 대신 ${josa(term('fatePoint'), '을/를')} 받을 기회예요.`,
            next: next('다음'),
          },
        },
        {
          open: ['[data-tour="aspects"]'],
          ring: '[data-tour="aspects"]',
          coach: {
            step: 4,
            total,
            chapter: '시작하기',
            title: `${term('aspect')}은 이 이야기의 "사실"이에요`,
            body: `무대 아래 카드가 지금 장면의 ${term('aspect')}이에요. 굴림이 아쉬울 때 ${term('fatePoint')} 1개를 내고 ${term('aspect')}을 ${term('invoke')}하면, 그 사실을 근거로 +2를 받아요.`,
            example: '쓸 때는 이유를 붙여요. "불길을 등지면 두목이 못 다가와!"처럼요.',
            points: [
              `캐릭터 ${term('aspect')}: 어떤 사람인지 보여 주는 ${term('high')}, 발목을 잡는 ${term('trouble')}, 그 밖의 특징`,
              `장면 ${term('aspect')}: 지금 장소와 상황에 대한 사실이에요. 누구나 쓸 수 있어요`,
              `${term('aspect')}은 좋게도 나쁘게도 쓰여요. 불길은 나를 막기도, 적을 막기도 하죠`,
            ],
            moreLabel: `${term('aspect')}의 종류`,
            next: next('다음'),
          },
        },
        {
          open: ['[data-tour="party"]'],
          ring: '[data-tour="party"]',
          coach: {
            step: 5,
            total,
            chapter: '시작하기',
            title: `${josa(term('fatePoint'), '은/는')} 딱 ${me.fatePoints}개뿐이에요`,
            body: `기록지의 동전 하나가 ${term('fatePoint')} 1개예요(설명에서는 ◆로 적어요). ${term('invoke')}할 때마다 1개씩 줄고, 저절로 다시 생기지 않아요.`,
            example: '그래서 진짜 중요한 굴림에만 써요.',
            points: [
              `쓸 때: ${term('invoke')}할 때마다 1개, ${josa(term('compel'), '을/를')} 거절할 때 1개`,
              `다 쓰면 ${josa(term('fatePoint'), '으로/로')}는 더 ${term('invoke')}할 수 없어요. 그때는 ${term('freeInvoke')}만 쓸 수 있어요.`,
              `얻는 법: GM의 ${josa(term('compel'), '을/를')} 받아들여 일이 꼬이게 두면 1개, 상대가 내 ${josa(term('aspect'), '을/를')} 나에게 불리하게 쓰면 1개`,
              `세션이 새로 시작되면 ${pick.name}의 ${josa(term('fatePoint'), '은/는')} ${me.refresh}개까지 다시 채워져요. 이걸 ${term('refresh')}이라고 해요. 이미 그보다 많으면 줄지 않아요.`,
              '곤란을 받아들여 모으고, 결정적인 순간에 써서 뒤집는 게 기본 흐름이에요.',
            ],
            moreLabel: '쓰는 법 · 얻는 법',
            next: next('다음'),
          },
        },
        {
          open: ['[data-tour="aspects"]'],
          ring: '[data-tour="aspects"]',
          coach: {
            step: 6,
            total,
            chapter: '시작하기',
            title: `카드의 ●는 ${josa(term('freeInvoke'), '이에요/예요')}`,
            body: `${josa(term('fatePoint'), '을/를')} 내지 않고 그 ${term('aspect')}을 한 번 ${term('invoke')}하는 거예요. 카드에 붙은 ● 하나가 1회예요.`,
            example: `${BOSS.name}의 상처 카드에 꽂힌 핀(●)은 동료들이 남긴 거라 내가 공짜로 쓸 수 있어요.`,
            points: [
              `쓰는 법: ◆ 대신 카드의 ● 하나를 지우면, 똑같이 +2를 받거나 다시 굴릴 수 있어요.`,
              `●를 다 써도 ${term('aspect')}은 남아요. 그 뒤로는 ◆를 내야 ${term('invoke')}할 수 있어요.`,
              `얻는 법: ${term('create_advantage')}에 성공하면 ● 1개, 대성공하면 2개가 붙어요. 상대에게 ${josa(term('consequence'), '을/를')} 남겨도 1개를 얻어요.`,
              `${term('boost')}에는 처음부터 ●가 1개 붙어 있고, 쓰면 카드째 사라져요.`,
              `${josa(term('fatePoint'), '은/는')} 개수가 정해져 있으니, ●가 있는 카드부터 쓰는 게 이득이에요.`,
            ],
            moreLabel: '쓰는 법 · 얻는 법',
            next: next('다음'),
          },
        },
        {
          open: ['[data-tour="party"]'],
          coach: {
            step: 7,
            total,
            chapter: '시작하기',
            title: `숫자에는 이름이 있어요: ${term('ladder')}`,
            body: `모든 수치와 결과에 이름이 붙어요. "+3"보다 "양호"가 더 이야기 같죠.`,
            example: `${josa(pick.name, '은/는')} ${term(best[0])} 수치가 ${sign(best[1])} ${josa(LADDER_LABELS[best[1]] ?? '', '으로/로')} 가장 높아요. 보통 사람은 +0 평범, 전문가는 +3 양호쯤이에요.`,
            points: [5, 4, 3, 2, 1, 0, -1, -2].map((n) => `${sign(n)} ${LADDER_LABELS[n]}`),
            moreLabel: `${term('ladder')} 전체 보기`,
            next: next('다음'),
          },
        },
        {
          open: ['[data-tour="party"]', '[data-tour="foe"]'],
          ring: '[data-tour="party"]',
          coach: {
            step: 8,
            total,
            chapter: '시작하기',
            title: `다치면 이렇게 버텨요: ${term('stress')}와 ${term('consequence')}`,
            body: `공격을 못 막으면 진 차이만큼 피해가 들어와요. 바로 쓰러지진 않아요. 먼저 ${term('stress')} 칸으로, 모자라면 ${josa(term('consequence'), '으로/로')} 버텨요.`,
            example: `무대 위 ${BOSS.name}의 이름표를 봐요. 칸이 거의 다 차 있어서 한두 번만 제대로 맞히면 쓰러져요.`,
            points: [
              `${term('stress')}(1·2·3번 칸): 숨이 차거나 살짝 긁힌 정도예요. 받은 피해와 같거나 더 큰 번호의 빈 칸 하나를 채우면 그 피해를 통째로 막아요. 장면이 끝나면 다시 비워져요.`,
              `${term('consequence')}(${term('mild')} 2 · ${term('moderate')} 4 · ${term('severe')} 6): 진짜로 다친 거예요. 적힌 숫자만큼 피해를 막아 주는 대신, "삐끗한 발목"처럼 다친 곳이 ${term('aspect')}으로 남아요. 상대는 그 ${josa(term('consequence'), '을/를')} 공짜로 한 번 이용할 수 있어요.`,
              `둘 다 써도 못 막으면 탈락이에요. 그 전에 스스로 ${term('concede')}하면 어떻게 물러날지 내가 정하고, ${josa(term('fatePoint'), '을/를')} 받아요.`,
              `${josa(BOSS.name, '은/는')} ${term('stress')} 1·2번 칸과 ${term('moderate')}·${term('severe')}가 이미 차 있어요.`,
            ],
            moreLabel: `${term('stress')} · ${term('consequence')} 자세히`,
            next: next('다음'),
          },
        },
        {
          open: ['[data-tour="actions"]'],
          ring: '[data-tour="actions"]',
          coach: {
            step: 9,
            total,
            chapter: '시작하기',
            title: '할 수 있는 일은 딱 네 가지 행동이에요',
            body: `뭘 하든 책 아래 목차의 네 행동 중 하나로 해요. 1 ${term('overcome')}, 2 ${term('create_advantage')}, 3 ${term('attack')}, 4 ${term('defend')}. 이제 1번부터 하나씩 해 볼게요.`,
            example: '장마다 지금 누를 곳만 빛나요. 빛나는 곳만 따라 누르면 돼요.',
            next: { label: '1장 시작', onClick: () => setLesson('overcome') },
          },
        },
      ];
      const t = steps[Math.min(introStep, steps.length - 1)]!;
      return { ...t, guide: { focus: null } };
    }

    if (lesson === 'free') {
      if (busy && !(settled && (myOutcomeNow === 'fail' || myOutcomeNow === 'tie')))
        return undefined;
      if (busy)
        return {
          open: [],
          coach: {
            step: 4,
            total: 4,
            title: `${term('aspect')}을 ${term('invoke')}해서 뒤집어요`,
            body: `빛나는 ${term('aspect')} 카드를 누르면 +2를 받아요. ${term('fatePoint')} 1개가 들어요.`,
          },
        };
      return {
        open: [],
        coach: {
          step: 4,
          total: 4,
          chapter: '자유 진행',
          title: '이제 마음대로 해 봐요!',
          body: `네 가지 행동을 모두 해 봤어요. 이제 정해진 순서는 없어요. ${josa(boss.name, '을/를')} 쓰러뜨리면 장면이 끝나요.`,
          example: `2번 ${josa(term('create_advantage'), '으로/로')} 유리한 ${term('aspect')}을 붙인 뒤 3번 ${josa(term('attack'), '을/를')} 하면 더 쉬워요. 버튼에 마우스를 올리면 설명이 나와요.`,
        },
      };
    }

    const n = LESSONS.indexOf(lesson);
    const copy = LESSON_COPY[lesson];
    const chapter = `${n + 1}장 · ${term(lesson)}`;
    const base = { total: 4, chapter };
    const panel = '[data-roll-panel]';
    const live = !!roll && !final;

    // 4장은 두목의 공격으로 시작한다
    if (lesson === 'defend' && !(live && roll.targetId === meId))
      return {
        open: [],
        guide: { focus: null },
        coach: {
          ...base,
          step: 1,
          title: copy.title,
          body: copy.body,
          example: `${josa(boss.name, '이/가')} 다락에서 뛰어내려 ${pick.name}에게 도끼를 휘둘러요!`,
          next: { label: '막을 준비가 됐어요', onClick: bossAttacks },
        },
      };

    const choosing = lesson === 'defend' ? defending : !live;
    if (choosing && !action)
      return {
        open: [`[data-tour="action-${lesson}"]`],
        ring: `[data-tour="action-${lesson}"]`,
        guide: { focus: 'action', action: lesson },
        coach: {
          ...base,
          step: 1,
          focus: 'action',
          ...copy,
          points: OUTCOME_ORDER.map((x) => OUTCOME_DETAIL[lesson][x]),
          moreLabel: '결과마다 어떻게 되나요?',
          keys: [String(n + 1)],
        },
      };

    if (choosing && !approach) {
      const stunt = me.stunts.find((st) => st.kind === 'bonus' && st.bonus?.action === lesson);
      return {
        open: ['[data-tour="approaches"]'],
        ring: '[data-tour="approaches"]',
        guide: { focus: 'approach' },
        coach: {
          ...base,
          step: 2,
          focus: 'approach',
          title: `어떻게 할지 ${term('approach')}을 골라요`,
          body: `같은 행동도 방식은 여러 가지예요. 내 캐릭터답게 골라요. 고른 ${term('approach')}의 수치가 그대로 주사위에 더해져요.`,
          points: APPROACHES.map(
            (a) =>
              `${term(a)} ${sign(me.approaches[a])}(${LADDER_LABELS[me.approaches[a]]}): ${tip(a)}`,
          ),
          moreLabel: `${term('approach')} 여섯 가지 보기`,
          example: stunt?.bonus
            ? `"${stunt.text}"라는 ${josa(term('stunt'), '이/가')} 있어요. ${josa(term(stunt.bonus.approach), '을/를')} 고르면 +2를 더 받아요.`
            : `${josa(pick.name, '은/는')} ${term(best[0])} 수치가 ${josa(`+${best[1]}`, '으로/로')} 가장 높아요. 이야기에 어울리는 방식을 골라도 괜찮아요.`,
          keys: ['Q', 'W', 'E', 'A', 'S', 'D'],
        },
      };
    }

    if (choosing)
      return {
        open: ['[data-tour="roll"]'],
        ring: '[data-tour="roll"]',
        guide: { focus: 'roll' },
        coach: {
          ...base,
          step: 3,
          focus: 'roll',
          title: '주사위를 굴려요',
          body: `${term('fateDice')} 4개를 굴려 합에 ${term('approach')} 수치를 더해요. 맞는 ${josa(term('stunt'), '이/가')} 있으면 +2가 더 붙어요.`,
          points: [
            '주사위 한 개에는 ＋, ○, － 면이 있고, 셋이 나올 확률은 똑같아요. ＋는 +1, ○는 0, －는 −1로 쳐요.',
            `4개를 더하면 −4에서 +4 사이인데, 대부분 −1~+1 근처에서 나와요. 그래서 ${term('approach')} 수치가 가장 중요해요.`,
            '튜토리얼에서는 결과 네 가지를 골고루 겪어 보도록 주사위 눈이 미리 정해져 있어요. 자유 진행부터는 진짜로 굴려요.',
            `내 결과와 상대 수치의 점수 차를 ${term('shifts')}라고 해요. ${OUTCOME_RULE}`,
          ],
          moreLabel: '주사위는 어떻게 읽나요?',
          example:
            lesson === 'defend'
              ? `${boss.name}의 주사위는 이미 굴러갔지만 가려져 있어요. 내가 굴리면 둘 다 공개돼요.`
              : lesson === 'attack'
                ? `${boss.name}도 ${term('defend')}로 맞서 굴려요. 더 높은 쪽이 이겨요.`
                : `난이도는 ${josa(formatRating(SCENE.overcomeDifficulty), '이에요/예요')}. 이보다 높으면 성공, 같으면 동점이에요.`,
          keys: ['Space'],
        },
      };

    if (!roll || !settled || roll.status === 'awaiting_defense')
      return {
        open: [panel],
        guide: { focus: null },
        coach: {
          ...base,
          step: 3,
          title: '주사위가 구르는 중…',
          body: '주사위가 멈출 때까지 지켜봐요.',
        },
      };

    if (explained !== roll.id)
      return {
        open: [panel],
        guide: { focus: null },
        lockFinalize: true,
        coach: {
          ...base,
          step: 4,
          ...explainRoll(roll, lesson === 'defend' ? 'defense' : 'active'),
          next: { label: '알겠어요', onClick: () => setExplained(roll.id) },
        },
      };

    if (lesson === 'defend') {
      const o = outcomeFor(roll, 'defense');
      return {
        open: [panel],
        ring: '[data-tour="finalize"]',
        guide: { focus: null },
        coach: {
          ...base,
          step: 4,
          title: OUTCOME_COPY.defend[o],
          body:
            o === 'success' || o === 'style'
              ? `${boss.name}의 도끼를 막아냈어요. 막아내면 피해를 하나도 받지 않아요.`
              : `막지 못했어요. 진 차이만큼 피해를 받아요. 피해는 먼저 ${term('stress')} 칸으로 버티고, 크면 ${term('consequence')}이 남아요. 끝까지 버티지 못하면 탈락이에요.`,
          example: '"결과 확정"을 누르면 이야기에 반영돼요.',
        },
      };
    }

    const o = outcomeFor(roll, 'active');
    if ((o === 'fail' || o === 'tie') && canInvokeNow && invokedRoll !== roll.id)
      return {
        open: [panel],
        ring: '[data-tour="invoke-cards"]',
        guide: { focus: null },
        lockFinalize: true,
        coach: {
          ...base,
          step: 4,
          title: `아쉬워요! ${term('aspect')}을 ${term('invoke')}해서 뒤집어요`,
          body: `확정 전이라면 결과를 바꿀 수 있어요. 어울리는 ${term('aspect')} 카드를 누르고 "+2"를 골라요. ${term('fatePoint')} ◆ 1개가 들고, ●가 있는 카드는 공짜예요.`,
          points: [
            `+2: 합계에 2를 더해요. 실패가 동점이나 성공으로 바뀔 수 있어요.`,
            `다시 굴리기: 주사위 4개를 새로 굴려요. 더 나빠질 수도 있으니 주사위가 아주 나쁠 때 써요.`,
            `${term('fatePoint')}: 지금 ◆ ${me.fatePoints}개예요. 하나 쓰면 ${Math.max(0, me.fatePoints - 1)}개가 되고, 다 떨어지면 ●가 있는 카드밖에 못 써요.`,
            `${term('freeInvoke')}: 카드에 ●가 있으면 ◆ 대신 ● 하나를 지워요. ◆를 아낄 수 있으니 ●가 있는 카드부터 찾아봐요.`,
            `한 번 굴릴 때 같은 ${term('aspect')}은 한 번만 쓸 수 있어요. 다른 ${term('aspect')}이라면 여러 개를 함께 써도 돼요.`,
            `상대 캐릭터의 ${term('aspect')}을 ◆로 쓰면 상대가 ◆ 1개를 받아요.`,
          ],
          moreLabel: `${term('invoke')} 규칙 자세히`,
          example: freeCard
            ? `"${freeCard.aspect.text}"에 ● ${freeCard.aspect.freeInvokes}개가 있어요. 이걸 쓰면 ${josa(term('fatePoint'), '을/를')} 아낄 수 있어요!`
            : `●가 있는 카드는 없어요. ◆ 1개를 내고 "${josa(scenePlay?.text ?? '사방에 번지는 불길', '을/를')} 이용하면 할 수 있어!"처럼 이유를 대 봐요.`,
          keys: ['F'],
        },
      };

    const after: Record<Action, string> = {
      overcome: '확정하면 다음 장으로 넘어가요.',
      create_advantage:
        o === 'success' || o === 'style'
          ? `확정하면 새 ${term('aspect')}의 이름을 직접 지어요.`
          : '확정하면 다음 장으로 넘어가요.',
      attack:
        o === 'success' || o === 'style'
          ? `확정하면 ${josa(boss.name, '이/가')} 피해를 받아요.`
          : '확정하면 다음 장으로 넘어가요.',
      defend: '',
    };
    return {
      open: [panel],
      ring: '[data-tour="finalize"]',
      guide: { focus: null },
      coach: {
        ...base,
        step: 4,
        title: `${OUTCOME_COPY[lesson][o]}`,
        body:
          o === 'fail' || o === 'tie'
            ? `괜찮아요, 실패도 이야기가 돼요. ${OUTCOME_DETAIL[lesson][o]}`
            : OUTCOME_DETAIL[lesson][o],
        points: [
          explainRoll(roll, 'active').summary,
          ...(o === 'fail' || o === 'tie'
            ? ['서사형 TRPG에서는 일이 꼬일수록 장면이 더 재미있어져요.']
            : []),
        ],
        moreLabel: '이번 굴림 다시 보기',
        example: `"이대로 확정"을 눌러요. ${after[lesson]}`,
        keys: ['Enter'],
      },
    };
  }, [
    compel,
    prompt,
    boss,
    lesson,
    introStep,
    pick,
    me,
    busy,
    settled,
    myOutcomeNow,
    roll,
    final,
    meId,
    defending,
    action,
    approach,
    best,
    canInvokeNow,
    freeCard,
    invokedRoll,
    scenePlay,
    bossAttacks,
    notes,
    explained,
    explainRoll,
  ]);
  const coach = tour?.coach;
  const guided = (lesson !== 'free' || notes.length > 0) && !!tour && !tour.coach.clear;
  const [coachHidden, setCoachHidden] = useState(false);
  // 안내를 숨겼더라도 다 끝낸 순간의 축하 카드는 한 번 다시 보여 준다
  const [clearShown, setClearShown] = useState(false);
  if (coach?.clear && !clearShown) {
    setClearShown(true);
    setCoachHidden(false);
  }
  useEffect(() => {
    // 쓰러지는 연출이 지나간 뒤 축하 종소리
    if (!clearShown) return;
    const t = window.setTimeout(() => playSfx('style-chime', 0.5), 900);
    return () => window.clearTimeout(t);
  }, [clearShown]);

  const result =
    roll && roll.active.dice && (roll.defense?.dice ?? roll.targetId === null)
      ? resolveRoll(roll)
      : null;
  // 내가 막는 굴림이면 결과도 막는 쪽에서 본다
  const mySide = roll && !myRoll && roll.targetId === meId ? 'defense' : 'active';
  const myOutcome = roll && result ? outcomeFor(roll, mySide) : null;
  const myTotal =
    roll && result ? (mySide === 'defense' ? sideTotal(roll.defense!) : result.total) : 0;
  const activeChar = roll ? state.characters[roll.active.characterId] : undefined;
  const targetChar = roll?.targetId ? state.characters[roll.targetId] : undefined;
  const showCoach = !!coach && (guided || !coachHidden);
  const outcomeKey =
    settled && myOutcome && roll ? `${roll.id}:${roll.active.animSeed}:${myOutcome}` : null;
  useEffect(() => {
    if (!outcomeKey) return;
    playSfx('dice-settle', 0.5);
    const t = setTimeout(
      () => playSfx(sfxForOutcome(outcomeKey.split(':').at(-1) as Outcome)),
      220,
    );
    return () => clearTimeout(t);
  }, [outcomeKey]);
  const showBoss = roll?.targetId === bossId || action === 'attack' || boss.takenOut === true;

  const companions = SAMPLE_CHARACTERS.filter((s) => s.name !== pick.name).map((s) => ({
    character: state.characters[findId(state, s.name)]!,
    image: asset(s.image),
  }));
  const previewing = !!action && !!approach && (!roll || defending);
  const stuntPlus = action && approach ? stuntBonuses(me, action, approach).length * 2 : 0;
  const invokable = Object.values(state.aspects).filter(
    (a) => !a.hidden && (a.ownerType !== 'character' || a.ownerId === meId || a.freeInvokes > 0),
  ).length;
  const lastLine = lines.at(-1);
  const heroSpeaks = lastLine?.kind === 'chat' && lastLine.text.startsWith(`${pick.name}:`);

  return (
    <main className={book.shell}>
      <section
        className={book.stage}
        data-roll={!!roll || undefined}
        style={{ backgroundImage: `url(${asset(SCENE.background)})` }}
      >
        <img
          className={`${styles.standee} ${book.hero}`}
          src={asset(pick.image)}
          alt={pick.name}
          data-focus={heroSpeaks || undefined}
        />
        {showBoss && (
          <img
            className={`${styles.bossStandee} ${book.foe}`}
            src={asset(SCENE.bossImage)}
            alt={boss.name}
            data-out={boss.takenOut || undefined}
            data-hit={
              (final &&
                roll?.action === 'attack' &&
                (roll.result?.outcome === 'success' || roll.result?.outcome === 'style')) ||
              undefined
            }
          />
        )}
        <header className={book.chapter}>
          <p>튜토리얼 · 첫 장면</p>
          <h1 key={state.scene?.id ?? 'none'}>{state.scene?.name}</h1>
        </header>

        <div className={book.foePlate} data-tour="foe">
          <FoePlate character={boss} image={asset(SCENE.bossImage)} note={BOSS.highConcept} />
        </div>

        <div className={book.coachSlot}>
          <Presence show={showCoach}>
            {coach && showCoach && (
              <CoachMark
                key={coach.clear ? 'clear' : `${lesson}:${introStep}:${coach.step}:${coach.title}`}
                coach={coach}
                hideLabel={guided ? '튜토리얼 건너뛰기' : '안내 숨기기'}
                // 말풍선은 눌러야 할 곳(고리) 옆에 붙는다. 고리가 없으면 밝게 남긴 곳, 그것도 없으면
                // 굴림 중엔 판정 카드 옆, 아니면 무대 위 기본 자리에 선다
                anchor={
                  tour?.ring ??
                  tour?.open[0] ??
                  (roll && !coach.clear ? '[data-roll-panel]' : undefined)
                }
                avoid={tour?.open}
                pinned={guided}
                onHide={() => {
                  if (!guided) return setCoachHidden(true);
                  setLesson('free');
                  setNotes([]);
                }}
              />
            )}
          </Presence>
        </div>

        <div className={book.center}>
          {previewing && (
            <RollPreview
              name={me.name}
              action={action!}
              approach={approach!}
              rating={me.approaches[approach!]}
              stunt={stuntPlus}
              difficulty={action === 'attack' || defending ? null : SCENE.overcomeDifficulty}
              opponent={boss.name}
              canInvoke={invokable > 0}
              disabled={
                (busy && !defending) ||
                !!compel ||
                !!prompt ||
                (guided && !!tour?.guide && tour.guide.focus !== 'roll')
              }
              focus={coach?.focus === 'roll' && showCoach}
              onRoll={onRoll}
            />
          )}
          {roll && (
            <div
              className={`${styles.rollPanel} ${book.check}`}
              ref={revealOnNarrow}
              data-roll-panel
            >
              <div className={styles.sides}>
                <div className={styles.side} data-fx="roll-dice">
                  <div className={styles.sideHead}>
                    {activeChar?.name} · {term(roll.action)} · {term(roll.active.approach)}{' '}
                    {roll.active.rating >= 0 ? '+' : ''}
                    {roll.active.rating}
                  </div>
                  <DiceTray
                    dice={roll.active.dice}
                    rollKey={`${roll.id}:${roll.active.animSeed}`}
                    sealed={roll.status === 'awaiting_defense'}
                    mode={diceMode}
                    onSettled={() => setSettled(true)}
                  />
                  {roll.active.dice && settled && result && (
                    <div className={styles.total} key={result.total} data-fx="roll-total">
                      {result.total >= 0 ? '+' : ''}
                      {result.total} <small>{formatRating(result.total).split(' ')[0]}</small>
                      {roll.active.modifiers.length > 0 && (
                        <small className={styles.mods}>
                          주사위 {sumDice(roll.active.dice)} · {term('approach')}{' '}
                          {roll.active.rating} ·{' '}
                          {roll.active.modifiers.map((m) => `+${m.value}`).join(' ')}
                        </small>
                      )}
                    </div>
                  )}
                  {roll.status === 'awaiting_defense' && (
                    <div className={styles.waiting}>다 굴렸어요. 상대를 기다리는 중이에요</div>
                  )}
                </div>
                {roll.targetId ? (
                  <>
                    <div className={styles.vs}>VS</div>
                    <div className={styles.side}>
                      <div className={styles.sideHead}>
                        {targetChar?.name} · {term('defend')}
                        {roll.defense && (
                          <>
                            {' '}
                            · {term(roll.defense.approach)} {roll.defense.rating >= 0 ? '+' : ''}
                            {roll.defense.rating}
                          </>
                        )}
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
                  <div className={styles.difficulty}>
                    난이도 {formatRating(roll.difficulty ?? 0)}
                  </div>
                )}
              </div>

              {settled && myOutcome && result && (
                <OutcomeBanner
                  action={mySide === 'defense' ? 'defend' : roll.action}
                  outcome={final && mySide === 'active' ? roll.result!.outcome : myOutcome}
                  total={myTotal}
                  provisional={!final}
                />
              )}

              {settled && roll.status === 'open' && !myRoll && (
                <button
                  type="button"
                  className={styles.defenseOk}
                  data-tour="finalize"
                  disabled={guided && !!tour?.lockFinalize}
                  onClick={onDefenseFinalize}
                >
                  결과 확정
                </button>
              )}

              {settled && roll.status === 'open' && myRoll && (
                <>
                  {unusedStunt && (
                    <button
                      type="button"
                      className={styles.stunt}
                      onClick={() =>
                        run(ME, {
                          type: 'stunt.apply',
                          payload: { rollId: roll.id, side: 'active', stuntId: unusedStunt.id },
                        })
                      }
                    >
                      {term('stunt')} 적용: {unusedStunt.text}
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <div className={book.table} data-tour="aspects">
          {!(roll && settled && roll.status === 'open' && myRoll) &&
            sceneAspects.map((a: Aspect) => (
              <AspectCard
                key={a.id}
                aspect={a}
                {...(a.ownerType === 'character'
                  ? { owner: state.characters[a.ownerId]?.name ?? '' }
                  : {})}
              />
            ))}
          {roll && settled && roll.status === 'open' && myRoll && (
            <div className={book.tray}>
              <InvokeTray
                choices={choices}
                fatePoints={me.fatePoints}
                selectedId={selectedAspect}
                onSelect={setSelectedAspect}
                onInvoke={onInvoke}
                onFinalize={onFinalize}
                lockFinalize={guided && !!tour?.lockFinalize}
              />
            </div>
          )}
        </div>

        <Presence show={!!compel}>
          {compel && (
            <div className={styles.overlay}>
              <CompelOffer
                aspect={state.aspects[compel.aspectId]!}
                text={compel.text}
                targetId={meId}
                fatePoints={me.fatePoints}
                onAccept={() => {
                  run(ME, {
                    type: 'compel.respond',
                    payload: { compelId: compel.id, accept: true },
                  });
                  if (lesson !== 'free') setNotes(compelNotes(true));
                }}
                onRefuse={() => {
                  run(ME, {
                    type: 'compel.respond',
                    payload: { compelId: compel.id, accept: false },
                  });
                  if (lesson !== 'free') setNotes(compelNotes(false));
                }}
              />
            </div>
          )}
        </Presence>

        <Presence show={!!prompt}>
          {prompt && (
            <div className={styles.overlay}>
              <form
                className={styles.prompt}
                onSubmit={(e) => {
                  e.preventDefault();
                  submitPrompt();
                }}
              >
                <div className={styles.promptHead}>
                  {prompt.kind === 'aspect'
                    ? `새 ${term('aspect')} 이름 짓기 · ${term('freeInvoke')} ${prompt.freeInvokes}`
                    : `${term('boost')} 이름 짓기`}
                </div>
                <ul className={styles.promptExplain}>
                  {prompt.kind === 'aspect' ? (
                    <>
                      <li>
                        방금 만든 유리한 상황이 장면의 새 {term('aspect')}이 돼요. 이야기에서
                        &quot;사실&quot;이 되는 거예요.
                      </li>
                      <li>
                        카드에 ● {prompt.freeInvokes}개가 붙어요. ● 하나가 {term('freeInvoke')} 한
                        번이에요. {term('fatePoint')} ◆ 없이도 이 {term('aspect')}으로 +2를 받거나
                        다시 굴릴 수 있어요.
                      </li>
                      <li>●를 다 써도 {term('aspect')}은 남아요. 그 뒤로는 ◆를 내야 써요.</li>
                    </>
                  ) : (
                    <>
                      <li>
                        {term('boost')}는 굴림 덕분에 잠깐 생긴 작은 기회예요. 오래가는{' '}
                        {term('aspect')}이 아니에요.
                      </li>
                      <li>
                        ●가 하나 붙은 {term('aspect')}이라, {term('fatePoint')} 없이 딱 한 번 +2를
                        받을 수 있어요. 쓰자마자 카드째 사라져요.
                      </li>
                      <li>바로 다음 굴림에서 쓰는 게 좋아요. 장면이 바뀌면 없어지거든요.</li>
                    </>
                  )}
                </ul>
                <p className={styles.promptHelp}>
                  {prompt.kind === 'aspect'
                    ? '장면에 새로 생긴 사실을 짧은 문구로 적어요. 예: "연기에 가려진 뒷문"'
                    : '그 순간의 기회를 짧게 적어요. 예: "흔들리는 발판", "연기 사이로 난 틈"'}
                </p>
                <input
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  maxLength={40}
                  className={styles.promptInput}
                />
                <div className={styles.promptButtons}>
                  <button type="button" onClick={() => setPrompt(null)} className={styles.restart}>
                    건너뛰기
                  </button>
                  <button type="submit" className={styles.promptOk} disabled={!draft.trim()}>
                    붙이기
                  </button>
                </div>
              </form>
            </div>
          )}
        </Presence>
      </section>

      <div className={book.deckle} aria-hidden />

      <section className={book.book}>
        <div className={book.running}>
          <span>세션 1 · 튜토리얼</span>
          <span className={book.tools}>
            <select
              aria-label="주사위 연출"
              value={diceMode}
              onChange={(e) => {
                const m = e.target.value as DiceMode;
                setDiceMode(m);
                saveDiceMode(m);
              }}
            >
              {DICE_MODES.map(([v, label]) => (
                <option key={v} value={v}>
                  주사위 {label}
                </option>
              ))}
            </select>
            <button
              type="button"
              aria-pressed={sfxOn}
              onClick={() => {
                setSfxEnabled(!sfxOn);
                setSfxOn(!sfxOn);
              }}
            >
              효과음 {sfxOn ? '켜짐' : '꺼짐'}
            </button>
            <button type="button" onClick={onRestart}>
              처음부터
            </button>
          </span>
        </div>
        <div data-tour="party">
          <MySheet
            character={me}
            aspects={state.aspects}
            image={asset(pick.image)}
            companions={companions}
          />
        </div>
        <div className={book.text} data-tour="dialogue">
          <StoryLog lines={lines} variant="book" />
        </div>
        {error && <p className={book.error}>{error}</p>}
        <ActionBar
          character={me}
          action={action}
          approach={approach}
          hideRoll
          disabled={(busy && !defending) || !!compel || !!prompt || me.takenOut === true}
          canDefend={defending}
          {...(coach?.focus && showCoach && !guided ? { focus: coach.focus } : {})}
          {...(guided && tour?.guide ? { guide: tour.guide } : {})}
          onAction={setAction}
          onApproach={setApproach}
          onRoll={onRoll}
        />
      </section>
      {guided && tour && <Spotlight open={[...tour.open, '[data-coach]']} ring={tour.ring} />}
    </main>
  );
}
