import type {
  Action,
  Approach,
  Aspect,
  Character,
  ConsequenceSlot,
  Dice,
  MediaMeta,
  Modifier,
  Outcome,
  Role,
  Visibility,
  Zone,
} from './types';
import type { InvokeMode, InvokeSide, PaidWith } from './invoke';
import type { Reward } from './resolve';

export interface SealedSide {
  characterId: string;
  approach: Approach;
  rating: number;
  dice: Dice;
  animSeed: number;
  modifiers: Modifier[];
}

/** type → payload. 이벤트 목록은 plan/architecture.md 3절과 1:1 */
export interface EventPayloads {
  'room.member_joined': { userId: string; nickname: string; role: Role };
  'session.started': { sessionId: string; number: number; title?: string };
  'session.ended': { sessionId: string; summary?: string };
  'scene.started': {
    sceneId: string;
    name: string;
    pcIds: string[];
    zones: Zone[];
    backgroundAssetId?: string;
  };
  'scene.ended': { sceneId: string };

  'character.created': { character: Character };
  'character.updated': {
    id: string;
    patch: Partial<
      Pick<Character, 'name' | 'approaches' | 'stunts' | 'refresh' | 'portraitAssetId'>
    >;
    /** 플레이어가 이정표로 성장했으면 이정표를 쓴 것으로 처리 */
    milestoneUsed?: boolean;
  };
  'milestone.granted': { characterIds: string[]; size: 'minor' | 'significant' | 'major' };

  'aspect.added': { aspect: Aspect };
  'aspect.revealed': { aspect: Aspect }; // 숨김 동안 못 본 사람도 내용을 알 수 있게 전체를 싣는다
  'aspect.updated': { aspectId: string; text: string };
  'aspect.removed': { aspectId: string; reason?: string };

  'roll.resolved': {
    rollId: string;
    action: Action;
    side: SealedSide;
    difficulty: number | null;
    targetId: string | null;
  };
  'roll.opposition_requested': {
    rollId: string;
    action: Action;
    attackerId: string;
    approach: Approach;
    defenderId: string;
  };
  'roll.opposition_revealed': { rollId: string; attacker: SealedSide; defender: SealedSide };
  'invoke.applied': {
    rollId: string;
    side: InvokeSide;
    aspectId: string;
    mode: InvokeMode;
    paidWith: PaidWith;
    payerId: string;
    newDice?: Dice;
    newAnimSeed?: number;
  };
  'stunt.applied': { rollId: string; side: InvokeSide; stuntId: string; value: number };
  /** 방어자가 조정을 마쳤다. 이 뒤에 공격자가 확정할 수 있다 */
  'roll.defense_ready': { rollId: string };
  'roll.finalized': {
    rollId: string;
    total: number;
    shifts: number;
    outcome: Outcome;
    rewards: Reward[];
  };

  'fate.adjusted': {
    target: string; // characterId 또는 'gm_pool'
    delta: number;
    reason: 'manual' | 'concede' | 'compel' | 'refresh' | 'invoke_against';
  };
  'compel.offered': { compelId: string; aspectId: string; targetId: string; text: string };
  'compel.accepted': { compelId: string };
  'compel.refused': { compelId: string };
  'compel.withdrawn': { compelId: string };

  'conflict.started': { conflictId: string; kind: 'physical' | 'mental'; order: string[] };
  'conflict.turn_advanced': { conflictId: string; index: number; round: number };
  'conflict.ended': { conflictId: string };
  'damage.pending': { rollId: string; targetId: string; attackerId: string; shifts: number };
  'damage.absorbed': {
    rollId: string;
    targetId: string;
    stressBox: 1 | 2 | 3 | null;
    consequences: Array<{ slot: ConsequenceSlot; aspectId: string; text: string }>;
  };
  'character.conceded': { characterId: string; conflictId: string | null; fpGained: number };
  'character.taken_out': { characterId: string; conflictId: string | null };
  'consequence.recovery_started': { characterId: string; slot: ConsequenceSlot };
  'consequence.cleared': { characterId: string; slot: ConsequenceSlot };
  'contest.started': { contestId: string; sides: string[] };
  'contest.exchange': { contestId: string; winnerId: string | null; victories: 1 | 2 };
  'contest.ended': { contestId: string; winnerId: string | null };
  'challenge.started': { challengeId: string; title: string; steps: string[] };
  'challenge.step': { challengeId: string; index: number; outcome: Outcome };
  'challenge.ended': { challengeId: string };

  'zone.added': { zone: Zone };
  'zone.linked': { from: string; to: string };
  'zone.removed': { zoneId: string };
  'zone.updated': { zoneId: string; name?: string; x?: number; y?: number };
  'zone.unlinked': { from: string; to: string };
  'token.moved': { characterId: string; zoneId: string | null };
  'chat.posted': { text: string; as?: string };
  'gm.note': { text: string };
  'narration.posted': { text: string };
  'sfx.played': { assetId: string };
  'media.attached': {
    assetId?: string;
    kind: string;
    target: string;
    url?: string;
    expression?: string;
    meta?: MediaMeta;
  };
  'character.expression_set': { characterId: string; expression: string | null };
  /** 한 명령이 만든 이벤트를 함께 되돌린다. 되돌리기를 되돌리면 다시 하기가 된다. */
  'event.undone': { seqs: number[]; reason?: string };
}

export type EventType = keyof EventPayloads;

export type RoomEvent<T extends EventType = EventType> = {
  [K in T]: {
    seq: number;
    type: K;
    actorId: string | null;
    payload: EventPayloads[K];
    visibility: Visibility;
    ownerId?: string;
  };
}[T];

/** 서버가 seq를 붙이기 전의 이벤트 */
export type NewEvent<T extends EventType = EventType> = {
  [K in T]: Omit<RoomEvent<K>, 'seq'>;
}[T];
