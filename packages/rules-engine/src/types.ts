export const APPROACHES = ['careful', 'clever', 'flashy', 'forceful', 'quick', 'sneaky'] as const;
export const ACTIONS = ['overcome', 'create_advantage', 'attack', 'defend'] as const;
export const CONSEQUENCE_SLOTS = ['mild', 'moderate', 'severe'] as const;

export type Approach = (typeof APPROACHES)[number];
export type Action = (typeof ACTIONS)[number];
export type Outcome = 'fail' | 'tie' | 'success' | 'style';
export type DieFace = -1 | 0 | 1;
export type Dice = [DieFace, DieFace, DieFace, DieFace];
export type AspectKind = 'high' | 'trouble' | 'normal' | 'situation' | 'consequence' | 'boost';
export type ConsequenceSlot = (typeof CONSEQUENCE_SLOTS)[number];
export type Role = 'gm' | 'player' | 'spectator';
export type Visibility = 'public' | 'gm' | 'owner';

export const CONSEQUENCE_VALUE: Record<ConsequenceSlot, number> = {
  mild: 2,
  moderate: 4,
  severe: 6,
};

export interface Stunt {
  id: string;
  text: string;
  kind: 'bonus' | 'once_per_session';
  bonus?: { approach: Approach; action: Action; value: 2 };
  usedThisSession?: boolean;
}

export interface ConsequenceState {
  aspectId: string;
  recovering: boolean;
  /** 회복을 시작한 장면·세션. 그 다음 장면/세션이 끝날 때 자동으로 지워진다. */
  recoveringSince?: { sceneId: string | null; sessionId: string | null };
}

export interface Character {
  id: string;
  name: string;
  isNpc: boolean;
  ownerId: string | null;
  approaches: Record<Approach, number>;
  stunts: Stunt[];
  refresh: number;
  fatePoints: number;
  stress: [boolean, boolean, boolean];
  consequences: Partial<Record<ConsequenceSlot, ConsequenceState>>;
  portraitAssetId?: string;
  portraitUrl?: string;
  milestone?: 'minor' | 'significant' | 'major';
  takenOut?: boolean;
}

export interface Aspect {
  id: string;
  ownerType: 'character' | 'scene' | 'zone';
  ownerId: string;
  kind: AspectKind;
  text: string;
  freeInvokes: number;
  hidden: boolean;
}

export interface Modifier {
  source: string;
  value: number;
}

export interface RollSide {
  characterId: string;
  approach: Approach;
  rating: number;
  dice: Dice | null; // null = 봉인됨(반대 굴림 대기)
  animSeed: number | null;
  modifiers: Modifier[];
  /** 운명점으로 발동한 특성. 같은 굴림에서 같은 특성은 한 번만 유료 발동 가능 */
  paidInvokes: string[];
}

export type RollStatus = 'awaiting_defense' | 'open' | 'final';

export interface RollState {
  id: string;
  action: Action;
  active: RollSide;
  defense: RollSide | null;
  difficulty: number | null;
  targetId: string | null;
  status: RollStatus;
  result?: { total: number; shifts: number; outcome: Outcome };
}

export interface Zone {
  id: string;
  name: string;
  x: number;
  y: number;
  links: string[];
}

export interface Scene {
  id: string;
  name: string;
  pcIds: string[];
  zones: Record<string, Zone>;
  backgroundAssetId?: string;
}

export interface Compel {
  id: string;
  aspectId: string;
  targetId: string;
  text: string;
}

export interface PendingDamage {
  rollId: string;
  targetId: string;
  attackerId: string;
  shifts: number;
}

export interface Conflict {
  id: string;
  kind: 'physical' | 'mental';
  order: string[];
  index: number;
  round: number;
  /** 이번 갈등에서 받은 후유증 수 (양보 보상 계산용) */
  consequencesTaken: Record<string, number>;
}

export interface Contest {
  id: string;
  sides: string[];
  victories: Record<string, number>;
}

export interface Challenge {
  id: string;
  title: string;
  steps: Array<{ label: string; outcome?: Outcome }>;
}

export interface Member {
  userId: string;
  nickname: string;
  role: Role;
}

export interface RoomState {
  seq: number;
  members: Record<string, Member>;
  characters: Record<string, Character>;
  aspects: Record<string, Aspect>;
  session: { id: string; number: number } | null;
  sessionsPlayed: number;
  scene: Scene | null;
  gmPool: number;
  rolls: Record<string, RollState>;
  activeRollId: string | null;
  compels: Record<string, Compel>;
  pendingDamage: Record<string, PendingDamage>;
  conflict: Conflict | null;
  contest: Contest | null;
  challenge: Challenge | null;
  tokens: Record<string, string>;
}

export interface Actor {
  userId: string;
  role: Role;
}

export type Rng = (maxExclusive: number) => number;
