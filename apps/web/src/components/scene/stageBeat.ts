import type { Character, RoomEvent, RoomState } from '@fate/rules-engine';

/**
 * 무대의 "한 박자": 누가 말했거나, 맞았거나, 쓰러졌거나, 강요를 받아들였다.
 * 스탠딩이 잠깐 앞으로 나와 표정을 짓고, 말이면 말풍선을 띄운다.
 */
export interface StageBeat {
  seq: number;
  characterId: string;
  kind: 'say' | 'hurt' | 'down' | 'compel' | 'fx';
  /** 그림이 움직이는 방식: 타격(움찔하며 베인 자국) · 떨림 */
  motion?: 'hit' | 'tremble';
  /** 있는 것 중 앞에서부터 고를 표정 */
  faces: readonly string[];
  /** 말풍선 글 (말일 때만) */
  text?: string;
  /** GM 말: 글리치·뒤집기 꾸밈을 그린다 */
  fx?: boolean;
  /** 얼마나 붙잡아 둘지 (ms) */
  hold: number;
}

/** 말투로 짐작하는 표정. 그 표정 그림이 없으면 기본 표정 그대로 */
const MOODS: Array<[RegExp, readonly string[]]> = [
  [/[?？][!！]|[!！][?？]|헉|헐|뭐라고|설마/, ['surprised']],
  [/ㅠ|ㅜ|흑흑|훌쩍|미안해|죄송/, ['sad', 'embarrassed']],
  [/ㅋㅋ|ㅎㅎ|하하|헤헤|:\)|\^\^|좋아[!！]?$/, ['smile', 'smug']],
  [/후후|훗|흥[,.! ]|흥$|별거 아니/, ['smug', 'smile']],
  [/[!！]{2,}|젠장|이놈|용서 못|으악|각오해/, ['angry', 'serious']],
  [/저기\.\.|그게\.\.|부끄|아니거든/, ['embarrassed']],
  [/\.\.\.|…/, ['serious']],
];

export function moodOf(text: string): readonly string[] {
  for (const [re, faces] of MOODS) if (re.test(text)) return faces;
  return [];
}

/** 채팅을 한 사람이 무대에 세울 캐릭터 */
export function speakerOf(
  e: RoomEvent<'chat.posted'>,
  state: RoomState,
  /** 내가 지금 움직이는 캐릭터 (내 말이면 이 캐릭터가 말한다) */
  mine: { userId: string; character: Character | null },
): Character | undefined {
  const chars = Object.values(state.characters);
  // GM이 NPC 이름으로 말했다
  if (e.payload.as) return chars.find((c) => c.name === e.payload.as);
  if (!e.actorId) return undefined;
  if (state.members[e.actorId]?.role === 'gm') return undefined;
  if (e.actorId === mine.userId && mine.character && !mine.character.isNpc) return mine.character;
  const own = chars.filter((c) => c.ownerId === e.actorId && !c.isNpc && !c.takenOut);
  const pcs = state.scene?.pcIds ?? [];
  return own.find((c) => pcs.includes(c.id)) ?? own[0];
}

/** 이벤트 하나를 무대의 박자로 (해당하지 않으면 null) */
export function beatOf(
  e: RoomEvent,
  state: RoomState,
  events: readonly RoomEvent[],
  mine: { userId: string; character: Character | null },
): StageBeat | null {
  switch (e.type) {
    case 'chat.posted': {
      const c = speakerOf(e, state, mine);
      if (!c) return null;
      const text = e.payload.text;
      return {
        seq: e.seq,
        characterId: c.id,
        kind: 'say',
        faces: moodOf(text),
        text,
        fx: !!e.payload.as,
        // 읽을 시간만큼: 짧은 말은 3.5초, 길어도 9초까지
        hold: Math.min(9000, Math.max(3500, 1200 + text.length * 90)),
      };
    }
    case 'damage.absorbed': {
      const heavy = e.payload.consequences.length > 0;
      return {
        seq: e.seq,
        characterId: e.payload.targetId,
        kind: 'hurt',
        motion: 'hit',
        faces: heavy ? ['sad', 'angry', 'serious'] : ['angry', 'serious', 'sad'],
        hold: heavy ? 4200 : 2800,
      };
    }
    case 'character.taken_out':
      return {
        seq: e.seq,
        characterId: e.payload.characterId,
        kind: 'down',
        faces: ['sad'],
        hold: 3600,
      };
    case 'compel.accepted': {
      const offer = events.find(
        (x): x is RoomEvent<'compel.offered'> =>
          x.type === 'compel.offered' && x.payload.compelId === e.payload.compelId,
      );
      if (!offer) return null;
      return {
        seq: e.seq,
        characterId: offer.payload.targetId,
        kind: 'compel',
        faces: ['embarrassed', 'sad', 'serious'],
        hold: 3200,
      };
    }
    // GM이 캐릭터 하나를 떨게 하거나 때렸다
    case 'stage.fx_played': {
      const { kind, characterId } = e.payload;
      if (!characterId || (kind !== 'tremble' && kind !== 'hit')) return null;
      return {
        seq: e.seq,
        characterId,
        kind: 'fx',
        motion: kind,
        faces: kind === 'hit' ? ['angry', 'sad', 'serious'] : ['surprised', 'embarrassed', 'sad'],
        hold: kind === 'hit' ? 2400 : 2000,
      };
    }
    default:
      return null;
  }
}

/** 무대 전체에 거는 효과 */
export type StageFxKind = 'shake' | 'flash' | 'dark' | 'hit' | 'down' | 'conflict';

export function stageFxOf(e: RoomEvent): StageFxKind | null {
  switch (e.type) {
    case 'stage.fx_played':
      return e.payload.kind === 'tremble' ? null : e.payload.kind;
    case 'damage.absorbed':
      return 'hit';
    case 'character.taken_out':
      return 'down';
    case 'conflict.started':
      return 'conflict';
    default:
      return null;
  }
}

/** 마지막 말 뒤로 이만큼 조용하면 대화하던 두 사람을 내리고 원래 무대로 돌아간다 */
export const TALK_IDLE_MS = 25_000;
