'use client';

import { LADDER_LABELS, term, tip } from '@fate/glossary';
import {
  type Outcome,
  absorbOptions,
  APPROACHES,
  isValidAbsorb,
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
  type Character,
  type Command,
  type Dice,
  type InvokeMode,
  type PaidWith,
  type Reward,
  type RollState,
  type RoomState,
} from '@fate/rules-engine';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { CompelOffer } from '@/components/compel/CompelOffer';
import { StoryLog } from '@/components/log/StoryLog';
import type { CoachFocus } from '@/components/roll/ActionBar';
import { ActionMenu } from '@/components/theater/ActionMenu';
import { Duel } from '@/components/theater/Duel';
import { Nameplate } from '@/components/theater/Nameplate';
import { TableView } from '@/components/theater/TableView';
import { consequenceDepth, TraitCard } from '@/components/theater/TraitCard';
import th from '@/components/theater/theater.module.css';
import { tagKey, useDealt } from '@/components/theater/useDealt';
import { DialogueGrip } from '@/components/theater/DialogueGrip';
import { useDialogueTop } from '@/components/theater/useDialogueTop';
import { DICE_MODES, DiceTray, saveDiceMode, type DiceMode } from '@/components/roll/DiceTray';
import type { InvokeChoice } from '@/components/roll/InvokeTray';
import { CoachMark, type Coach } from '@/components/tutorial/CoachMark';
import { Spotlight } from '@/components/tutorial/Spotlight';
import { SceneAmbience } from '@/components/ambience/SceneAmbience';
import { PageNav } from '@/components/nav/PageNav';
import { useHistoryStep } from '@/components/nav/useHistoryStep';
import { BOSS, SAMPLE_CHARACTERS, SCENE, type SampleCharacter } from '@/content/oneshot';
import {
  attackApproach,
  companionsOf,
  ELDER,
  FEAST,
  STUNT_IDEAS,
  VILLAGE,
  VOICES,
} from '@/content/tutorialStory';
import { sceneImage } from '@/lib/ambience';
import { useSceneAmbience } from '@/fx/ambience';
import { playSfx, sfxForEvents, sfxForOutcome } from '@/fx/sfx';
import { SoundControl } from '@/components/ui/SoundControl';
import { asset } from '@/lib/asset';
import { Presence, reducedMotion } from '@/lib/motion';
import { Typewriter } from '@/components/ui/Typewriter';
import { describe, ERROR_COPY, JUDGE, OUTCOME_COPY } from '@/lib/copy';
import { josa } from '@/lib/josa';
import { LocalRoom } from '@/state/localRoom';
import { MilestonePicker, type MilestoneChoice } from './MilestonePicker';
import styles from './try.module.css';

const ME: Actor = { userId: 'me', role: 'player' };
const GM: Actor = { userId: 'gm', role: 'gm' };

const BLOCK_REASON: Record<string, string> = {
  NOT_ENOUGH_FATE_POINTS: '운명점 부족',
  ASPECT_ALREADY_INVOKED: '이번 굴림에 이미 씀',
};

const COMPEL_TEXT: Record<string, string> = {
  hayun: '맹세가 발목을 잡는다. 도적이 인질을 앞세우자 하윤은 칼을 거둘 수밖에 없다.',
  leo: '레오가 불길 옆 약병을 "잠깐만 확인"하다가 연기가 확 번진다.',
  mira: '미라는 동료의 신호를 믿지 못하고 혼자 움직이다 위치가 드러난다.',
};

/**
 * 이야기로 진행하는 튜토리얼. 장면 사이사이 GM 서술과 동료 NPC의 대사·굴림(이야기 박자)이 흐르고,
 * 내 차례가 오면 행동 하나를 배운다: 1 극복 → 2 이점 만들기 → 3 공격 → 4 방어 → 마무리(진짜 주사위).
 * 두목이 쓰러지면 잔치 장면, 세션 종료, 작은 이정표로 끝난다.
 * 행동을 배우는 동안에는 지금 단계의 버튼만 열어 두고 나머지는 어둡게 덮어 막는다.
 */
type Lesson = 'story' | Action | 'free';
const LESSONS: Action[] = ['overcome', 'create_advantage', 'attack', 'defend'];

/** 행동마다: 무엇인지, 언제 쓰는지, 지금 해 볼 일 */
const LESSON_COPY: Record<Action, { title: string; body: string; example: string }> = {
  overcome: {
    title: `${term('overcome')}: 막힌 길 뚫기`,
    body: '앞을 막는 것을 넘을 때 쓴다. 불길을 뚫고 달리기, 잠긴 문 열기 같은 것. 난이도보다 높게 나오면 성공.',
    example: `불길 너머에 창고지기가 쓰러져 있다. 1번 ${josa(`"${term('overcome')}"`, '을/를')} 눌러 불길 뚫기`,
  },
  create_advantage: {
    title: `${term('create_advantage')}: 유리한 상황 만들기`,
    body: `연기로 두목의 눈을 가리는 것처럼, 나중에 써먹을 상황을 만든다. 성공하면 장면에 새 ${term('aspect')}이 붙고 ${term('freeInvoke')}도 받는다.`,
    example: `두목과 맞붙기 전에 판을 기울인다. 2번 ${josa(`"${term('create_advantage')}"`, '을/를')} 누르기`,
  },
  attack: {
    title: `${term('attack')}: 상대에게 피해 주기`,
    body: `상대를 쓰러뜨릴 때 쓴다. 상대도 ${term('defend')}로 맞서 굴린다. 이긴 차이만큼 피해가 들어가고, 못 버티면 상대는 ${term('takenOut')}한다.`,
    example: `동료가 열어 준 틈. 3번 ${josa(`"${term('attack')}"`, '을/를')} 눌러 두목 노리기`,
  },
  defend: {
    title: `${term('defend')}: 공격이나 방해 막기`,
    body: '누가 나를 공격하면 내 차례가 아니어도 굴려서 막는다. 이기면 피해가 없고, 지면 진 차이만큼 피해를 받는다.',
    example: `두목이 도끼를 치켜들었다. 4번 ${josa(`"${term('defend')}"`, '을/를')} 눌러 막기`,
  },
};

/** 행동 × 결과 4단계가 실제로 무슨 뜻인지 (용어집 기준, 입문자용으로 풀어서) */
const OUTCOME_DETAIL: Record<Action, Record<Outcome, string>> = {
  overcome: {
    fail: '실패: 못 넘는다. 큰 대가를 치르면 억지로 넘을 수는 있다.',
    tie: '동점: 넘긴 하는데 작은 대가가 따른다. 옷이 그을리거나 시간이 걸리는 식.',
    success: '성공: 깔끔하게 넘어간다.',
    style: `대성공: 깔끔하게 넘어가고 ${term('boost')}까지 얻는다.`,
  },
  create_advantage: {
    fail: `실패: ${term('aspect')}을 못 만든다. 만들더라도 ${term('freeInvoke')}은 상대가 가져간다.`,
    tie: `동점: 오래가는 ${term('aspect')} 대신 한 번 쓰고 사라지는 ${term('boost')}를 얻는다.`,
    success: `성공: 새 ${term('aspect')}을 붙이고 ${term('freeInvoke')} 1개를 받는다.`,
    style: `대성공: 새 ${term('aspect')}을 붙이고 ${term('freeInvoke')} 2개를 받는다.`,
  },
  attack: {
    fail: '실패: 빗나간다. 피해 없음.',
    tie: `동점: 피해는 못 주지만 ${term('boost')}를 얻는다.`,
    success: `성공: 이긴 차이만큼 피해를 준다. 상대는 ${term('stress')}나 ${term('consequence')}으로 버텨야 한다.`,
    style: `대성공: 차이만큼 피해를 준다. 피해를 1 줄이고 ${term('boost')}를 얻을 수도 있다.`,
  },
  defend: {
    fail: '실패: 상대의 공격이 통한다. 진 차이만큼 피해를 받는다.',
    tie: `동점: 막긴 했지만 상대가 ${term('boost')}를 얻는다.`,
    success: '성공: 막아낸다. 피해 없음.',
    style: `대성공: 막아내고 ${term('boost')}까지 얻는다.`,
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
const OUTCOME_RULE = '상대보다 낮으면 실패, 같으면 동점, 1~2 높으면 성공, 3 이상 높으면 대성공.';

/** 안내 말풍선이 덮지 않을 곳: 판정 카드, 굴리기 전 예고 카드, 발동 카드 줄 */
const COACH_AVOID = ['[data-roll-panel]', '[data-tour="roll"]', '[data-roll-tray]'];
/** 안내 말풍선이 되도록 덮지 않을 곳 */
const COACH_SHY = [
  '[data-tour="party"]',
  '[data-tour="dialogue"]',
  '[data-tour="actionbar"]',
  '[data-tour="foe"]',
];

/** 장면 꼬리표 자리 (화면 비율 %): 이야기 중에는 장면 여기저기, 판정 중에는 판정판 둘레 */
const TAG_SPOTS: ReadonlyArray<readonly [number, number]> = [
  [38, 43],
  [53, 43],
  [45.5, 56],
  [30, 56],
  [61, 56],
  [45.5, 30],
];
/* 판정 중에는 판정판과 손패를 가리지 않게 양옆 두 줄로 선다 */
const TAG_SPOTS_ROLL: ReadonlyArray<readonly [number, number]> = [
  [3, 40],
  [77, 40],
  [3, 52],
  [77, 52],
  [3, 64],
  [77, 64],
];

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

/**
 * 이야기 박자. 앞에서부터 하나씩 흘러간다.
 * line: GM 서술(who 없음)이나 등장인물의 말. 읽고 "다음"을 눌러 넘긴다.
 * note: 규칙 설명 카드. npc: 동료가 굴린다 (판정판을 보고 "다음"). do: 장면 전환 같은 일을 하고 넘어간다.
 * lesson: 내 차례. 행동 하나를 배운다. milestone: 이정표 혜택 고르기. end: 마침 카드.
 * 글이 나중 상태에 기대면 (내가 지은 특성 이름 등) 함수로 넘긴다.
 */
type Beat =
  | { kind: 'line'; who: string | null; text: string | (() => string) }
  | { kind: 'note'; note: Note | (() => Note) }
  | { kind: 'npc'; run: () => string | null }
  | { kind: 'do'; run: () => void; wait?: number }
  | { kind: 'lesson'; lesson: Action | 'free' }
  | { kind: 'milestone' }
  | { kind: 'end' };

interface Tour {
  /** 이야기 박자를 읽는 중에는 안내 카드 없이 대사창만 쓴다 */
  coach?: Coach & { focus?: CoachFocus };
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
  // 이야기는 해 질 녘 마을에서 시작한다. 여는 서술은 첫 이야기 박자가 올린다
  room.run(GM, {
    type: 'scene.start',
    payload: { name: VILLAGE.name, aspects: [...VILLAGE.aspects] },
  });
  room.run(GM, { type: 'scene.mood', payload: { backdrop: 'village', time: 'dusk' } });
  return room;
}

/** 곡물 창고로 장면을 옮긴다. 두목은 앞서 마을 경비대와 싸우느라 스트레스 1·2번 칸이 차 있다 */
function enterGranary(room: LocalRoom) {
  room.run(GM, { type: 'scene.start', payload: { name: SCENE.name, aspects: SCENE.aspects } });
  // 불타는 창고: 배경 위에 화재 분위기를 깐다 (불빛 · 그을음 · 불티)
  room.run(GM, { type: 'scene.mood', payload: { conditions: ['fire'] } });
  const bossId = findId(room.getSnapshot().state, BOSS.name);
  room.seed(
    ([1, 2] as const).map((box) => ({
      type: 'damage.absorbed' as const,
      actorId: GM.userId,
      visibility: 'public' as const,
      payload: { rollId: `prelude-${box}`, targetId: bossId, stressBox: box, consequences: [] },
    })),
  );
}

export function TryTable() {
  const [pick, setPick] = useState<SampleCharacter | null>(null);
  const room = useMemo(() => (pick ? setupRoom(pick) : null), [pick]);
  // 캐릭터 고르기 ↔ 테이블을 브라우저 기록에 남겨, 뒤로가기가 고르기 화면으로 돌아오게 한다
  const pushPick = useHistoryStep<string | null>('ftTutorialPick', null, (key) =>
    setPick(SAMPLE_CHARACTERS.find((s) => s.key === key) ?? null),
  );
  const choose = (s: SampleCharacter | null) => {
    setPick(s);
    pushPick(s?.key ?? null);
  };
  if (!pick || !room) return <Picker onPick={choose} />;
  return <Table room={room} pick={pick} onRestart={() => choose(null)} />;
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
      <div className={styles.pickNav}>
        <PageNav tone="stage" />
      </div>
      <header className={styles.pickHead}>
        <h1 className={styles.pickTitle}>누구로 플레이할지 고르기</h1>
        <p className={styles.pickLead}>
          해 질 녘 &lsquo;{VILLAGE.name}&rsquo;의 곡물 창고에 불이 났다. 한 명을 고르면 남은 둘은
          동료로 함께 간다. 같이 도적 두목을 막고, 세션을 마치며 첫 {term('milestone')}까지 받는다.
          규칙은 몰라도 된다.
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
                data-ink="night"
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
                  <span className={styles.pickGo}>{josa(s.name, '으로/로')} 시작</span>
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
  const [mateA, mateB] = useMemo(() => companionsOf(pick), [pick]);
  const voiceA = VOICES[mateA.key]!;
  const voiceB = VOICES[mateB.key]!;
  // 세션을 마치면 장면이 닫힌다. 그 뒤에도 마지막 장면의 그림과 소리를 남겨 둔다
  const [shownScene, setShownScene] = useState(state.scene);
  if (state.scene && state.scene !== shownScene) setShownScene(state.scene);
  const stageScene = state.scene ?? shownScene;
  // 두목은 곡물 창고에서만 무대에 선다
  const atGranary = stageScene?.name === SCENE.name;

  const [action, setAction] = useState<Action | null>(null);
  const [approach, setApproach] = useState<Approach | null>(null);
  const [rollId, setRollId] = useState<string | null>(null);
  const [settled, setSettled] = useState(false);
  const [selectedAspect, setSelectedAspect] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<Prompt>(null);
  const [draft, setDraft] = useState('');
  const [diceMode, setDiceMode] = useState<DiceMode>('3d');
  const [error, setError] = useState<string | null>(null);
  const compelled = useRef(false);
  const [lesson, setLesson] = useState<Lesson>('story');
  // 흘러갈 이야기 박자 (맨 앞이 지금)
  const [beats, setBeats] = useState<Beat[]>([]);
  const [milestoneOpen, setMilestoneOpen] = useState(false);
  // 끝난 판정을 닫고 이야기로 돌아간 굴림
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  // 무대에 함께 선 동료 (가장 최근에 말하거나 굴린 쪽)
  const [allyKey, setAllyKey] = useState<string | null>(null);
  // 이번 굴림에서 발동을 한 번 해 봤는지 (튜토리얼 발동 단계는 한 번이면 충분하다)
  const [invokedRoll, setInvokedRoll] = useState<string | null>(null);
  // 읽고 넘기는 설명 카드 줄 (굴림 뒤 해설, 강요 소개 등)
  const [notes, setNotes] = useState<Note[]>([]);
  // 결과 해설 카드를 이미 본 굴림
  const [explained, setExplained] = useState<string | null>(null);
  // 장소·날씨·불길에 맞는 배경음이 낮게 깔린다 (설정에서 끄거나 줄인다)
  useSceneAmbience(stageScene);

  // 새 이벤트마다 어울리는 효과음 (한 번에 같은 소리는 한 번만)
  const heard = useRef(-1);
  useEffect(() => {
    const last = events.at(-1)?.seq ?? -1;
    if (heard.current < 0) {
      heard.current = last;
      return;
    }
    const sounds = sfxForEvents(events.filter((e) => e.seq > heard.current));
    heard.current = last;
    sounds.forEach(([n, v]) => playSfx(n, v));
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
        setError(ERROR_COPY[code] ?? '지금은 할 수 없는 행동');
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
          blocked: check.ok ? '쓸 수 없음' : (BLOCK_REASON[check.code] ?? '쓸 수 없음'),
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
              ? `${term('fatePoint')} 1개 사용. ${left}개 남음`
              : `${term('freeInvoke')} 1번 사용. ${term('fatePoint')} ${left}개 그대로`,
          body:
            paidWith === 'fate_point'
              ? `${josa(term('fatePoint'), '은/는')} 저절로 늘지 않는다. ${left === 0 ? `이제 0개라서 핀이 꽂힌 카드로만 ${term('invoke')}할 수 있다. ${josa(term('compel'), '을/를')} 받아들이면 다시 생긴다.` : `${left}개를 다 쓰면 핀이 꽂힌 카드로만 ${term('invoke')}할 수 있다.`}`
              : used?.kind === 'boost'
                ? `${josa(term('boost'), '은/는')} 한 번 쓰면 카드째 사라진다.`
                : `"${used?.text ?? ''}"의 핀이 하나 빠졌다. 핀을 다 써도 ${term('aspect')}은 남는다. 그다음부턴 ${josa(term('fatePoint'), '을/를')} 내고 ${term('invoke')}한다.`,
          open: ['[data-roll-panel]', '[data-roll-tray]'],
          ring: paidWith === 'fate_point' ? '[data-tour="fate"]' : '[data-tour="invoke-cards"]',
          example:
            mode === 'bonus'
              ? '+2가 합계에 더해졌다. 바뀐 결과를 확인'
              : '주사위를 새로 굴렸다. 바뀐 결과를 확인',
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
        if (!plan) return `${josa(who, '은/는')} 더 버틸 칸이 없어 탈락`;
        const parts = [
          ...(plan.stressBox ? [`${term('stress')} ${plan.stressBox}번 칸`] : []),
          ...plan.consequences.map((slot) => term(slot)),
        ];
        const used = parts.map((x, k) => (k < parts.length - 1 ? josa(x, '과/와') : x)).join(' ');
        const scars = plan.consequences.map((slot) => `"${NAMES[slot]}"`).join(', ');
        return `${josa(`피해 ${pending.shifts}`, '이/가')} 들어갔다. ${josa(who, '은/는')} ${josa(used, '으로/로')} 버틴다.${scars ? ` 상처 ${josa(scars, '은/는')} ${josa(term('consequence'), '으로/로')} 남는다.` : ''}`;
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
    // 이번 장의 행동을 마치면 해설을 읽고, 이야기가 이어지다 다음 내 차례가 온다
    if (lesson === roll.action) {
      setLesson('story');
      setNotes(afterNotes(roll.action, fin.payload.outcome, hurt));
      setBeats(actAfter(roll.action));
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
      setLesson('story');
      setNotes(afterNotes('defend', outcomeFor(roll, 'defense'), hurt));
      setBeats(actAfter('defend'));
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
        example: `${josa(term(a), '은/는')} 결과마다 이렇게 달라진다.`,
        label: '확인',
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
        title: `${term('boost')}란`,
        body: `잠깐 생긴 작은 기회. ${term('fatePoint')} 없이 한 번 ${term('invoke')}할 수 있고, 쓰면 바로 사라진다.`,
        example: '예: "흔들리는 발판", "연기 사이로 난 틈". 다음 굴림이 아쉬울 때 +2로 쓴다.',
        label: '다음',
      });
    if (a === 'create_advantage' && (o === 'success' || o === 'style'))
      out.push({
        chapter,
        step: 4,
        title: `${josa(term('freeInvoke'), '은/는')} ${term('fatePoint')} 없이 받는 +2`,
        body: `방금 지은 ${term('aspect')}이 장면에 꼬리표로 붙었다. 꽂힌 핀 수만큼 ${term('fatePoint')} 없이 ${term('invoke')}할 수 있다.`,
        points: [
          `${term('freeInvoke')}은 이 ${term('aspect')}을 만든 나나 동료가 쓸 수 있다.`,
          `다 써도 ${term('aspect')}은 장면에 남는다. 그 뒤로는 ${josa(term('fatePoint'), '을/를')} 내고 ${term('invoke')}하면 된다.`,
          `이게 ${term('create_advantage')}의 핵심이다. 미리 깔아 두고, 중요한 공격 때 꺼내 쓴다.`,
        ],
        moreLabel: '누가, 언제 쓰나',
        open: ['[data-tour="aspects"]'],
        ring: '[data-tour="aspects"]',
        example: `다음 장 ${term('attack')}에서 굴림이 아쉬우면 이 카드를 쓴다.`,
        label: '다음',
      });
    if (hurt)
      out.push({
        chapter,
        step: 4,
        title: '피해 버티는 법',
        body: hurt,
        points: [
          `${term('stress')}: 1·2·3번 칸. 피해보다 번호가 같거나 큰 빈칸 하나를 채우면 그 피해를 막는다. 장면이 끝나면 비워진다.`,
          `${term('consequence')}: ${term('mild')}은 2, ${term('moderate')}은 4, ${term('severe')}는 6까지 막는다. 대신 상처가 ${term('aspect')}으로 남고, 상대는 그 상처로 ${term('freeInvoke')} 1번을 얻는다.`,
          `${term('stress')}와 ${term('consequence')}으로도 못 막으면 ${term('takenOut')}한다. 어떻게 쓰러지는지는 이긴 쪽이 정한다.`,
        ],
        moreLabel: `${term('stress')} · ${term('consequence')} 다시 보기`,
        open: ['[data-tour="party"]'],
        ring: '[data-tour="party"]',
        example:
          a === 'defend'
            ? `내 이름표에서 ${term('stress')} 칸과 ${term('consequence')} 칸 확인`
            : `${josa(BOSS.name, '은/는')} 이제 ${bossLeft()}만 남았다. 조금만 더`,
        label: '다음',
      });
    if (a === 'overcome')
      out.push({
        chapter: '막간 · 강요',
        step: 4,
        title: `GM이 ${josa(term('trouble'), '을/를')} 건드린다: ${term('compel')}`,
        body: `GM이 "네 ${term('trouble')} 때문에 일이 꼬여"라고 제안하는 것. 받아들이면 곤란해지는 대신 ${term('fatePoint')} 1개를 받는다.`,
        points: [
          `받아들이면: 일이 꼬이고 ${term('fatePoint')} 1개를 받는다. ${josa(term('fatePoint'), '을/를')} 모으는 기본 방법.`,
          `거절하면: ${term('fatePoint')} 1개를 내고 꼬이는 걸 막는다.`,
          `모은 ${josa(term('fatePoint'), '은/는')} 나중에 ${term('invoke')}할 때 쓴다. 꼬였다가 멋지게 뒤집는 것.`,
          'TRPG에서는 캐릭터가 곤란해질수록 이야기가 재미있어진다.',
        ],
        moreLabel: '받으면? 거절하면?',
        example: '처음이라면 받아들이기 추천',
        label: `${term('compel')} 받아 보기`,
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
        ? `${term('fatePoint')} +1, 이야기가 꼬였다`
        : `${term('fatePoint')} 1개를 내고 막았다`,
      body: accepted
        ? `이름표의 동전이 하나 늘었다. 지금 곤란해진 대신 나중에 판을 뒤집을 힘을 얻은 것.`
        : `거절은 언제든 할 수 있지만 ${josa(term('fatePoint'), '이/가')} 든다. 대개는 받아들이는 편이 이득.`,
      open: ['[data-tour="party"]'],
      ring: '[data-tour="party"]',
      example: `${josa(term('fatePoint'), '은/는')} ${josa(term('compel'), '을/를')} 받아들여서 얻고, ${term('invoke')}할 때 쓴다.`,
      label: '이야기 계속',
    },
  ];

  // ---------- 이야기 박자 ----------
  const P = pick.name;
  const gmSays = (text: string | (() => string)): Beat => ({ kind: 'line', who: null, text });
  const says = (who: string, text: string | (() => string)): Beat => ({ kind: 'line', who, text });
  const explain = (n: Omit<Note, 'step'> | (() => Omit<Note, 'step'>)): Beat => ({
    kind: 'note',
    note: () => ({ step: 4, ...(typeof n === 'function' ? n() : n) }),
  });

  /** 두목에게 남은 버틸 칸 (해설용) */
  const bossLeft = useCallback(() => {
    const b = room.getSnapshot().state.characters[bossId]!;
    const parts = [
      ...b.stress.flatMap((used, i) => (used ? [] : [`${term('stress')} ${i + 1}번 칸`])),
      ...(['mild', 'moderate', 'severe'] as const)
        .filter((slot) => !b.consequences[slot])
        .map((slot) => term(slot)),
    ];
    if (parts.length === 0) return '버틸 칸 없음';
    return parts.map((x, k) => (k < parts.length - 1 ? josa(x, '과/와') : x)).join(' ');
  }, [room, bossId]);

  /**
   * 동료(GM 자동)가 두목을 공격한다. 차이(shifts)가 나오도록 주사위를 정해 두고,
   * 특기와 (있으면) 내 특성의 무료 발동까지 실제 명령으로 처리한다.
   * 두목은 주사위가 멈춘 뒤 정해 둔 후유증으로 받아낸다 (못 받아내면 탈락).
   */
  const npcAttack = (
    who: SampleCharacter,
    shifts: number,
    opts: {
      invoke?: string | null;
      absorb?: { slot: 'mild' | 'moderate' | 'severe'; text: string };
    },
  ): string | null => {
    const snap = room.getSnapshot().state;
    const id = findId(snap, who.name);
    const c = snap.characters[id]!;
    const b = snap.characters[bossId]!;
    if (b.takenOut) return null;
    const approach = attackApproach(who);
    const stunts = stuntBonuses(c, 'attack', approach);
    const inv =
      opts.invoke && (snap.aspects[opts.invoke]?.freeInvokes ?? 0) > 0 ? opts.invoke : null;
    room.forceDice(
      b.approaches.quick + shifts - c.approaches[approach] - stunts.length * 2 - (inv ? 2 : 0),
    );
    room.forceDice(0);
    const evs = run(GM, {
      type: 'roll.request',
      payload: { characterId: id, action: 'attack', approach, targetId: bossId },
    });
    const first = evs[0];
    const rid = first && 'rollId' in first.payload ? (first.payload.rollId as string) : null;
    if (!rid) return null;
    run(GM, { type: 'roll.defend', payload: { rollId: rid, approach: 'quick' } });
    for (const st of stunts)
      run(GM, { type: 'stunt.apply', payload: { rollId: rid, side: 'active', stuntId: st.id } });
    if (inv)
      run(GM, {
        type: 'invoke.apply',
        payload: {
          rollId: rid,
          side: 'active',
          aspectId: inv,
          mode: 'bonus',
          paidWith: 'free_invoke',
        },
      });
    run(GM, { type: 'roll.defense_ready', payload: { rollId: rid } });
    run(GM, { type: 'roll.finalize', payload: { rollId: rid, reduceForBoost: false } });
    setAllyKey(who.key);
    window.setTimeout(() => {
      const now = room.getSnapshot().state;
      const pending = Object.values(now.pendingDamage).find((d) => d.rollId === rid);
      if (!pending) return;
      const target = now.characters[pending.targetId]!;
      const wanted = opts.absorb
        ? { stressBox: null, consequences: [opts.absorb.slot] as const }
        : undefined;
      const plan =
        wanted &&
        isValidAbsorb(pending.shifts, target, { ...wanted, consequences: [...wanted.consequences] })
          ? { stressBox: null, consequences: [opts.absorb!] }
          : (() => {
              const p = absorbOptions(pending.shifts, target)[0];
              const NAMES = {
                mild: '그을린 소매',
                moderate: '깊게 베인 어깨',
                severe: '부러진 갈비뼈',
              };
              return p
                ? {
                    stressBox: p.stressBox,
                    consequences: p.consequences.map((slot) => ({ slot, text: NAMES[slot] })),
                  }
                : null;
            })();
      run(GM, {
        type: 'damage.absorb',
        payload: plan
          ? { rollId: rid, takeOut: false, ...plan }
          : { rollId: rid, takeOut: true, stressBox: null, consequences: [] },
      });
    }, 1500);
    return rid;
  };

  /** 이번 이야기에서 내가 이점 만들기로 붙인 장면 특성 (핀이 남아 있으면) */
  const myMadeAspect = () =>
    Object.values(room.getSnapshot().state.aspects).find(
      (a) => a.ownerType === 'scene' && a.kind === 'situation' && a.freeInvokes > 0,
    );

  const enterFeast = () => {
    room.run(GM, {
      type: 'scene.start',
      payload: { name: FEAST.name, aspects: [...FEAST.aspects] },
    });
    room.run(GM, { type: 'scene.mood', payload: { backdrop: 'tavern', time: 'night' } });
  };

  const prologue = (): Beat[] => [
    gmSays(
      '해 질 녘, 물레방아 마을. 추수를 막 끝낸 들판 너머로 검은 연기가 피어오른다. 마을 끝, 곡물 창고 쪽이다.',
    ),
    explain({
      chapter: '프롤로그',
      title: 'TRPG는 다 같이 이야기를 만드는 놀이',
      body: 'GM이 장면을 들려주면, 나는 내 캐릭터가 뭘 할지 말로 정한다. 결과가 뻔하지 않을 때만 주사위를 굴린다.',
      example: '정답은 없다. "내 캐릭터라면 어떻게 할까?"만 떠올리면 된다.',
      points: ['이기고 지는 것보다 멋진 장면이 나오는 게 중요하다.'],
      moreLabel: '이기면 끝일까',
      open: ['[data-tour="dialogue"]'],
      ring: '[data-tour="dialogue"]',
      label: '이야기 듣기',
    }),
    says(ELDER, '도적 떼요! 겨울을 날 곡식이 전부 저 창고에 있소. 제발 좀 막아 주시오!'),
    says(mateA.name, voiceA.hello(P)),
    says(mateB.name, voiceB.hello(P)),
    explain({
      chapter: '프롤로그',
      title: '동료와 함께 가는 이야기',
      body: `이번 이야기에는 ${josa(mateA.name, '과/와')} ${josa(mateB.name, '이/가')} 동료로 함께한다. 진짜 게임에선 친구들이 한 명씩 맡는데, 여기선 컴퓨터가 대신 말하고 굴린다.`,
      points: [
        '대사창에는 GM의 서술과 등장인물의 말이 차례로 나온다. 위쪽 이름표가 지금 말하는 사람.',
        '촌장처럼 GM이 맡는 사람들을 NPC라고 한다.',
        `동료도 자기 차례에 행동하고 굴린다. 서로 만든 ${josa(term('aspect'), '을/를')} 이어받아 쓰기도 한다.`,
      ],
      moreLabel: '대사창 읽는 법',
      open: ['[data-tour="dialogue"]'],
      ring: '[data-tour="dialogue"]',
    }),
    explain({
      chapter: '프롤로그',
      title: `내 캐릭터: ${P}`,
      body: `캐릭터는 숫자보다 짧은 문구로 설명한다. ${term('high')}은 "${pick.create.highConcept}", ${term('trouble')}은 ${josa(`"${pick.create.trouble}"`, '이다/다')}. 이런 문구를 ${term('aspect')}이라고 한다.`,
      example: `${josa(term('trouble'), '은/는')} 일을 꼬이게 한다. 대신 그때마다 ${josa(term('fatePoint'), '을/를')} 받을 수 있다.`,
      open: ['[data-tour="party"]'],
      ring: '[data-tour="party"]',
    }),
    explain({
      chapter: '프롤로그',
      title: `${term('aspect')}은 이 이야기의 "사실"`,
      body: `장면 위에 붙은 꼬리표가 지금 장면의 ${term('aspect')}이다. 굴림이 아쉬울 때 ${term('fatePoint')} 1개를 내고 ${josa(term('aspect'), '을/를')} "${term('invoke')}"하면 +2를 받는다.`,
      example: `쓸 때는 "연기가 바람을 타니까 그 뒤에 숨을 수 있어!"처럼 이유를 붙인다.`,
      points: [
        `캐릭터 ${term('aspect')}: 어떤 사람인지 보여 주는 ${term('high')}, 발목을 잡는 ${term('trouble')}, 그 밖의 특징`,
        `장면 ${term('aspect')}: 지금 장소와 상황에 대한 사실. 누구나 쓸 수 있음`,
        `${term('aspect')}은 좋게도 나쁘게도 쓰인다. 불길은 나를 막기도, 적을 막기도 한다`,
      ],
      moreLabel: `${term('aspect')}의 종류`,
      open: ['[data-tour="aspects"]'],
      ring: '[data-tour="aspects"]',
    }),
    explain({
      chapter: '프롤로그',
      title: `${josa(term('fatePoint'), '은/는')} 지금 ${me.fatePoints}개`,
      body: `이름표의 동전 하나가 ${term('fatePoint')} 1개. ${term('invoke')}할 때마다 하나씩 줄고, 저절로 늘지 않는다.`,
      example: '그래서 진짜 중요한 굴림에 쓴다.',
      points: [
        `쓸 때: ${term('invoke')}할 때마다 1개, ${josa(term('compel'), '을/를')} 거절할 때 1개`,
        `얻는 법: GM의 ${josa(term('compel'), '을/를')} 받아들여 일이 꼬이게 두면 1개, 상대가 내 ${josa(term('aspect'), '을/를')} 나에게 불리하게 쓰면 1개`,
        `세션이 새로 시작되면 ${term('refresh')} 수치(${P}는 ${me.refresh})까지 다시 채워진다. 이야기 끝에서 직접 본다.`,
      ],
      moreLabel: '쓰는 법 · 얻는 법',
      open: ['[data-tour="party"]'],
      ring: '[data-tour="party"]',
    }),
    gmSays(
      `${josa(P, '이/가')} 동료들과 창고로 달려가는 사이, 바람이 연기를 마을 쪽으로 밀어붙인다.`,
    ),
    { kind: 'do', run: () => enterGranary(room), wait: 700 },
    gmSays(
      '창고 문은 부서져 있다. 곡물 더미 사이로 불길이 치솟고, 도적들이 자루를 나른다. 다락 위에는 도끼를 어깨에 걸친 도적 두목. 마을 경비대와 한바탕 싸운 뒤라 숨을 몰아쉬고 있다.',
    ),
    says(mateB.name, '불길 너머에 창고지기 아저씨가 쓰러져 있어!'),
    says(mateA.name, voiceA.sendAhead(P)),
    explain({
      chapter: '1장 · 내 차례',
      title: '행동은 딱 네 가지',
      body: `뭘 하든 대사창 오른쪽의 네 행동 중 하나다. ${term('overcome')}, ${term('create_advantage')}, ${term('attack')}, ${term('defend')}. 이야기 속에서 내 차례가 올 때마다 하나씩 해 본다.`,
      example: '누를 곳만 빛난다. 빛나는 곳만 따라 누르면 된다.',
      points: [5, 4, 3, 2, 1, 0, -1, -2].map((n) => `${sign(n)} ${LADDER_LABELS[n]}`),
      moreLabel: `수치를 읽는 말: ${term('ladder')}`,
      open: ['[data-tour="actions"]'],
      ring: '[data-tour="actions"]',
      label: '1장 시작',
    }),
    { kind: 'lesson', lesson: 'overcome' },
  ];

  /** 내 차례가 끝난 뒤 이어지는 이야기 */
  const actAfter = (a: Action): Beat[] => {
    if (a === 'overcome')
      return [
        gmSays(
          `${josa(P, '이/가')} 창고지기를 불길 밖으로 끌어낸다. 그때 다락 위에서 웃음소리가 울린다. "내 곡식에 손대는 놈이 누구냐?" 두목이 도끼를 들고 뛰어내린다.`,
        ),
        says(mateB.name, voiceB.charge),
        {
          kind: 'npc',
          run: () => npcAttack(mateB, 4, { absorb: { slot: 'moderate', text: '깊게 베인 어깨' } }),
        },
        explain({
          chapter: '2장 · 동료의 차례',
          title: `${mateB.name}의 ${term('attack')}`,
          body: `동료도 자기 차례에 굴린다. ${josa(mateB.name, '은/는')} 두목보다 4 높게 나와 피해 4를 줬다. 두목은 ${josa(term('moderate'), '으로/로')} 받아냈다.`,
          example: '두목 이름표에 상처가 하나 늘었다.',
          open: ['[data-tour="foe"]'],
          ring: '[data-tour="foe"]',
        }),
        explain(() => ({
          chapter: '2장 · 동료의 차례',
          title: `다쳤을 때 버티는 법: ${term('stress')}와 ${term('consequence')}`,
          body: `공격을 못 막으면 진 차이만큼 피해가 들어온다. 바로 쓰러지진 않는다. 먼저 ${term('stress')} 칸으로, 모자라면 ${josa(term('consequence'), '으로/로')} 버틴다.`,
          example: `${josa(BOSS.name, '은/는')} 경비대와 싸우며 ${term('stress')} 1·2번 칸을 이미 썼다. 남은 건 ${bossLeft()}.`,
          points: [
            `${term('stress')}(1·2·3번 칸): 숨이 차거나 살짝 긁힌 정도. 피해보다 번호가 같거나 큰 빈칸 하나를 채우면 그 피해를 다 막는다. 장면이 끝나면 비워진다.`,
            `${term('consequence')}(${term('mild')} 2 · ${term('moderate')} 4 · ${term('severe')} 6): 진짜로 다친 것. 적힌 만큼 피해를 막는 대신 "깊게 베인 어깨" 같은 ${term('aspect')}이 남는다.`,
            `둘 다 써도 못 막으면 ${term('takenOut')}. 그 전에 스스로 ${term('concede')}하면 어떻게 물러날지 내가 정하고, ${josa(term('fatePoint'), '을/를')} 받는다.`,
          ],
          moreLabel: `${term('stress')} · ${term('consequence')} 자세히`,
          open: ['[data-tour="foe"]'],
          ring: '[data-tour="foe"]',
        })),
        explain({
          chapter: '2장 · 동료의 차례',
          title: `상처 카드에 꽂힌 핀: ${term('freeInvoke')}`,
          body: `상대에게 ${josa(term('consequence'), '을/를')} 남기면 그 카드에 핀이 하나 꽂힌다. 핀 하나로 ${term('fatePoint')} 없이 한 번 ${term('invoke')}할 수 있다.`,
          example: `"깊게 베인 어깨"의 핀은 ${josa(mateB.name, '이/가')} 남긴 것. 같은 편이라 나도 쓸 수 있다.`,
          points: [
            `쓰는 법: ${term('fatePoint')} 대신 핀 하나를 뺀다. 똑같이 +2를 받거나 다시 굴릴 수 있다.`,
            `핀을 다 써도 ${term('aspect')}은 남는다. 그다음부턴 ${josa(term('fatePoint'), '을/를')} 내고 ${term('invoke')}한다.`,
            `얻는 법: ${term('create_advantage')}에 성공하면 핀 1개, 대성공하면 2개. 상대에게 ${josa(term('consequence'), '을/를')} 남겨도 1개.`,
            `${josa(term('boost'), '은/는')} 핀 없이도 한 번 공짜로 쓰고 사라지는 작은 기회.`,
          ],
          moreLabel: '쓰는 법 · 얻는 법',
          open: ['[data-tour="aspects"]'],
          ring: '[data-tour="aspects"]',
        }),
        gmSays(
          '두목이 어깨를 감싸 쥐고 물러선다. 그래도 도끼는 여전히 매섭다. 정면으로 붙기 전에, 판을 우리 쪽으로 기울여 두는 게 좋겠다.',
        ),
        explain({
          chapter: '2장 · 내 차례',
          title: '이번엔 판을 기울이기',
          body: `${josa(term('create_advantage'), '은/는')} 나 혼자만 좋은 게 아니다. 내가 만든 ${term('aspect')}의 핀은 동료도 쓸 수 있다.`,
          example: '연기, 무너지는 대들보, 흩어진 곡식 자루. 무엇이든 이용해 보자.',
          label: '2장 시작',
        }),
        { kind: 'lesson', lesson: 'create_advantage' },
      ];
    if (a === 'create_advantage')
      return [
        says(mateA.name, () => voiceA.followUp(P, myMadeAspect()?.text ?? null)),
        {
          kind: 'npc',
          run: () =>
            npcAttack(mateA, 6, {
              invoke: myMadeAspect()?.id ?? null,
              absorb: { slot: 'severe', text: '부러진 갈비뼈' },
            }),
        },
        explain(() => {
          const used = Object.values(room.getSnapshot().state.rolls).some(
            (r) =>
              r.active.characterId === findId(room.getSnapshot().state, mateA.name) &&
              r.active.modifiers.some((m) => m.paidWith === 'free_invoke'),
          );
          return {
            chapter: '3장 · 함께 싸우기',
            title: used
              ? `${josa(mateA.name, '이/가')} 내 ${term('aspect')}의 핀을 썼다`
              : `${mateA.name}의 ${term('attack')}`,
            body: used
              ? `${josa(mateA.name, '은/는')} 내가 만든 ${josa(term('aspect'), '을/를')} ${term('freeInvoke')}해 +2를 받고, 두목에게 ${josa(term('severe'), '을/를')} 남겼다. ${josa(term('create_advantage'), '은/는')} 이렇게 동료의 공격을 받쳐 준다.`
              : `${josa(mateA.name, '은/는')} 두목에게 ${josa(term('severe'), '을/를')} 남겼다. 내가 ${josa(term('aspect'), '을/를')} 붙였다면 동료가 그 핀으로 +2를 받았을 것이다.`,
            example: `${josa(BOSS.name, '은/는')} 이제 ${bossLeft()}만 남았다.`,
            open: ['[data-tour="foe"]'],
            ring: '[data-tour="foe"]',
          };
        }),
        says(mateA.name, voiceA.cheer(P)),
        { kind: 'lesson', lesson: 'attack' },
      ];
    if (a === 'attack')
      return [
        gmSays(
          `두목이 피 섞인 침을 뱉는다. "애송이들이…!" 남은 힘을 모두 끌어모아, 도끼가 ${P}에게 날아든다.`,
        ),
        { kind: 'lesson', lesson: 'defend' },
      ];
    return [
      says(mateB.name, `놈은 이제 버틸 힘이 거의 없어. ${P}, 끝내자!`),
      explain({
        chapter: '마무리',
        title: '이제 진짜 주사위로',
        body: `네 가지 행동을 다 해 봤다. 이번엔 주사위를 미리 정해 두지 않는다. 행동도 ${term('approach')}도 자유. ${josa(BOSS.name, '을/를')} 쓰러뜨리면 장면이 끝난다.`,
        example: `${josa(term('fatePoint'), '은/는')} 아끼지 않아도 된다. 다음 세션이 열리면 ${josa(term('refresh'), '으로/로')} 다시 채워진다.`,
        points: [
          `${josa(term('stunt'), '이/가')} 맞는 ${josa(term('approach'), '을/를')} 고르면 +2를 더 받는다.`,
          `굴림이 아쉬우면 장면이나 두목의 ${josa(term('aspect'), '을/를')} ${term('invoke')}한다. 핀이 꽂힌 카드부터.`,
          '내가 못 끝내도 괜찮다. 동료가 이어받는다.',
        ],
        moreLabel: '이길 방법',
        label: '마무리 시작',
      }),
      { kind: 'lesson', lesson: 'free' },
    ];
  };

  /** 마무리에서 내가 한 번 굴린 뒤에도 두목이 버티면 동료가 끝낸다 */
  const finisher = (): Beat[] => [
    says(mateA.name, voiceA.finish),
    { kind: 'npc', run: () => npcAttack(mateA, 4, {}) },
  ];

  /** 끝난 세션을 닫고 이정표를 준다 */
  const closeSession = () => {
    if (room.getSnapshot().state.session) run(GM, { type: 'session.end', payload: {} });
    run(GM, {
      type: 'milestone.grant',
      payload: {
        characterIds: [meId, findId(state, mateA.name), findId(state, mateB.name)],
        size: 'minor',
      },
    });
  };

  const milestoneIntro = explain({
    chapter: '에필로그 · 성장',
    title: `세션이 끝나면 ${term('milestone')}`,
    body: `GM이 세션을 마치며 작은 ${josa(term('milestone'), '을/를')} 줬다. 혜택 하나를 골라 ${josa(P, '을/를')} 조금 바꿀 수 있다. 고르지 않고 넘겨도 된다.`,
    example: '이번 이야기에서 겪은 일에 맞게 고르면 된다.',
    points: [
      `작은 ${term('milestone')}: 보통 세션이 끝날 때마다. 접근법 두 개 맞바꾸기, ${term('high')} 말고 ${term('aspect')} 하나 고쳐 쓰기, ${term('stunt')} 하나 바꾸기, 새 ${term('stunt')} 얻기 중 하나.`,
      `중요한 ${term('milestone')}: 이야기 한 편(시나리오)이 끝날 때. 작은 혜택에 더해 ${term('approach')} 하나 +1.`,
      `큰 ${term('milestone')}: 캠페인이 크게 뒤바뀔 때. ${term('refresh')} +1, ${term('high')}도 고쳐 쓸 수 있다.`,
    ],
    moreLabel: '이정표 세 가지',
    open: ['[data-tour="party"]'],
    ring: '[data-tour="party"]',
    label: '혜택 고르기',
  });

  const epilogue = (): Beat[] => [
    gmSays(
      '두목이 쓰러지자 남은 도적들이 자루를 내던지고 달아난다. 마을 사람들이 물동이를 들고 몰려와 불길을 잡는다.',
    ),
    { kind: 'do', run: enterFeast, wait: 700 },
    explain({
      chapter: '에필로그',
      title: '장면이 바뀌면',
      body: `${term('stress')} 칸은 장면이 끝나면 비워진다. 장면 ${term('aspect')}과 ${josa(term('boost'), '은/는')} 사라지고, ${josa(term('consequence'), '은/는')} 나을 때까지 남는다.`,
      example: '이제 불타는 창고가 아니라 마을 광장이다.',
      open: ['[data-tour="aspects"]'],
    }),
    gmSays(
      '그날 밤, 마을 광장에 모닥불이 피어오른다. 지켜 낸 곡식으로 구운 빵 냄새가 골목마다 번진다.',
    ),
    says(ELDER, '겨울 양식을 지켜 주셨소. 오늘 밤만큼은 마을이 다 대접하겠소!'),
    says(mateA.name, voiceA.feast(P)),
    says(mateB.name, voiceB.feast(P)),
    gmSays('이렇게 첫 이야기가 끝난다.'),
    { kind: 'do', run: closeSession, wait: 400 },
    milestoneIntro,
    { kind: 'milestone' },
  ];

  /** 이정표 혜택을 적용하고 재충전으로 다음 세션을 여는 데까지 */
  const onMilestone = (choice: MilestoneChoice | null) => {
    setMilestoneOpen(false);
    let what = '이번엔 아무것도 바꾸지 않았다. 이정표는 미뤄 두지 않고 그 자리에서 쓰거나 넘긴다.';
    if (choice?.kind === 'swap') {
      const next = {
        ...me.approaches,
        [choice.a]: me.approaches[choice.b],
        [choice.b]: me.approaches[choice.a],
      };
      run(ME, { type: 'character.update', payload: { id: meId, patch: { approaches: next } } });
      what = `${term(choice.a)} ${sign(me.approaches[choice.a])} ↔ ${term(choice.b)} ${sign(me.approaches[choice.b])}. 숫자 합은 그대로, 잘하는 방식만 바뀌었다.`;
    }
    if (choice?.kind === 'aspect') {
      run(ME, { type: 'aspect.update', payload: { aspectId: choice.aspectId, text: choice.text } });
      what = `${term('aspect')} 하나를 "${choice.text}"${josa(choice.text, '으로/로').slice(choice.text.length)} 고쳐 썼다. 겪은 일이 캐릭터를 바꾼 것.`;
    }
    if (choice?.kind === 'swapStunt' || choice?.kind === 'newStunt') {
      const idea = STUNT_IDEAS[pick.key]!.find((x) => x.id === choice.stuntId)!;
      const stunts =
        choice.kind === 'swapStunt'
          ? me.stunts.map((x) => (x.id === choice.replace ? idea : x))
          : [...me.stunts, idea];
      run(ME, { type: 'character.update', payload: { id: meId, patch: { stunts } } });
      what =
        choice.kind === 'swapStunt'
          ? `${josa(term('stunt'), '을/를')} "${idea.text}"${josa(idea.text, '으로/로').slice(idea.text.length)} 바꿨다.`
          : `새 ${term('stunt')} "${idea.text}". ${term('stunt')} ${stunts.length}개라 ${term('refresh')}은 ${room.getSnapshot().state.characters[meId]!.refresh} 그대로.`;
    }
    setBeats([
      explain({
        chapter: '에필로그 · 성장',
        title: choice ? `${josa(P, '이/가')} 조금 달라졌다` : '이번엔 넘겼다',
        body: what,
        example: `내 이름표를 열면 바뀐 모습이 보인다.`,
        open: ['[data-tour="party"]'],
        ring: '[data-tour="party"]',
      }),
      explain(() => {
        const c = room.getSnapshot().state.characters[meId]!;
        return {
          chapter: '에필로그 · 재충전',
          title: `${term('refresh')}: 다음 세션의 ${term('fatePoint')}`,
          body: `세션이 끝난 지금 ${josa(term('fatePoint'), '은/는')} ${c.fatePoints}개. 다음 세션이 열리면 ${term('refresh')} 수치인 ${c.refresh}개까지 다시 채워진다. 이미 더 많으면 줄지 않는다.`,
          points: [
            `${term('stunt')} 3개까지는 ${term('refresh')} 3 그대로. 4개째부터 하나 늘 때마다 ${term('refresh')}이 1씩 준다 (최소 1).`,
            `그래서 ${josa(term('stunt'), '을/를')} 많이 가질수록 세션마다 받는 ${josa(term('fatePoint'), '이/가')} 줄어든다. 재주냐, 운이냐를 고르는 셈.`,
            `큰 ${josa(term('milestone'), '은/는')} ${josa(term('refresh'), '을/를')} 1 늘려 준다.`,
          ],
          moreLabel: `${term('stunt')}과 ${term('refresh')}`,
          example: '다음 세션을 열어 직접 보자.',
          open: ['[data-tour="party"]'],
          ring: '[data-tour="party"]',
          label: '다음 세션 열기',
        };
      }),
      {
        kind: 'do',
        run: () => run(GM, { type: 'session.start', payload: { title: '두 번째 세션' } }),
        wait: 600,
      },
      { kind: 'end' },
    ]);
  };

  // 처음 한 번: 프롤로그를 깐다
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    window.setTimeout(() => setBeats(prologue()), 0);
    // 첫 화면에서 한 번만 깐다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const playBeat = (head: Beat, shift: () => void) => {
    // 이야기가 이어지면 끝난 판정은 접고 대사창으로 돌아간다
    if ((head.kind === 'line' || head.kind === 'lesson') && rollId) setDismissed(rollId);
    switch (head.kind) {
      case 'line': {
        const text = typeof head.text === 'function' ? head.text() : head.text;
        if (head.who === null) run(GM, { type: 'narration.post', payload: { text } });
        else run(GM, { type: 'chat.post', payload: { text, as: head.who } });
        const mate = [mateA, mateB].find((m) => m.name === head.who);
        if (mate) setAllyKey(mate.key);
        return;
      }
      case 'note':
        setNotes([typeof head.note === 'function' ? head.note() : head.note]);
        shift();
        return;
      case 'npc': {
        const id = head.run();
        if (!id) return shift();
        setRollId(id);
        setSettled(false);
        setAction(null);
        setApproach(null);
        return;
      }
      case 'do':
        head.run();
        window.setTimeout(shift, head.wait ?? 0);
        return;
      case 'lesson':
        setLesson(head.lesson);
        shift();
        return;
      case 'milestone':
        setMilestoneOpen(true);
        shift();
        return;
      case 'end':
        setFinished(true);
        shift();
        return;
    }
  };

  const head = beats[0];
  const beatBlocked = !!compel || !!prompt || notes.length > 0 || milestoneOpen;
  const ranBeat = useRef<Beat | null>(null);
  useEffect(() => {
    if (!head || beatBlocked || ranBeat.current === head) return;
    ranBeat.current = head;
    const shift = () => setBeats((q) => (q[0] === head ? q.slice(1) : q));
    // 렌더가 끝난 뒤에 처리한다 (박자마다 명령을 보내고 화면 상태를 바꾼다)
    window.setTimeout(() => playBeat(head, shift), 0);
    // 박자 하나는 한 번만 처리한다 (ranBeat). playBeat는 그때의 화면 값을 쓰면 된다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [head, beatBlocked]);

  /** 대사를 읽고 넘기거나 동료의 굴림을 보고 넘긴다 */
  const storyWaiting = !!head && !beatBlocked && (head.kind === 'line' || head.kind === 'npc');
  const advance = () => {
    if (!storyWaiting) return;
    if (head.kind === 'npc' && rollId) setDismissed(rollId);
    setBeats((q) => (q[0] === head ? q.slice(1) : q));
  };

  // 마무리: 내가 한 번 굴렸는데도 두목이 버티면 동료가 이어받는다
  const helped = useRef(false);
  useEffect(() => {
    if (lesson !== 'free' || !final || !roll || roll.active.characterId !== meId) return;
    if (helped.current || boss.takenOut) return;
    helped.current = true;
    window.setTimeout(() => {
      if (room.getSnapshot().state.characters[bossId]!.takenOut) return;
      setBeats((q) => [...q, ...finisher()]);
    }, 1400);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson, final, roll, meId, boss.takenOut, room, bossId]);

  // 두목이 쓰러지면 에필로그로
  const epilogued = useRef(false);
  useEffect(() => {
    if (!boss.takenOut || epilogued.current) return;
    epilogued.current = true;
    window.setTimeout(() => {
      setLesson('story');
      setBeats(epilogue());
    }, 1600);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boss.takenOut]);

  /** 튜토리얼 건너뛰기: 창고로 가서 바로 마무리 싸움. 이미 두목이 쓰러졌으면 이정표로 */
  const skipGuide = () => {
    setNotes([]);
    if (boss.takenOut) {
      if (milestoneOpen || finished) return;
      const granted = !!room.getSnapshot().state.characters[meId]!.milestone;
      setBeats(
        granted
          ? [{ kind: 'milestone' }]
          : [{ kind: 'do', run: closeSession }, { kind: 'milestone' }],
      );
      return;
    }
    setBeats([]);
    if (room.getSnapshot().state.scene?.name !== SCENE.name) enterGranary(room);
    setLesson('free');
  };

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
      !a.hidden &&
      (a.ownerType !== 'character' || a.kind === 'boost' || a.kind === 'consequence') &&
      // 창고를 떠나면 두목의 상처 카드는 무대에서 내린다
      !(a.ownerType === 'character' && a.ownerId === bossId && !atGranary),
  );
  const dealt = useDealt(sceneAspects, events);
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
      const gap = shifts > 0 ? `${shifts} 높아서` : shifts < 0 ? `${-shifts} 모자라서` : '똑같아서';
      const summary = `나 ${formatRating(m.total)}, ${oppName} ${formatRating(opp)}. ${gap} ${josa(term(outcome), '이다/다')}.`;
      return {
        title: '결과 읽기',
        body: summary,
        points: [
          `주사위는 ＋가 +1, 빈 면(○)이 0, －가 −1.`,
          `나: ${m.line}`,
          o ? `${oppName}: ${o.line}` : `넘어야 할 난이도: ${formatRating(opp)}`,
          OUTCOME_RULE,
        ],
        moreLabel: '계산 자세히 보기',
        example:
          side === 'active' && (outcome === 'fail' || outcome === 'tie')
            ? `아직 확정 전. ${josa(term('aspect'), '을/를')} ${term('invoke')}하면 결과를 바꿀 수 있다.`
            : OUTCOME_DETAIL[action][outcome],
        summary,
      };
    },
    [state.characters],
  );

  const tour = useMemo((): Tour | undefined => {
    if (compel || prompt || milestoneOpen) return undefined;
    if (finished)
      return {
        open: [],
        coach: {
          step: 4,
          total: 4,
          clear: true,
          title: '첫 세션 완료',
          body: `${P}의 첫 이야기가 끝났다. 동료와 함께 굴리고, ${term('invoke')}하고, ${josa(term('compel'), '을/를')} 받고, ${term('milestone')}까지 받았다. 이제 진짜 게임으로.`,
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

    // 이야기 박자를 읽는 중: 안내 카드 없이 대사창만
    if (lesson === 'story') return undefined;

    if (lesson === 'free') {
      if (busy && !(settled && (myOutcomeNow === 'fail' || myOutcomeNow === 'tie')))
        return undefined;
      if (busy)
        return {
          open: [],
          coach: {
            step: 4,
            total: 4,
            title: `${josa(`${term('aspect')} ${term('invoke')}`, '으로/로')} 뒤집기`,
            body: `빛나는 ${term('aspect')} 카드를 누르고 +2를 고른다. ${term('fatePoint')} 1개가 들고, 핀이 꽂힌 카드는 무료.`,
          },
        };
      if (beats.length > 0 || boss.takenOut || !atGranary) return undefined;
      const atk = me.stunts.find((st) => st.bonus?.action === 'attack')?.bonus;
      return {
        open: [],
        coach: {
          step: 4,
          total: 4,
          chapter: '마무리',
          title: `${josa(boss.name, '을/를')} 쓰러뜨리기`,
          body: `이제 주사위는 진짜로 구른다. 행동도 ${term('approach')}도 자유. ${josa(boss.name, '은/는')} ${bossLeft()}만 남았다.`,
          example: atk
            ? `3번 ${term('attack')}에 ${josa(term(atk.approach), '을/를')} 고르면 ${term('stunt')} +2까지 받는다.`
            : `2번 ${josa(term('create_advantage'), '으로/로')} ${josa(term('aspect'), '을/를')} 붙이고 3번 ${josa(term('attack'), '을/를')} 하면 더 쉽다.`,
        },
      };
    }

    const n = LESSONS.indexOf(lesson);
    const copy = LESSON_COPY[lesson];
    const chapter = `${n + 1}장 · ${term(lesson)}`;
    const base = { total: 4, chapter };
    // 판정 카드와 아래 특성 카드 줄은 함께 밝게 남긴다
    const panel = '[data-roll-panel]';
    const tray = '[data-roll-tray]';
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
          example: `${josa(boss.name, '이/가')} 다락에서 뛰어내려 ${pick.name}에게 도끼를 휘두른다`,
          next: { label: '막을 준비 됨', onClick: bossAttacks },
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
          moreLabel: '결과별 차이',
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
          title: `어떻게 할지: ${term('approach')} 고르기`,
          body: `같은 행동도 하는 방식은 여러 가지다. 고른 ${term('approach')}의 수치가 주사위에 더해진다.`,
          points: APPROACHES.map(
            (a) =>
              `${term(a)} ${sign(me.approaches[a])}(${LADDER_LABELS[me.approaches[a]]}): ${tip(a)}`,
          ),
          moreLabel: `${term('approach')} 여섯 가지 보기`,
          example: stunt?.bonus
            ? `"${stunt.text}"라는 ${josa(term('stunt'), '이/가')} 있다. ${josa(term(stunt.bonus.approach), '을/를')} 고르면 +2를 더 받는다.`
            : `${josa(pick.name, '은/는')} ${term(best[0])} 수치가 ${josa(`+${best[1]}`, '으로/로')} 가장 높다. 이야기에 어울리는 방식을 골라도 된다.`,
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
          title: '주사위 굴리기',
          body: `주사위 4개를 굴리고, 나온 합에 ${term('approach')} 수치를 더한다. 맞는 ${josa(term('stunt'), '이/가')} 있으면 +2를 더 받는다.`,
          points: [
            '주사위 면은 ＋, 빈 면, － 세 가지. ＋는 +1, 빈 면은 0, －는 −1.',
            `4개를 더하면 −4에서 +4 사이인데, 대부분 −1~+1 근처에서 나온다. 그래서 ${term('approach')} 수치가 가장 중요하다.`,
            '튜토리얼에서는 결과 네 가지를 다 겪어 보도록 주사위가 미리 정해져 있다. 자유 진행부터는 진짜로 굴린다.',
            OUTCOME_RULE,
          ],
          moreLabel: '주사위 읽는 법',
          example:
            lesson === 'defend'
              ? `${boss.name}의 주사위는 이미 굴러갔지만 가려져 있다. 내가 굴리면 둘 다 공개된다.`
              : lesson === 'attack'
                ? `${boss.name}도 ${term('defend')}로 맞서 굴린다. 더 높은 쪽이 이긴다.`
                : `난이도는 ${josa(formatRating(SCENE.overcomeDifficulty), '이다/다')}. 이보다 높으면 성공, 같으면 동점.`,
          keys: ['Space'],
        },
      };

    if (!roll || !settled || roll.status === 'awaiting_defense')
      return {
        open: [panel, tray],
        guide: { focus: null },
        coach: {
          ...base,
          step: 3,
          title: '주사위가 구르는 중…',
          body: '주사위가 멈추길 기다리는 중',
        },
      };

    if (explained !== roll.id)
      return {
        open: [panel, tray],
        guide: { focus: null },
        lockFinalize: true,
        coach: {
          ...base,
          step: 4,
          ...explainRoll(roll, lesson === 'defend' ? 'defense' : 'active'),
          next: { label: '확인', onClick: () => setExplained(roll.id) },
        },
      };

    if (lesson === 'defend') {
      const o = outcomeFor(roll, 'defense');
      return {
        open: [panel, tray],
        ring: '[data-tour="finalize"]',
        guide: { focus: null },
        coach: {
          ...base,
          step: 4,
          title: OUTCOME_COPY.defend[o],
          body:
            o === 'success' || o === 'style'
              ? `${boss.name}의 도끼를 막아냈다. 피해 없음.`
              : `진 차이만큼 피해를 받는다. 먼저 ${term('stress')} 칸으로 버티고, 모자라면 ${term('consequence')}이 남는다.`,
          example: '"결과 확정"을 누르면 이야기에 반영',
        },
      };
    }

    const o = outcomeFor(roll, 'active');
    if ((o === 'fail' || o === 'tie') && canInvokeNow && invokedRoll !== roll.id)
      return {
        open: [panel, tray],
        ring: '[data-tour="invoke-cards"]',
        guide: { focus: null },
        lockFinalize: true,
        coach: {
          ...base,
          step: 4,
          title: `아직 뒤집을 수 있다: ${term('aspect')} ${term('invoke')}`,
          body: `아직 확정 전이라 바꿀 수 있다. 어울리는 ${term('aspect')} 카드를 누르고 "+2"를 고른다. ${term('fatePoint')} 1개가 들고, 핀이 꽂힌 카드는 무료.`,
          points: [
            `+2: 합계에 2를 더한다. 실패가 동점이나 성공으로 바뀔 수 있다.`,
            `다시 굴리기: 주사위 4개를 새로 굴린다. 더 나빠질 수도 있으니 주사위가 아주 나쁠 때 쓴다.`,
            `${term('fatePoint')}: 지금 ${me.fatePoints}개. 하나 쓰면 ${Math.max(0, me.fatePoints - 1)}개. 다 쓰면 핀이 꽂힌 카드만 쓸 수 있다.`,
            `${term('freeInvoke')}: 핀이 꽂힌 카드는 ${term('fatePoint')} 대신 핀 하나를 뺀다. 핀 카드부터 찾을 것.`,
            `같은 ${term('aspect')}은 한 굴림에 한 번만 쓴다. 다른 ${term('aspect')}은 여러 개 함께 써도 된다.`,
            `상대 캐릭터의 ${term('aspect')}에 ${josa(term('fatePoint'), '을/를')} 쓰면, 그 ${josa(term('fatePoint'), '은/는')} 상대가 받는다.`,
          ],
          moreLabel: `${term('invoke')} 규칙 자세히`,
          example: freeCard
            ? `"${freeCard.aspect.text}"에 핀이 ${freeCard.aspect.freeInvokes}개 꽂혀 있다. 이걸 쓰면 ${josa(term('fatePoint'), '을/를')} 아낄 수 있다.`
            : `핀이 꽂힌 카드는 없다. ${term('fatePoint')} 1개를 내고 "${josa(scenePlay?.text ?? '사방에 번지는 불길', '을/를')} 이용하면 돼!"처럼 이유를 붙인다.`,
          keys: ['F'],
        },
      };

    const after: Record<Action, string> = {
      overcome: '확정하면 다음 장으로',
      create_advantage:
        o === 'success' || o === 'style'
          ? `확정하면 새 ${term('aspect')}의 이름을 직접 짓는다.`
          : '확정하면 다음 장으로',
      attack:
        o === 'success' || o === 'style'
          ? `확정하면 ${josa(boss.name, '이/가')} 피해를 받는다.`
          : '확정하면 다음 장으로',
      defend: '',
    };
    return {
      open: [panel, tray],
      ring: '[data-tour="finalize"]',
      guide: { focus: null },
      coach: {
        ...base,
        step: 4,
        title: `${OUTCOME_COPY[lesson][o]}`,
        body:
          o === 'fail' || o === 'tie'
            ? `실패도 이야기가 된다. ${OUTCOME_DETAIL[lesson][o]}`
            : OUTCOME_DETAIL[lesson][o],
        points: [
          explainRoll(roll, 'active').summary,
          ...(o === 'fail' || o === 'tie' ? ['TRPG에서는 일이 꼬일수록 장면이 재미있어진다.'] : []),
        ],
        moreLabel: '이번 굴림 다시 보기',
        example: `"이대로 확정" 누르기. ${after[lesson]}`,
        keys: ['Enter'],
      },
    };
  }, [
    compel,
    prompt,
    milestoneOpen,
    finished,
    beats.length,
    atGranary,
    P,
    bossLeft,
    boss,
    lesson,
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
  const guided = (lesson !== 'free' || notes.length > 0) && !!tour && !tour.coach?.clear;
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

  const companions = SAMPLE_CHARACTERS.filter((s) => s.name !== pick.name).map((s) => ({
    character: state.characters[findId(state, s.name)]!,
    image: asset(s.image),
  }));
  // 끝난 굴림 카드는 다음 행동을 고르면 치우고, 새 굴림 예고 카드를 띄운다
  const stale = final && !!action;
  const previewing = !!action && !!approach && (!busy || defending);
  // 좁은 화면: 굴림이 끝나기 전까지 판정 카드와 발동 카드를 바텀 시트로 띄운다 (내가 막을 차례는 행동 띠를 쓴다)
  const sheetActive = !!roll && !final && !defending;
  const stuntPlus = action && approach ? stuntBonuses(me, action, approach).length * 2 : 0;
  const invokable = Object.values(state.aspects).filter(
    (a) => !a.hidden && (a.ownerType !== 'character' || a.ownerId === meId || a.freeInvokes > 0),
  ).length;
  // 마지막 대사의 주인: GM 서술이면 GM, 누군가의 말이면 그 사람
  const lastTalk = lines.filter((l) => l.kind === 'chat' || l.kind === 'gm').at(-1);
  const talker =
    lastTalk?.kind === 'chat' ? (/^([^:：]{1,16})[:：]/.exec(lastTalk.text)?.[1] ?? null) : null;
  const heroSpeaks = talker === pick.name;
  const ally = SAMPLE_CHARACTERS.find((s) => s.key === allyKey);
  // 동료가 굴리는 판정이면 무대 앞에 그 동료가 선다
  const rollerMate =
    roll && roll.active.characterId !== meId && roll.active.characterId !== bossId
      ? SAMPLE_CHARACTERS.find((s) => s.name === state.characters[roll.active.characterId]?.name)
      : undefined;

  // ---------- 장면 극장 (design-system.md 32절) ----------
  const [tableOpen, setTableOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const dialogueEl = useDialogueTop<HTMLElement>();
  const [rerollMode, setRerollMode] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.repeat && document.querySelector('[data-beat-next]')) {
        const t = e.target;
        if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) return;
        if (t instanceof HTMLButtonElement && !t.hasAttribute('data-beat-next')) return;
        e.preventDefault();
        (document.querySelector('[data-beat-next]') as HTMLButtonElement | null)?.click();
        return;
      }
      if (e.key !== 'Tab' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (compel || prompt) return;
      e.preventDefault();
      setTableOpen((o) => !o);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [compel, prompt]);

  // 내가 막을 접근법을 고르는 동안은 이야기 화면(행동 메뉴)에 머문다
  const pickingDefense = defending && roll?.status === 'awaiting_defense';
  const wantsAction = guided && tour?.guide?.focus === 'action';
  const rollMode =
    !!roll &&
    !stale &&
    !pickingDefense &&
    // 끝난 판정은 이야기가 이어지면 (다음 대사) 접고 대사창으로 돌아간다
    !(final && (dismissed === roll.id || wantsAction || (storyWaiting && head?.kind === 'line')));

  const choiceById = new Map(choices.map((c) => [c.aspect.id, c]));
  const canPlayNow = !!roll && settled && roll.status === 'open' && myRoll;
  const playable = (a: Aspect) => {
    const c = choiceById.get(a.id);
    if (!canPlayNow || !c || c.blocked) return null;
    return rerollMode ? (c.reroll ?? null) : (c.bonus ?? null);
  };
  const play = (a: Aspect) => {
    const p = playable(a);
    if (!p) return;
    onInvoke(a.id, rerollMode ? 'reroll' : 'bonus', p.free ? 'free_invoke' : 'fate_point');
    setRerollMode(false);
  };
  const onRevoke = (aspectId: string) => {
    if (!roll) return;
    run(ME, { type: 'invoke.revoke', payload: { rollId: roll.id, side: 'active', aspectId } });
  };

  const sceneArt = sceneImage(stageScene);
  const portraitFor = (c: Character | undefined) =>
    !c
      ? null
      : c.id === bossId
        ? asset(SCENE.bossImage)
        : (() => {
            const s = SAMPLE_CHARACTERS.find((x) => x.name === c.name);
            return s ? asset(s.image) : (c.portraitUrl ?? null);
          })();
  const artOf = (a: Aspect) => ({
    portrait: a.ownerType === 'character' ? portraitFor(state.characters[a.ownerId]) : null,
    scene: sceneArt,
  });
  const ownerName = (a: Aspect) =>
    a.ownerType === 'character' ? state.characters[a.ownerId]?.name : undefined;

  const handAspects = Object.values(state.aspects).filter(
    (a) =>
      !a.hidden &&
      a.ownerType === 'character' &&
      a.ownerId === meId &&
      (a.kind === 'high' || a.kind === 'normal' || a.kind === 'trouble'),
  );
  const fan = (i: number, n: number) => {
    const mid = (n - 1) / 2;
    const d = i - mid;
    if (n <= 1) return th.fan2;
    if (Math.abs(d) < 0.6) return th.fan2;
    if (Math.abs(d) < 1.6) return d < 0 ? th.fan1 : th.fan3;
    return d < 0 ? th.fanL : th.fanR;
  };

  const played =
    roll?.active.modifiers.map((m, i) => {
      if (m.source.startsWith('stunt:')) {
        const st = activeChar?.stunts.find((s) => `stunt:${s.id}` === m.source);
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
        onRevoke: roll.status === 'open' && myRoll && m.paidWith ? () => onRevoke(id) : undefined,
      };
    }) ?? [];

  const lastSpeaker = talker ?? 'GM';
  const intent =
    roll && roll.targetId === bossId
      ? roll.defense
        ? `${term('defend')} · ${term(roll.defense.approach)} ${sign(roll.defense.rating)}`
        : `${term('defend')} 준비 중`
      : null;

  return (
    <main className={th.theater} data-mode={rollMode ? 'roll' : 'story'} data-coach-region="">
      <div className={th.bg} style={{ backgroundImage: `url(${sceneArt})` }} />
      {/* 인물 층: 장면 시간의 색 보정을 인물에 한 번에 건다 */}
      <div className={th.castLayer}>
        {/* 동료: 창고에서는 방금 말하거나 굴린 동료가 내 뒤에 작게, 마을에서는 둘 다 무대에 선다 */}
        {(atGranary ? (ally ? [ally] : []) : allyKey ? [mateA, mateB] : []).map(
          (m, i) =>
            !(rollMode && rollerMate) && (
              <img
                key={m.key}
                className={`${th.cast} ${atGranary || i === 0 ? styles.ally : th.foe} ${styles.mate}`}
                src={asset(m.image)}
                alt={m.name}
                data-focus={talker === m.name || undefined}
              />
            ),
        )}
        <img
          key={rollMode && rollerMate ? rollerMate.key : 'me'}
          className={`${th.cast} ${th.hero}`}
          src={asset((rollMode && rollerMate ? rollerMate : pick).image)}
          alt={(rollMode && rollerMate ? rollerMate : pick).name}
          data-focus={heroSpeaks || undefined}
        />
        <img
          className={`${th.cast} ${th.foe}`}
          src={asset(SCENE.bossImage)}
          alt={boss.name}
          hidden={!atGranary}
          data-out={boss.takenOut || undefined}
          data-hit={
            (final &&
              roll?.action === 'attack' &&
              (roll.result?.outcome === 'success' || roll.result?.outcome === 'style')) ||
            undefined
          }
        />
      </div>

      <SceneAmbience ambience={stageScene?.ambience} />

      <header className={th.top}>
        <PageNav tone="stage" />
        <h1 key={stageScene?.id ?? 'none'}>{stageScene?.name}</h1>
      </header>
      <div className={th.tools}>
        <button type="button" className={th.tableBtn} onClick={() => setTableOpen(true)}>
          탁자 보기<kbd>Tab</kbd>
        </button>
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
        <span className={styles.sound} data-ink="night">
          <SoundControl />
        </span>
        <button type="button" onClick={onRestart}>
          처음부터
        </button>
      </div>

      <div className={th.myPlate} data-tour="party">
        <Nameplate character={me} sub={pick.create.highConcept} me />
      </div>
      <div className={th.foePlate} data-tour="foe" hidden={!atGranary}>
        <Nameplate character={boss} sub={BOSS.highConcept} />
      </div>
      {rollMode && intent && (
        <div className={th.intent}>
          상대가 맞서는 수<b>{intent}</b>
        </div>
      )}

      {/* 장면에 깔린 특성: 장면 여기저기에 붙는다. 판정 중에는 판정판 둘레로 옮겨 가며 빛난다 */}
      <div className={th.tags} data-tour="aspects">
        {sceneAspects.map((a, i) => {
          const spot = (rollMode ? TAG_SPOTS_ROLL : TAG_SPOTS)[i % TAG_SPOTS.length]!;
          const can = !!playable(a);
          return (
            <div
              key={tagKey(a)}
              className={th.tag}
              style={{ left: `${spot[0]}%`, top: `${spot[1]}%` }}
              data-enter={dealt(a)}
            >
              <TraitCard
                aspect={a}
                art={artOf(a)}
                owner={ownerName(a)}
                depth={consequenceDepth(a, state)}
                size="tag"
                badge={can ? (rerollMode ? '다시' : '+2') : undefined}
                state={can ? 'can' : undefined}
                onClick={can ? () => play(a) : undefined}
              />
            </div>
          );
        })}
      </div>

      <div className={th.duelSlot}>
        {roll && !stale && (
          <Duel
            kind={`${term(roll.action)} 판정`}
            me={{
              name: activeChar?.name ?? '',
              note: (
                <>
                  {term(roll.active.approach)} {sign(roll.active.rating)}
                </>
              ),
              dice: (
                <DiceTray
                  dice={roll.active.dice}
                  rollKey={`${roll.id}:${roll.active.animSeed}`}
                  sealed={roll.status === 'awaiting_defense'}
                  mode={diceMode}
                  onSettled={() => setSettled(true)}
                />
              ),
              total: roll.active.dice && settled && result ? sideTotal(roll.active) : null,
            }}
            opp={
              roll.targetId
                ? {
                    name: targetChar?.name ?? '',
                    note: roll.defense
                      ? `${term('defend')} · ${term(roll.defense.approach)} ${sign(roll.defense.rating)}`
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
            outcome={
              settled && myOutcome && result
                ? final && mySide === 'active'
                  ? roll.result!.outcome
                  : myOutcome
                : null
            }
            provisional={!final}
            canRaise={canPlayNow && canInvokeNow}
            played={played}
            copy={
              settled && myOutcome
                ? !final && (myOutcome === 'fail' || myOutcome === 'tie') && canInvokeNow
                  ? '아직 확정 전. 특성 카드를 내면 바뀐다'
                  : OUTCOME_COPY[mySide === 'defense' ? 'defend' : roll.action][
                      final && mySide === 'active' ? roll.result!.outcome : myOutcome
                    ]
                : undefined
            }
          >
            {roll.status === 'awaiting_defense' && (
              <p className={th.waiting}>굴림 완료. 상대 기다리는 중</p>
            )}
            {settled && roll.status === 'open' && myRoll && unusedStunt && (
              <button
                type="button"
                className={th.ghost}
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
          </Duel>
        )}
      </div>

      {/* 손패: 내 캐릭터 특성. 누르면 판정판으로 날아가 +2가 붙는다 */}
      <div className={th.hand} data-tour="invoke-cards" data-roll-tray="">
        {handAspects.map((a, i) => {
          const can = !!playable(a);
          const used = !!roll?.active.modifiers.some((m) => m.source === `aspect:${a.id}`);
          return (
            <TraitCard
              key={a.id}
              aspect={a}
              art={artOf(a)}
              badge={can ? (rerollMode ? '다시' : '+2') : undefined}
              state={can ? 'can' : used ? 'used' : a.kind === 'trouble' ? 'off' : undefined}
              onClick={can ? () => play(a) : undefined}
              className={fan(i, handAspects.length)}
            />
          );
        })}
      </div>
      <div className={th.chips}>
        <div
          className={th.stack}
          data-tour="fate"
          aria-label={`${term('fatePoint')} ${me.fatePoints}`}
        >
          {Array.from({ length: Math.max(1, Math.min(me.fatePoints, 6)) }, (_, i) => (
            <i key={i} style={me.fatePoints === 0 ? { opacity: 0.2 } : undefined} />
          ))}
        </div>
        <div className={th.chipText}>
          {term('fatePoint')}
          <b>{me.fatePoints}</b>
        </div>
        {canPlayNow && (
          <div className={th.modeSwitch} role="radiogroup" aria-label="카드 쓰는 법">
            <button type="button" aria-pressed={!rerollMode} onClick={() => setRerollMode(false)}>
              +2 더하기
            </button>
            <button type="button" aria-pressed={rerollMode} onClick={() => setRerollMode(true)}>
              다시 굴리기
            </button>
          </div>
        )}
      </div>
      <div className={th.go}>
        {settled && roll?.status === 'open' && myRoll && (
          <button
            type="button"
            className={th.btn}
            data-tour="finalize"
            disabled={guided && !!tour?.lockFinalize}
            onClick={onFinalize}
          >
            확정
          </button>
        )}
        {settled && roll?.status === 'open' && !myRoll && (
          <button
            type="button"
            className={th.btn}
            data-tour="finalize"
            disabled={guided && !!tour?.lockFinalize}
            onClick={onDefenseFinalize}
          >
            결과 확정
          </button>
        )}
        {final && roll && storyWaiting && head?.kind === 'npc' ? (
          <button type="button" className={th.btn} data-beat-next="" onClick={advance}>
            다음 ▸
          </button>
        ) : (
          final &&
          roll && (
            <button type="button" className={th.btn} onClick={() => setDismissed(roll.id)}>
              이야기로
            </button>
          )
        )}
      </div>

      <div className={th.coachSlot}>
        <Presence show={showCoach}>
          {coach && showCoach && (
            <CoachMark
              key={
                coach.clear
                  ? 'clear'
                  : `${lesson}:${coach.chapter ?? ''}:${coach.step}:${coach.title}`
              }
              coach={coach}
              hideLabel={guided ? '튜토리얼 건너뛰기' : '안내 숨기기'}
              anchor={
                tour?.ring ??
                tour?.open[0] ??
                (roll && !coach.clear ? '[data-roll-panel]' : undefined)
              }
              avoid={[...(tour?.open ?? []), ...COACH_AVOID]}
              shy={COACH_SHY.filter((sel) => sel !== tour?.ring && !tour?.open.includes(sel))}
              region="[data-coach-region]"
              pinned={guided}
              onHide={() => {
                if (!guided) return setCoachHidden(true);
                skipGuide();
              }}
            />
          )}
        </Presence>
      </div>

      <section
        ref={dialogueEl}
        className={th.dialogue}
        data-ink="night"
        data-tour="dialogue"
        data-log={logOpen || undefined}
      >
        <DialogueGrip open={logOpen} onOpenChange={setLogOpen} />
        <div className={th.say}>
          <span className={th.speaker}>{lastSpeaker}</span>
          <div className={th.text}>
            <StoryLog lines={lines} variant="book" />
          </div>
          <div className={th.sys}>
            <button type="button" onClick={() => setLogOpen((o) => !o)}>
              {logOpen ? '이야기 접기' : '지난 이야기'}
            </button>
            <button type="button" onClick={() => setTableOpen(true)}>
              탁자 보기 Tab
            </button>
            {error && <span className={th.error}>{error}</span>}
          </div>
          {storyWaiting && head?.kind === 'line' && (
            <button type="button" className={styles.beatNext} data-beat-next="" onClick={advance}>
              다음 <span aria-hidden>▸</span>
              <kbd>Enter</kbd>
            </button>
          )}
        </div>
        <div className={th.menu}>
          <ActionMenu
            character={me}
            action={action}
            approach={approach}
            disabled={
              (busy && !defending) ||
              lesson === 'story' ||
              beats.length > 0 ||
              milestoneOpen ||
              !!compel ||
              !!prompt ||
              me.takenOut === true ||
              boss.takenOut === true
            }
            canDefend={defending}
            {...(coach?.focus && showCoach && !guided ? { focus: coach.focus } : {})}
            {...(guided && tour?.guide ? { guide: tour.guide } : {})}
            onAction={(a) => {
              setAction(a);
              setApproach(null);
            }}
            onApproach={setApproach}
            onRoll={onRoll}
          />
        </div>
      </section>

      <Presence show={!!compel}>
        {compel && (
          <div className={styles.overlay} data-overlay="">
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
          <div className={styles.overlay} data-overlay="">
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
                      방금 만든 유리한 상황이 장면의 새 {term('aspect')}이 된다. 이야기에서
                      &quot;사실&quot;이 되는 것.
                    </li>
                    <li>
                      카드에 핀 {prompt.freeInvokes}개가 꽂힌다. 핀 하나로 {term('fatePoint')} 없이
                      한 번 {term('invoke')}할 수 있다.
                    </li>
                    <li>
                      핀을 다 써도 {term('aspect')}은 남는다. 그다음부턴{' '}
                      {josa(term('fatePoint'), '을/를')} 내고 쓴다.
                    </li>
                  </>
                ) : (
                  <>
                    <li>
                      {term('boost')}는 굴림 덕분에 잠깐 생긴 작은 기회. 오래가는 {term('aspect')}이
                      아니다.
                    </li>
                    <li>
                      {term('fatePoint')} 없이 딱 한 번 +2를 받을 수 있다. 쓰면 바로 사라진다.
                    </li>
                    <li>장면이 바뀌면 없어지므로 바로 다음 굴림에 쓰는 편이 좋다.</li>
                  </>
                )}
              </ul>
              <p className={styles.promptHelp}>
                {prompt.kind === 'aspect'
                  ? '장면에 새로 생긴 사실을 짧은 문구로. 예: "연기에 가려진 뒷문"'
                  : '그 순간의 기회를 짧게. 예: "흔들리는 발판", "연기 사이로 난 틈"'}
              </p>
              <input
                autoFocus
                aria-label={
                  prompt.kind === 'aspect' ? `새 ${term('aspect')} 이름` : `${term('boost')} 이름`
                }
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                maxLength={40}
                placeholder={
                  prompt.kind === 'aspect' ? '예: 연기에 가려진 뒷문' : '예: 흔들리는 발판'
                }
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

      <Presence show={milestoneOpen}>
        {milestoneOpen && (
          <div className={styles.overlay} data-overlay="">
            <MilestonePicker
              character={me}
              aspects={Object.values(state.aspects).filter(
                (a) => a.ownerType === 'character' && a.ownerId === meId,
              )}
              ideas={STUNT_IDEAS[pick.key] ?? []}
              onDone={onMilestone}
            />
          </div>
        )}
      </Presence>

      <TableView
        open={tableOpen}
        onClose={() => setTableOpen(false)}
        scene={{
          name: state.scene?.name ?? '',
          image: sceneArt,
          note:
            roll && !final ? `${activeChar?.name ?? ''}의 ${term(roll.action)} 판정 중` : undefined,
        }}
        sceneAspects={sceneAspects.filter((a) => a.ownerType !== 'character')}
        foes={[
          {
            character: boss,
            image: asset(SCENE.bossImage),
            aspects: Object.values(state.aspects).filter(
              (a) => !a.hidden && a.ownerType === 'character' && a.ownerId === bossId,
            ),
          },
        ]}
        seats={[
          {
            character: me,
            image: asset(pick.image),
            player: '나',
            me: true,
            aspects: Object.values(state.aspects).filter(
              (a) =>
                !a.hidden &&
                a.ownerType === 'character' &&
                a.ownerId === meId &&
                (a.kind === 'consequence' || a.kind === 'boost'),
            ),
          },
          ...companions.map((c) => ({
            character: c.character,
            image: c.image,
            aspects: Object.values(state.aspects).filter(
              (a) =>
                !a.hidden &&
                a.ownerType === 'character' &&
                a.ownerId === c.character.id &&
                (a.kind === 'consequence' || a.kind === 'boost'),
            ),
          })),
        ]}
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
      {guided && tour && <Spotlight open={[...tour.open, '[data-coach]']} ring={tour.ring} />}
    </main>
  );
}
