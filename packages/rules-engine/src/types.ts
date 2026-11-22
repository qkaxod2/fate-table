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

/** GM의 무대 연출 (화면 효과일 뿐 상태는 바꾸지 않는다) */
export const STAGE_FX = ['shake', 'flash', 'dark', 'tremble', 'hit'] as const;
export type StageFxKind = (typeof STAGE_FX)[number];

/** 범용 기본 배경 (그림은 웹의 public/backdrops/<id>.webp) */
export const BACKDROPS = [
  // 현대
  'classroom',
  'office',
  'cafe',
  'store',
  'street',
  'residential',
  'subway',
  'park',
  'rooftop',
  'apartment',
  // 판타지
  'forest',
  'village',
  'tavern',
  'castle',
  'dungeon',
  'harbor',
  'plains',
  'mountain',
  'ruins',
  'alley',
] as const;
export type Backdrop = (typeof BACKDROPS)[number];
/** 장면 분위기: 시간 · 날씨 · 상태 (그림 위에 필터 · 프레임 · 애니메이션으로 그린다) */
export const SCENE_TIMES = ['day', 'dawn', 'dusk', 'night'] as const;
export const SCENE_WEATHERS = ['clear', 'rain', 'storm', 'snow'] as const;
export const SCENE_CONDITIONS = ['fire', 'dust', 'fog'] as const;
/**
 * 장면 배경음에서 바닥에 깔리는 소리. 없으면(자동) 배경 그림과 시간으로 고르고,
 * 'none'이면 날씨·불길 소리까지 모두 끈다. 고른 소리 위에도 비·폭풍·눈·불길은 겹쳐 깔린다.
 */
export const SCENE_SOUNDS = [
  'indoor',
  'cafe',
  'city',
  'birds',
  'night',
  'tavern',
  'hall',
  'dungeon',
  'harbor',
  'wind',
  'none',
] as const;
export type SceneSound = (typeof SCENE_SOUNDS)[number];
export type SceneTime = (typeof SCENE_TIMES)[number];
export type SceneWeather = (typeof SCENE_WEATHERS)[number];
export type SceneCondition = (typeof SCENE_CONDITIONS)[number];
export interface Ambience {
  time: SceneTime;
  weather: SceneWeather;
  conditions: SceneCondition[];
}
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
  /** 지나온 이야기 (자유 서술, 판정에는 쓰지 않는다) */
  backstory?: string;
  /** 캐릭터 만들기 초안에서 데려왔다면 그 초안의 키 */
  sourceKey?: string;
  /** 라이트노벨풍 스탠딩: 표정 id → 투명 PNG URL. 'neutral'이 기본 */
  standing?: Record<string, string>;
  /** 지금 무대에서 짓고 있는 표정 */
  expression?: string;
  /** 기본 스탠딩을 그린 설정. 표정 차분을 같은 결로 그릴 때 쓴다 */
  standingMeta?: MediaMeta;
  milestone?: 'minor' | 'significant' | 'major';
  takenOut?: boolean;
}

export interface MediaMeta {
  presetId: string;
  prompt: string;
  seed: number;
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
  /** 특성 발동(+2)으로 붙은 보정이면 무엇으로 냈는지. 낸 카드를 다시 뺄 때 돌려준다 */
  paidWith?: 'fate_point' | 'free_invoke';
  payerId?: string;
  /** 부스트는 쓰면 사라지므로, 다시 빼면 되살릴 원래 모습 */
  restore?: Aspect;
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

/** cancelled: 끝나기 전에 장면·세션이 닫혀 더는 이어갈 수 없는 굴림 */
export type RollStatus = 'awaiting_defense' | 'open' | 'final' | 'cancelled';

export interface RollState {
  id: string;
  action: Action;
  active: RollSide;
  defense: RollSide | null;
  difficulty: number | null;
  targetId: string | null;
  status: RollStatus;
  /** 방어자가 발동·특기 조정을 마쳤는지. 공격자가 조정하면 다시 false가 된다 */
  defenseReady?: boolean;
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
  backgroundUrl?: string;
  /** 기본 배경. 그린 배경(backgroundUrl)과는 나중에 정한 쪽만 남는다 */
  backdrop?: Backdrop;
  ambience?: Ambience;
  /** GM이 고른 배경음. 없으면 자동 */
  sound?: SceneSound;
}

export interface Compel {
  id: string;
  aspectId: string;
  targetId: string;
  text: string;
  /** 플레이어가 스스로 제안한 강요: GM이 받아들일지 정한다 */
  proposed?: true;
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
