'use client';

import { term } from '@fate/glossary';
import {
  type Outcome,
  absorbOptions,
  canInvoke,
  CommandError,
  formatRating,
  outcomeFor,
  previewInvokes,
  resolveRoll,
  stuntBonuses,
  sumDice,
  type Action,
  type Actor,
  type Approach,
  type Aspect,
  type Command,
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
import { PartyRail } from '@/components/party/PartyRail';
import { ActionBar, type CoachFocus } from '@/components/roll/ActionBar';
import { DICE_MODES, DiceTray, saveDiceMode, type DiceMode } from '@/components/roll/DiceTray';
import { InvokeTray, type InvokeChoice } from '@/components/roll/InvokeTray';
import { OutcomeBanner } from '@/components/roll/OutcomeBanner';
import { CoachMark, type Coach } from '@/components/tutorial/CoachMark';
import { BOSS, SAMPLE_CHARACTERS, SCENE, type SampleCharacter } from '@/content/oneshot';
import { playSfx, setSfxEnabled, sfxEnabled, sfxForEvent, sfxForOutcome } from '@/fx/sfx';
import { asset } from '@/lib/asset';
import { Presence, reducedMotion, revealOnNarrow } from '@/lib/motion';
import { Typewriter } from '@/components/ui/Typewriter';
import { describe, ERROR_COPY } from '@/lib/copy';
import { josa } from '@/lib/josa';
import { LocalRoom } from '@/state/localRoom';
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
    if (reducedMotion()) return onPick(s);
    setChosen(s.key);
    playSfx('token-flip', 0.35);
    window.setTimeout(() => onPick(s), 560);
  };
  return (
    <main className={styles.picker} data-chosen={chosen ? '' : undefined}>
      <h1 className={styles.pickTitle}>누구로 플레이할까요?</h1>
      <p className={styles.pickLead}>
        샘플 캐릭터를 골라 5분 안에 첫 굴림까지 가 봐요. 규칙은 몰라도 괜찮아요.
      </p>
      <div className={styles.pickGrid}>
        {SAMPLE_CHARACTERS.map((s) => (
          <button
            key={s.key}
            type="button"
            className={styles.pickCard}
            data-chosen={chosen === s.key || undefined}
            onClick={() => choose(s)}
          >
            <img src={asset(s.image)} alt="" className={styles.pickImg} />
            <span className={styles.pickName}>{s.name}</span>
            <span className={styles.pickHigh}>{s.create.highConcept}</span>
            <span className={styles.pickBlurb}>{s.blurb}</span>
          </button>
        ))}
      </div>
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
    if (!action || !approach || busy) return;
    setSettled(false);
    setSelectedAspect(null);
    const isAttack = action === 'attack';
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
  }, [action, approach, busy, run, meId, bossId]);

  const myStunts = roll && !final ? stuntBonuses(me, roll.action, roll.active.approach) : [];
  const unusedStunt = myStunts.find(
    (s) => !roll?.active.modifiers.some((m) => m.source === `stunt:${s.id}`),
  );

  const choices: InvokeChoice[] = useMemo(() => {
    if (!roll || roll.status !== 'open') return [];
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
    run(ME, {
      type: 'invoke.apply',
      payload: { rollId: roll.id, side: 'active', aspectId, mode, paidWith },
    });
    setSelectedAspect(null);
  };

  const handleRewards = useCallback(
    (rewards: Reward[], target: string | null) => {
      for (const r of rewards) {
        if (r.type === 'new_aspect') setPrompt({ kind: 'aspect', freeInvokes: r.freeInvokes });
        if (r.type === 'boost' && r.to === 'self') setPrompt({ kind: 'boost' });
      }
      const pending = Object.values(room.getSnapshot().state.pendingDamage).find(
        (d) => d.targetId === target,
      );
      if (pending) {
        // GM(자동): 가장 덜 아픈 조합으로 받아내고, 못 받으면 탈락
        const bossNow = room.getSnapshot().state.characters[pending.targetId]!;
        const plan = absorbOptions(pending.shifts, bossNow)[0];
        const NAMES = {
          mild: '그을린 소매',
          moderate: '깊게 베인 어깨',
          severe: '부러진 도끼 자루',
        } as const;
        window.setTimeout(() => {
          run(
            GM,
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
      }
    },
    [room, run],
  );

  const onFinalize = () => {
    if (!roll) return;
    const evs = run(ME, {
      type: 'roll.finalize',
      payload: { rollId: roll.id, reduceForBoost: false },
    });
    const fin = evs.find((e) => e.type === 'roll.finalized');
    if (fin && fin.type === 'roll.finalized') handleRewards(fin.payload.rewards, roll.targetId);
    setAction(null);
    setApproach(null);
  };

  // 체험 시나리오 트리거: 첫 굴림이 확정되면 GM이 약점에 강요를 한 번 건다 (design-system.md 14절 6단계)
  useEffect(() => {
    if (compelled.current || !final) return;
    compelled.current = true;
    const trouble = Object.values(state.aspects).find(
      (a) => a.ownerId === meId && a.kind === 'trouble',
    );
    if (!trouble) return;
    const t = window.setTimeout(
      () =>
        run(GM, {
          type: 'compel.offer',
          payload: { aspectId: trouble.id, targetId: meId, text: COMPEL_TEXT[pick.key]! },
        }),
      1800,
    );
    return () => window.clearTimeout(t);
  }, [final, state.aspects, meId, pick.key, run]);

  const compel = Object.values(state.compels).find((c) => c.targetId === meId);

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
  const narration = [...events].reverse().find((e) => e.type === 'narration.posted');

  const myOutcomeNow =
    roll?.status === 'open' && roll.active.dice ? outcomeFor(roll, 'active') : null;
  const coach = useMemo((): (Coach & { focus?: CoachFocus }) | undefined => {
    if (compel || prompt) return undefined;
    const total = 4;
    if (boss.takenOut)
      return {
        step: total,
        total,
        clear: true,
        title: `${josa(boss.name, '을/를')} 쓰러뜨렸어요!`,
        body: `행동을 고르고, 굴리고, ${term('aspect')}을 ${term('invoke')}해 판을 뒤집는 법을 다 익혔어요. 이제 내 캐릭터로 이어 가 볼까요?`,
        links: [
          { href: '/create/', label: '캐릭터 만들기' },
          { href: '/rooms/new/', label: '친구들과 방 만들기' },
        ],
      };
    if (!action)
      return {
        step: 1,
        total,
        focus: 'action',
        title: '먼저 무엇을 할지 골라요',
        body: `아래 행동 버튼 중 하나를 눌러요. 처음이라면 "${term('overcome')}"으로 불길을 뚫어 봐요.`,
        keys: ['1', '2', '3', '4'],
      };
    if (!approach)
      return {
        step: 2,
        total,
        focus: 'approach',
        title: `어떻게 할지 ${term('approach')}을 골라요`,
        body: '숫자가 높을수록 그 방식에 능숙해요. 캐릭터에게 어울리는 방식을 골라 보세요.',
        keys: ['Q', 'W', 'E', 'A', 'S', 'D'],
      };
    if (!roll || final)
      return {
        step: 3,
        total,
        focus: 'roll',
        title: '주사위를 굴려 볼까요?',
        body: `${term('fateDice')} 4개의 합에 ${term('approach')} 수치를 더해 결과가 정해져요.`,
        keys: ['Space'],
      };
    if (settled && (myOutcomeNow === 'fail' || myOutcomeNow === 'tie'))
      return {
        step: 4,
        total,
        title: `${term('aspect')}을 ${term('invoke')}해서 뒤집어요`,
        body: `빛나는 ${term('aspect')} 카드를 누르면 +2를 받아요. ${term('fatePoint')} 1개가 들어요.`,
      };
    return undefined;
  }, [action, approach, roll, final, compel, prompt, settled, myOutcomeNow, boss]);
  const [coachHidden, setCoachHidden] = useState(false);
  // 안내를 숨겼더라도 다 끝낸 순간의 축하 카드는 한 번 다시 보여 준다
  const [clearShown, setClearShown] = useState(false);
  if (coach?.clear && !clearShown) {
    setClearShown(true);
    setCoachHidden(false);
  }

  const result =
    roll && roll.active.dice && (roll.defense?.dice ?? roll.targetId === null)
      ? resolveRoll(roll)
      : null;
  const myOutcome = roll && result ? outcomeFor(roll, 'active') : null;
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

  return (
    <main
      className={styles.stage}
      style={{
        backgroundImage: `linear-gradient(180deg, rgb(12 14 26 / .25), rgb(12 14 26 / .85)), url(${asset(SCENE.background)})`,
      }}
    >
      <header className={styles.top}>
        <div>
          <div className={styles.kicker}>TUTORIAL · 첫 장면</div>
          <h1 className={styles.sceneName}>{state.scene?.name}</h1>
        </div>
        <div className={styles.topRight}>
          <label className={styles.mode}>
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
            className={styles.restart}
            aria-pressed={sfxOn}
            onClick={() => {
              setSfxEnabled(!sfxOn);
              setSfxOn(!sfxOn);
            }}
          >
            효과음 {sfxOn ? '켜짐' : '꺼짐'}
          </button>
          <button type="button" className={styles.restart} onClick={onRestart}>
            처음부터
          </button>
        </div>
      </header>

      <div className={styles.body}>
        <div className={styles.left}>
          <PartyRail
            members={[
              ...SAMPLE_CHARACTERS.map((s) => {
                const c = state.characters[findId(state, s.name)]!;
                return {
                  character: c,
                  image: asset(s.image),
                  active: c.id === meId,
                  ...(c.id === meId ? {} : { status: '동료' }),
                };
              }),
              { character: boss, image: asset(SCENE.bossImage), status: 'NPC' },
            ]}
          />
        </div>

        <div className={styles.center}>
          <Presence show={!!(coach && !coachHidden)}>
            {coach && !coachHidden && (
              <CoachMark
                key={coach.clear ? 'clear' : coach.step}
                coach={coach}
                onHide={() => setCoachHidden(true)}
              />
            )}
          </Presence>
          <img className={styles.standee} src={asset(pick.image)} alt={pick.name} />
          {showBoss && (
            <img
              className={styles.bossStandee}
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

          {roll && (
            <div className={styles.rollPanel} ref={revealOnNarrow} data-roll-panel>
              <div className={styles.sides}>
                <div className={styles.side} data-fx="roll-dice">
                  <div className={styles.sideHead}>
                    {me.name} · {term(roll.action)} · {term(roll.active.approach)}{' '}
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
                    <div className={styles.waiting}>굴림 완료 · 상대 응답 대기 중</div>
                  )}
                </div>
                {roll.targetId ? (
                  <>
                    <div className={styles.vs}>VS</div>
                    <div className={styles.side}>
                      <div className={styles.sideHead}>
                        {boss.name} · {term('defend')}
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
                  action={roll.action}
                  outcome={final ? roll.result!.outcome : myOutcome}
                  total={result.total}
                  provisional={!final}
                />
              )}

              {settled && roll.status === 'open' && (
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
                  <InvokeTray
                    choices={choices}
                    fatePoints={me.fatePoints}
                    selectedId={selectedAspect}
                    onSelect={setSelectedAspect}
                    onInvoke={onInvoke}
                    onFinalize={onFinalize}
                  />
                </>
              )}
            </div>
          )}

          <Presence show={!!compel}>
            {compel && (
              <div className={styles.overlay}>
                <CompelOffer
                  aspect={state.aspects[compel.aspectId]!}
                  text={compel.text}
                  targetId={meId}
                  fatePoints={me.fatePoints}
                  onAccept={() =>
                    run(ME, {
                      type: 'compel.respond',
                      payload: { compelId: compel.id, accept: true },
                    })
                  }
                  onRefuse={() =>
                    run(ME, {
                      type: 'compel.respond',
                      payload: { compelId: compel.id, accept: false },
                    })
                  }
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
                  <p className={styles.promptHelp}>
                    {prompt.kind === 'aspect'
                      ? '장면에 새로 생긴 사실을 짧은 문구로 적어요. 예: "연기에 가려진 뒷문"'
                      : '한 번 쓰고 사라지는 순간의 기회예요. 예: "흔들리는 발판"'}
                  </p>
                  <input
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    maxLength={40}
                    className={styles.promptInput}
                  />
                  <div className={styles.promptButtons}>
                    <button
                      type="button"
                      onClick={() => setPrompt(null)}
                      className={styles.restart}
                    >
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
        </div>

        <div className={styles.right}>
          <div className={styles.aspectsHead}>ASPECTS ON STAGE</div>
          <div className={styles.aspects}>
            {sceneAspects.map((a: Aspect) => (
              <AspectCard
                key={a.id}
                aspect={a}
                {...(a.ownerType === 'character'
                  ? { owner: state.characters[a.ownerId]?.name ?? '' }
                  : {})}
              />
            ))}
          </div>
          <StoryLog lines={lines} />
        </div>
      </div>

      <footer className={styles.bottom}>
        <div className={styles.dialogue}>
          <div className={styles.speaker}>G M</div>
          <p className={styles.say}>
            <Typewriter
              text={
                narration && narration.type === 'narration.posted' ? narration.payload.text : ''
              }
            />
          </p>
          {error && <p className={styles.error}>{error}</p>}
        </div>
        <ActionBar
          character={me}
          action={action}
          approach={approach}
          disabled={busy || !!compel || !!prompt || me.takenOut === true}
          {...(coach?.focus && !coachHidden ? { focus: coach.focus } : {})}
          onAction={setAction}
          onApproach={setApproach}
          onRoll={onRoll}
        />
      </footer>
    </main>
  );
}
