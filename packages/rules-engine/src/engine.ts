import { refreshFor, validateCharacter } from './character';
import type { Command, CommandOf, CommandType } from './commands';
import { turnOrder, CONTEST_VICTORIES_TO_WIN } from './conflict';
import { absorbOptions, concedeReward, isValidAbsorb } from './damage';
import { rollFateDice } from './dice';
import type { EventPayloads, EventType, NewEvent, RoomEvent, SealedSide } from './events';
import { undoneSeqs } from './reducer';
import { canInvoke } from './invoke';
import { resolveRoll, rewardsFor } from './resolve';
import { APPROACHES } from './types';
import type {
  Actor,
  Approach,
  Aspect,
  Character,
  Rng,
  RollState,
  RoomState,
  Visibility,
} from './types';

export type CommandErrorCode =
  | 'FORBIDDEN_ROLE'
  | 'NOT_FOUND'
  | 'INVALID'
  | 'INVALID_CHARACTER'
  | 'DUPLICATE_CHARACTER'
  | 'NOT_ENOUGH_FATE_POINTS'
  | 'ASPECT_ALREADY_INVOKED'
  | 'NO_FREE_INVOKES'
  | 'ROLL_NOT_OPEN'
  | 'AWAITING_DEFENSE'
  | 'NO_ACTIVE_SESSION'
  | 'NO_ACTIVE_SCENE';

export class CommandError extends Error {
  constructor(
    public readonly code: CommandErrorCode,
    message: string = code,
  ) {
    super(message);
  }
}

export interface ResolveContext {
  rng: Rng;
  newId: () => string;
  /** 3D 주사위 궤적용 시드 (uint32) */
  animSeed: () => number;
  /** 서버가 봉인해 둔 공격자 굴림 조회 (sealed_rolls) */
  sealed?: (rollId: string) => SealedSide | undefined;
  /** 되돌리기 검증용: 지금까지의 이벤트 */
  history?: readonly RoomEvent[];
  /** 되돌리기: 이 seq를 만든 명령의 이벤트 범위 [first, last] (command_log) */
  groupOf?: (seq: number) => readonly [number, number] | undefined;
}

/**
 * 이정표 성장: 소(minor)는 접근법 값 맞바꾸기만, 중·대는 하나를 +1까지 올릴 수 있다 (최대 +5).
 */
function isGrowth(
  c: Character,
  next: Record<Approach, number>,
  size: 'minor' | 'significant' | 'major',
): boolean {
  const before = APPROACHES.map((k) => c.approaches[k]).sort((x, y) => x - y);
  const after = APPROACHES.map((k) => next[k]).sort((x, y) => x - y);
  if (after.some((v) => v > 5 || v < 0)) return false;
  const diff = after.reduce((t, v) => t + v, 0) - before.reduce((t, v) => t + v, 0);
  if (diff === 0) return after.every((v, i) => v === before[i]);
  if (diff !== 1 || size === 'minor') return false;
  // 정확히 한 값만 1 올랐는지
  return before.some((_, i) => {
    const raised = before.map((v, j) => (j === i ? v + 1 : v)).sort((x, y) => x - y);
    return raised.every((v, j) => v === after[j]);
  });
}

/** 되돌릴 수 없는 이벤트: 입장 기록 */
const NOT_UNDOABLE: ReadonlySet<EventType> = new Set<EventType>(['room.member_joined']);

export interface ResolveResult {
  events: NewEvent[];
  /** 반대 굴림 요청 시 서버가 sealed_rolls에 봉인할 공격자 굴림 */
  seal?: { rollId: string; side: SealedSide };
}

const GM_ONLY: ReadonlySet<CommandType> = new Set<CommandType>([
  'session.start',
  'session.end',
  'scene.start',
  'scene.end',
  'milestone.grant',
  'aspect.reveal',
  'fate.adjust',
  'compel.offer',
  'compel.withdraw',
  'conflict.start',
  'conflict.end',
  'consequence.clear',
  'contest.start',
  'contest.exchange',
  'contest.end',
  'challenge.start',
  'challenge.step',
  'challenge.end',
  'zone.add',
  'zone.link',
  'zone.unlink',
  'zone.update',
  'zone.remove',
  'gm.note',
  'narration.post',
  'sfx.play',
  'event.undo',
]);

function ev<K extends EventType>(
  type: K,
  actor: Actor,
  payload: EventPayloads[K],
  visibility: Visibility = 'public',
  ownerId?: string,
): NewEvent<K> {
  return {
    type,
    actorId: actor.userId,
    payload,
    visibility,
    ...(ownerId ? { ownerId } : {}),
  } as NewEvent<K>;
}

function need<T>(value: T | undefined | null, what = 'target'): T {
  if (value === undefined || value === null)
    throw new CommandError('NOT_FOUND', `${what} not found`);
  return value;
}

function canControl(state: RoomState, actor: Actor, c: Character): boolean {
  if (actor.role === 'gm') return true;
  return actor.role === 'player' && !c.isNpc && c.ownerId === actor.userId;
}

function controlled(state: RoomState, actor: Actor, characterId: string): Character {
  const c = need(state.characters[characterId], 'character');
  if (!canControl(state, actor, c)) throw new CommandError('FORBIDDEN_ROLE');
  return c;
}

function openRoll(state: RoomState, rollId: string): RollState {
  const r = need(state.rolls[rollId], 'roll');
  if (r.status !== 'open') throw new CommandError('ROLL_NOT_OPEN');
  return r;
}

/** 방어 측 조정(발동·특기·완료)은 방어자가 마쳤다고 하기 전까지만 받는다 */
function defenseStillAdjusting(r: RollState): void {
  if (!r.defense) throw new CommandError('INVALID', 'no defense side');
  if (r.defenseReady) throw new CommandError('INVALID', 'defense already done');
}

function fatePointsOf(state: RoomState, c: Character): number {
  return c.isNpc ? state.gmPool : c.fatePoints;
}

function aspectEvent(actor: Actor, aspect: Aspect): NewEvent {
  return ev('aspect.added', actor, { aspect }, aspect.hidden ? 'gm' : 'public');
}

type Resolver<T extends CommandType> = (
  s: RoomState,
  p: CommandOf<T>['payload'],
  a: Actor,
  ctx: ResolveContext,
) => ResolveResult;
type Resolvers = { [T in CommandType]: Resolver<T> };

const one = (...events: NewEvent[]): ResolveResult => ({ events });

const resolvers: Resolvers = {
  'session.start': (s, p, a, ctx) => {
    if (s.session) throw new CommandError('INVALID', 'session already running');
    return one(
      ev('session.started', a, {
        sessionId: ctx.newId(),
        number: s.sessionsPlayed + 1,
        ...(p.title ? { title: p.title } : {}),
      }),
    );
  },
  'session.end': (s, p, a) => {
    const session = need(s.session, 'session');
    const events: NewEvent[] = [];
    if (s.scene) events.push(ev('scene.ended', a, { sceneId: s.scene.id }));
    events.push(
      ev('session.ended', a, {
        sessionId: session.id,
        ...(p.summary ? { summary: p.summary } : {}),
      }),
    );
    return { events };
  },
  'scene.start': (s, p, a, ctx) => {
    const events: NewEvent[] = [];
    if (s.scene) events.push(ev('scene.ended', a, { sceneId: s.scene.id }));
    const sceneId = ctx.newId();
    const pcIds =
      p.pcIds ??
      Object.values(s.characters)
        .filter((c) => !c.isNpc)
        .map((c) => c.id);
    for (const id of pcIds) need(s.characters[id], 'character');
    const zones = (p.zones ?? []).map((z) => ({
      id: ctx.newId(),
      name: z.name,
      x: z.x,
      y: z.y,
      links: [],
    }));
    events.push(ev('scene.started', a, { sceneId, name: p.name, pcIds, zones }));
    for (const asp of p.aspects ?? []) {
      events.push(
        aspectEvent(a, {
          id: ctx.newId(),
          ownerType: 'scene',
          ownerId: sceneId,
          kind: 'situation',
          text: asp.text,
          freeInvokes: 0,
          hidden: asp.hidden,
        }),
      );
    }
    return { events };
  },
  'scene.end': (s, _p, a) => one(ev('scene.ended', a, { sceneId: need(s.scene, 'scene').id })),

  'character.create': (s, p, a, ctx) => {
    if (a.role === 'spectator') throw new CommandError('FORBIDDEN_ROLE');
    if (a.role === 'player' && p.isNpc) throw new CommandError('FORBIDDEN_ROLE');
    const ownerId = p.isNpc ? null : a.role === 'gm' ? (p.ownerId ?? a.userId) : a.userId;
    // 버튼을 연타해도 같은 초안은 한 번만 데려온다 (서버는 명령을 차례로 처리하므로 여기서 막힌다)
    if (p.sourceKey && Object.values(s.characters).some((c) => c.sourceKey === p.sourceKey))
      throw new CommandError('DUPLICATE_CHARACTER');
    const id = ctx.newId();
    const refresh = refreshFor(p.stunts.length);
    const character: Character = {
      id,
      name: p.name,
      isNpc: p.isNpc,
      ownerId,
      approaches: p.approaches,
      stunts: p.stunts,
      refresh,
      fatePoints: p.isNpc ? 0 : refresh,
      stress: [false, false, false],
      consequences: {},
      ...(p.portraitUrl ? { portraitUrl: p.portraitUrl } : {}),
      ...(p.sourceKey ? { sourceKey: p.sourceKey } : {}),
    };
    const mk = (kind: Aspect['kind'], text: string): Aspect => ({
      id: ctx.newId(),
      ownerType: 'character',
      ownerId: id,
      kind,
      text,
      freeInvokes: 0,
      hidden: false,
    });
    const aspects = [
      mk('high', p.highConcept),
      ...(p.trouble ? [mk('trouble', p.trouble)] : []),
      ...p.aspects.map((t) => mk('normal', t)),
    ];
    const check = validateCharacter(character, aspects);
    if (!check.ok) throw new CommandError('INVALID_CHARACTER', check.issues.join(','));
    return one(ev('character.created', a, { character }), ...aspects.map((x) => aspectEvent(a, x)));
  },
  'character.update': (s, p, a) => {
    const c = controlled(s, a, p.id);
    // 플레이어는 이정표를 받았을 때만 성장한다 (GM은 언제든 고칠 수 있다)
    const growth = a.role !== 'gm' && !c.isNpc;
    if (growth) {
      if (!c.milestone) throw new CommandError('FORBIDDEN_ROLE', 'needs a milestone');
      if (p.patch.approaches && !isGrowth(c, p.patch.approaches, c.milestone))
        throw new CommandError('INVALID_CHARACTER', 'APPROACH_SPREAD');
      if (p.patch.stunts && c.milestone === 'minor' && p.patch.stunts.length > c.stunts.length)
        throw new CommandError('INVALID_CHARACTER', 'TOO_MANY_STUNTS');
    }
    const patch = {
      ...p.patch,
      ...(p.patch.stunts ? { refresh: refreshFor(p.patch.stunts.length) } : {}),
    };
    return one(
      ev('character.updated', a, { id: c.id, patch, ...(growth ? { milestoneUsed: true } : {}) }),
    );
  },
  'milestone.grant': (s, p, a) => {
    for (const id of p.characterIds) need(s.characters[id], 'character');
    return one(ev('milestone.granted', a, p));
  },

  'aspect.add': (s, p, a, ctx) => {
    if (a.role === 'spectator') throw new CommandError('FORBIDDEN_ROLE');
    if (p.hidden && a.role !== 'gm') throw new CommandError('FORBIDDEN_ROLE');
    if (p.ownerType === 'character') controlled(s, a, p.ownerId);
    if (p.ownerType === 'scene' && s.scene?.id !== p.ownerId)
      throw new CommandError('NO_ACTIVE_SCENE');
    if (p.ownerType === 'zone' && !s.scene?.zones[p.ownerId])
      throw new CommandError('NOT_FOUND', 'zone not found');
    const freeInvokes = p.kind === 'boost' ? 1 : p.freeInvokes;
    return one(
      aspectEvent(a, {
        id: ctx.newId(),
        ownerType: p.ownerType,
        ownerId: p.ownerId,
        kind: p.kind,
        text: p.text,
        freeInvokes,
        hidden: p.hidden,
      }),
    );
  },
  'aspect.reveal': (s, p, a) => {
    const asp = need(s.aspects[p.aspectId], 'aspect');
    if (!asp.hidden) throw new CommandError('INVALID', 'aspect is not hidden');
    return one(ev('aspect.revealed', a, { aspect: { ...asp, hidden: false } }));
  },
  'aspect.update': (s, p, a) => {
    const asp = need(s.aspects[p.aspectId], 'aspect');
    if (a.role !== 'gm') {
      if (asp.ownerType !== 'character') throw new CommandError('FORBIDDEN_ROLE');
      controlled(s, a, asp.ownerId);
    }
    return one(
      ev('aspect.updated', a, { aspectId: asp.id, text: p.text }, asp.hidden ? 'gm' : 'public'),
    );
  },
  'aspect.remove': (s, p, a) => {
    const asp = need(s.aspects[p.aspectId], 'aspect');
    if (a.role !== 'gm') {
      if (asp.ownerType !== 'character' || asp.kind === 'consequence')
        throw new CommandError('FORBIDDEN_ROLE');
      controlled(s, a, asp.ownerId);
    }
    return one(ev('aspect.removed', a, { aspectId: asp.id }, asp.hidden ? 'gm' : 'public'));
  },

  'roll.request': (s, p, a, ctx) => {
    const c = controlled(s, a, p.characterId);
    if (c.takenOut) throw new CommandError('INVALID', 'character is out of the scene');
    if (p.action === 'defend')
      throw new CommandError('INVALID', 'defend is rolled with roll.defend');
    const rollId = ctx.newId();
    const side: SealedSide = {
      characterId: c.id,
      approach: p.approach,
      rating: c.approaches[p.approach],
      dice: rollFateDice(ctx.rng),
      animSeed: ctx.animSeed(),
      modifiers: [],
    };
    if (p.targetId) {
      const target = need(s.characters[p.targetId], 'target');
      if (target.id === c.id) throw new CommandError('INVALID', 'cannot target self');
      return {
        events: [
          ev('roll.opposition_requested', a, {
            rollId,
            action: p.action,
            attackerId: c.id,
            approach: p.approach,
            defenderId: target.id,
          }),
        ],
        seal: { rollId, side },
      };
    }
    return one(
      ev('roll.resolved', a, {
        rollId,
        action: p.action,
        side,
        difficulty: p.difficulty ?? 0,
        targetId: null,
      }),
    );
  },
  'roll.defend': (s, p, a, ctx) => {
    const r = need(s.rolls[p.rollId], 'roll');
    if (r.status !== 'awaiting_defense' || !r.targetId) throw new CommandError('ROLL_NOT_OPEN');
    const defender = controlled(s, a, r.targetId);
    const attacker = need(ctx.sealed?.(r.id), 'sealed roll');
    const defense: SealedSide = {
      characterId: defender.id,
      approach: p.approach,
      rating: defender.approaches[p.approach],
      dice: rollFateDice(ctx.rng),
      animSeed: ctx.animSeed(),
      modifiers: [],
    };
    return one(ev('roll.opposition_revealed', a, { rollId: r.id, attacker, defender: defense }));
  },
  'invoke.apply': (s, p, a, ctx) => {
    const r = openRoll(s, p.rollId);
    if (p.side === 'defense') defenseStillAdjusting(r);
    const sideState = p.side === 'active' ? r.active : r.defense;
    const payer = controlled(s, a, need(sideState, 'side').characterId);
    const asp = need(s.aspects[p.aspectId], 'aspect');
    const check = canInvoke(
      r,
      asp,
      { characterId: payer.id, fatePoints: fatePointsOf(s, payer) },
      p.side,
      p.paidWith,
    );
    if (!check.ok) throw new CommandError(check.code === 'HIDDEN' ? 'NOT_FOUND' : check.code);
    const reroll =
      p.mode === 'reroll' ? { newDice: rollFateDice(ctx.rng), newAnimSeed: ctx.animSeed() } : {};
    const events: NewEvent[] = [
      ev('invoke.applied', a, {
        rollId: r.id,
        side: p.side,
        aspectId: asp.id,
        mode: p.mode,
        paidWith: p.paidWith,
        payerId: payer.id,
        ...reroll,
      }),
    ];
    // 상대 캐릭터의 특성을 그 상대에게 불리하게 발동하면 상대가 운명점 1을 받는다 (툴은 즉시 지급)
    const opponentId =
      p.side === 'active' ? (r.defense?.characterId ?? r.targetId) : r.active.characterId;
    if (
      p.paidWith === 'fate_point' &&
      asp.ownerType === 'character' &&
      asp.ownerId === opponentId
    ) {
      events.push(
        ev('fate.adjusted', a, { target: asp.ownerId, delta: 1, reason: 'invoke_against' }),
      );
    }
    return { events };
  },
  'stunt.apply': (s, p, a) => {
    const r = openRoll(s, p.rollId);
    if (p.side === 'defense') defenseStillAdjusting(r);
    const sideState = need(p.side === 'active' ? r.active : r.defense, 'side');
    const c = controlled(s, a, sideState.characterId);
    const stunt = need(
      c.stunts.find((x) => x.id === p.stuntId),
      'stunt',
    );
    if (sideState.modifiers.some((m) => m.source === `stunt:${stunt.id}`))
      throw new CommandError('INVALID', 'stunt already applied');
    const action = p.side === 'active' ? r.action : 'defend';
    if (
      stunt.kind === 'bonus' &&
      (stunt.bonus?.action !== action || stunt.bonus.approach !== sideState.approach)
    ) {
      throw new CommandError('INVALID', 'stunt does not apply to this roll');
    }
    if (stunt.kind === 'once_per_session' && stunt.usedThisSession)
      throw new CommandError('INVALID', 'stunt already used this session');
    return one(
      ev('stunt.applied', a, {
        rollId: r.id,
        side: p.side,
        stuntId: stunt.id,
        value: stunt.bonus?.value ?? 0,
      }),
    );
  },
  'roll.defense_ready': (s, p, a) => {
    const r = openRoll(s, p.rollId);
    defenseStillAdjusting(r);
    controlled(s, a, need(r.defense, 'side').characterId);
    return one(ev('roll.defense_ready', a, { rollId: r.id }));
  },
  'roll.finalize': (s, p, a) => {
    const r = openRoll(s, p.rollId);
    controlled(s, a, r.active.characterId);
    // 반대 굴림은 방어자도 조정을 마쳐야 확정한다. 방어자도 내 쪽(GM이면 NPC)일 때만 기다리지 않는다
    const defender = r.defense ? s.characters[r.defense.characterId] : undefined;
    const ownSide = defender && (a.role === 'gm' ? defender.isNpc : canControl(s, a, defender));
    if (defender && !r.defenseReady && !ownSide)
      throw new CommandError('AWAITING_DEFENSE', 'defense is still adjusting');
    const { total, shifts, outcome } = resolveRoll(r);
    const rewards = rewardsFor(r.action, outcome, shifts);
    const events: NewEvent[] = [
      ev('roll.finalized', a, { rollId: r.id, total, shifts, outcome, rewards }),
    ];
    if (r.action === 'attack' && r.targetId && (outcome === 'success' || outcome === 'style')) {
      const dealt = outcome === 'style' && p.reduceForBoost ? shifts - 1 : shifts;
      events.push(
        ev('damage.pending', a, {
          rollId: r.id,
          targetId: r.targetId,
          attackerId: r.active.characterId,
          shifts: dealt,
        }),
      );
    }
    return { events };
  },

  'fate.adjust': (s, p, a) => {
    if (p.target !== 'gm_pool') need(s.characters[p.target], 'character');
    return one(ev('fate.adjusted', a, { target: p.target, delta: p.delta, reason: 'manual' }));
  },
  'compel.offer': (s, p, a, ctx) => {
    need(s.aspects[p.aspectId], 'aspect');
    need(s.characters[p.targetId], 'character');
    return one(
      ev('compel.offered', a, {
        compelId: ctx.newId(),
        aspectId: p.aspectId,
        targetId: p.targetId,
        text: p.text,
      }),
    );
  },
  'compel.respond': (s, p, a) => {
    const compel = need(s.compels[p.compelId], 'compel');
    const target = controlled(s, a, compel.targetId);
    if (p.accept) return one(ev('compel.accepted', a, { compelId: compel.id }));
    if (fatePointsOf(s, target) < 1) throw new CommandError('NOT_ENOUGH_FATE_POINTS');
    return one(ev('compel.refused', a, { compelId: compel.id }));
  },
  'compel.withdraw': (s, p, a) =>
    one(ev('compel.withdrawn', a, { compelId: need(s.compels[p.compelId], 'compel').id })),

  'conflict.start': (s, p, a, ctx) => {
    if (s.conflict) throw new CommandError('INVALID', 'conflict already running');
    const ps = p.participantIds.map((id) => need(s.characters[id], 'character'));
    return one(
      ev('conflict.started', a, {
        conflictId: ctx.newId(),
        kind: p.kind,
        order: turnOrder(p.kind, ps),
      }),
    );
  },
  'conflict.next': (s, _p, a) => {
    const c = need(s.conflict, 'conflict');
    // GM 또는 지금 차례인 캐릭터를 움직이는 사람이 차례를 넘긴다
    const current = s.characters[c.order[c.index] ?? ''];
    if (a.role !== 'gm' && !(current && canControl(s, a, current)))
      throw new CommandError('FORBIDDEN_ROLE');
    const active = (id: string) => !s.characters[id]?.takenOut;
    if (!c.order.some(active)) throw new CommandError('INVALID', 'no one left');
    let index = c.index;
    let round = c.round;
    do {
      index += 1;
      if (index >= c.order.length) {
        index = 0;
        round += 1;
      }
    } while (!active(c.order[index]!));
    return one(ev('conflict.turn_advanced', a, { conflictId: c.id, index, round }));
  },
  'conflict.end': (s, _p, a) =>
    one(ev('conflict.ended', a, { conflictId: need(s.conflict, 'conflict').id })),

  'damage.absorb': (s, p, a, ctx) => {
    const d = need(s.pendingDamage[p.rollId], 'damage');
    const target = controlled(s, a, d.targetId);
    if (p.takeOut)
      return one(
        ev('character.taken_out', a, {
          characterId: target.id,
          conflictId: s.conflict?.id ?? null,
        }),
      );
    const plan = { stressBox: p.stressBox, consequences: p.consequences.map((c) => c.slot) };
    if (!isValidAbsorb(d.shifts, target, plan))
      throw new CommandError('INVALID', 'plan does not absorb the damage');
    return one(
      ev('damage.absorbed', a, {
        rollId: d.rollId,
        targetId: target.id,
        stressBox: p.stressBox,
        consequences: p.consequences.map((c) => ({
          slot: c.slot,
          aspectId: ctx.newId(),
          text: c.text,
        })),
      }),
    );
  },
  'character.concede': (s, p, a) => {
    const c = controlled(s, a, p.characterId);
    if (c.takenOut) throw new CommandError('INVALID', 'already out');
    const taken = s.conflict?.consequencesTaken[c.id] ?? 0;
    return one(
      ev('character.conceded', a, {
        characterId: c.id,
        conflictId: s.conflict?.id ?? null,
        fpGained: concedeReward(taken),
      }),
    );
  },
  'consequence.startRecovery': (s, p, a) => {
    const c = controlled(s, a, p.characterId);
    const cur = need(c.consequences[p.slot], 'consequence');
    if (cur.recovering) throw new CommandError('INVALID', 'already recovering');
    return one(ev('consequence.recovery_started', a, p));
  },
  'consequence.clear': (s, p, a) => {
    need(need(s.characters[p.characterId], 'character').consequences[p.slot], 'consequence');
    return one(ev('consequence.cleared', a, p));
  },

  'contest.start': (s, p, a, ctx) => {
    for (const id of p.sides) need(s.characters[id], 'character');
    return one(ev('contest.started', a, { contestId: ctx.newId(), sides: p.sides }));
  },
  'contest.exchange': (s, p, a) => {
    const c = need(s.contest, 'contest');
    if (p.winnerId && !c.sides.includes(p.winnerId))
      throw new CommandError('INVALID', 'winner is not in the contest');
    const events: NewEvent[] = [
      ev('contest.exchange', a, { contestId: c.id, winnerId: p.winnerId, victories: p.victories }),
    ];
    if (p.winnerId && (c.victories[p.winnerId] ?? 0) + p.victories >= CONTEST_VICTORIES_TO_WIN) {
      events.push(ev('contest.ended', a, { contestId: c.id, winnerId: p.winnerId }));
    }
    return { events };
  },
  'contest.end': (s, _p, a) =>
    one(ev('contest.ended', a, { contestId: need(s.contest, 'contest').id, winnerId: null })),
  'challenge.start': (_s, p, a, ctx) =>
    one(ev('challenge.started', a, { challengeId: ctx.newId(), title: p.title, steps: p.steps })),
  'challenge.step': (s, p, a) => {
    const c = need(s.challenge, 'challenge');
    if (!c.steps[p.index]) throw new CommandError('NOT_FOUND', 'step not found');
    return one(ev('challenge.step', a, { challengeId: c.id, index: p.index, outcome: p.outcome }));
  },
  'challenge.end': (s, _p, a) =>
    one(ev('challenge.ended', a, { challengeId: need(s.challenge, 'challenge').id })),

  'zone.add': (s, p, a, ctx) => {
    need(s.scene, 'scene');
    return one(
      ev('zone.added', a, { zone: { id: ctx.newId(), name: p.name, x: p.x, y: p.y, links: [] } }),
    );
  },
  'zone.link': (s, p, a) => {
    const zones = need(s.scene, 'scene').zones;
    need(zones[p.from], 'zone');
    need(zones[p.to], 'zone');
    if (p.from === p.to) throw new CommandError('INVALID');
    return one(ev('zone.linked', a, p));
  },
  'zone.unlink': (s, p, a) => {
    const zones = need(s.scene, 'scene').zones;
    if (!need(zones[p.from], 'zone').links.includes(p.to)) throw new CommandError('INVALID');
    return one(ev('zone.unlinked', a, p));
  },
  'zone.update': (s, p, a) => {
    need(need(s.scene, 'scene').zones[p.zoneId], 'zone');
    return one(ev('zone.updated', a, p));
  },
  'zone.remove': (s, p, a) => {
    need(need(s.scene, 'scene').zones[p.zoneId], 'zone');
    return one(ev('zone.removed', a, p));
  },
  'token.move': (s, p, a) => {
    controlled(s, a, p.characterId);
    if (p.zoneId) need(need(s.scene, 'scene').zones[p.zoneId], 'zone');
    return one(ev('token.moved', a, p));
  },

  'media.attach': (s, p, a) => {
    if (p.kind === 'scene') {
      if (a.role !== 'gm') throw new CommandError('FORBIDDEN_ROLE');
      if (s.scene?.id !== p.target) throw new CommandError('NO_ACTIVE_SCENE');
    } else controlled(s, a, p.target);
    return one(
      ev('media.attached', a, {
        kind: p.kind,
        target: p.target,
        url: p.url,
        ...(p.kind === 'standing' ? { expression: p.expression ?? 'neutral' } : {}),
        ...(p.meta ? { meta: p.meta } : {}),
      }),
    );
  },
  'character.expression': (s, p, a) => {
    const c = controlled(s, a, p.characterId);
    if (p.expression && !c.standing?.[p.expression])
      throw new CommandError('INVALID', 'no standing for this expression');
    return one(ev('character.expression_set', a, p));
  },

  'chat.post': (_s, p, a) => {
    if (p.as && a.role !== 'gm') throw new CommandError('FORBIDDEN_ROLE');
    return one(ev('chat.posted', a, p));
  },
  'gm.note': (_s, p, a) => one(ev('gm.note', a, p, 'gm')),
  'narration.post': (_s, p, a) => one(ev('narration.posted', a, p)),
  'sfx.play': (_s, p, a) => one(ev('sfx.played', a, p)),
  'event.undo': (s, p, a, ctx) => {
    if (p.targetSeq > s.seq) throw new CommandError('NOT_FOUND', 'event not found');
    const history = ctx.history;
    if (!history) {
      return one(
        ev('event.undone', a, { seqs: [p.targetSeq], ...(p.reason ? { reason: p.reason } : {}) }),
      );
    }
    const bySeq = new Map(history.map((e) => [e.seq, e]));
    const target = need(bySeq.get(p.targetSeq), 'event');
    if (NOT_UNDOABLE.has(target.type)) throw new CommandError('INVALID', 'cannot undo this');
    const undone = undoneSeqs(history);
    if (undone.has(target.seq)) throw new CommandError('INVALID', 'already undone');
    const [first, last] = ctx.groupOf?.(target.seq) ?? [target.seq, target.seq];
    const seqs: number[] = [];
    for (let q = first; q <= last; q++) {
      const e = bySeq.get(q);
      if (e && !NOT_UNDOABLE.has(e.type) && !undone.has(q)) seqs.push(q);
    }
    return one(ev('event.undone', a, { seqs, ...(p.reason ? { reason: p.reason } : {}) }));
  },
};

/** 명령을 검증하고 기록할 이벤트를 만든다. 실패하면 CommandError를 던진다. */
export function resolve(
  state: RoomState,
  command: Command,
  actor: Actor,
  ctx: ResolveContext,
): ResolveResult {
  if (GM_ONLY.has(command.type) && actor.role !== 'gm') throw new CommandError('FORBIDDEN_ROLE');
  const r = resolvers[command.type] as Resolver<CommandType>;
  return r(state, command.payload as never, actor, ctx);
}

export type ValidationResult =
  { ok: true } | { ok: false; code: CommandErrorCode; message: string };

/** UI에서 버튼 비활성 여부를 미리 판단할 때 쓴다. 주사위는 굴리지 않는다. */
export function validate(
  state: RoomState,
  command: Command,
  actor: Actor,
  sealed?: ResolveContext['sealed'],
): ValidationResult {
  let n = 0;
  try {
    resolve(state, command, actor, {
      rng: () => 1,
      newId: () => `preview-${n++}`,
      animSeed: () => 0,
      ...(sealed ? { sealed } : {}),
    });
    return { ok: true };
  } catch (e) {
    if (e instanceof CommandError) return { ok: false, code: e.code, message: e.message };
    throw e;
  }
}

export { absorbOptions };
