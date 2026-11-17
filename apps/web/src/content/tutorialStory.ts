import type { Approach, Stunt } from '@fate/rules-engine';
import { SAMPLE_CHARACTERS, type SampleCharacter } from './oneshot';

/**
 * 튜토리얼 이야기: 물레방아 마을 → 불타는 곡물 창고 → 마을 잔치.
 * 고르지 않은 두 캐릭터는 동료 NPC로 함께 다니며 말하고, 제 차례에 굴린다.
 */

export const VILLAGE = {
  name: '물레방아 마을',
  aspects: [
    { text: '수확을 막 끝낸 마을', hidden: false },
    { text: '바람을 타고 번지는 연기', hidden: false },
  ],
} as const;

export const FEAST = {
  name: '물레방아 마을의 밤',
  aspects: [{ text: '모닥불 곁의 잔치', hidden: false }],
} as const;

/** 촌장은 스탠딩 없이 대사로만 나온다 */
export const ELDER = '촌장';

/** 동료가 맡는 대사. 캐릭터마다 말투가 다르다 (하윤: 단정함, 레오: 수다스러움, 미라: 짧고 건조함) */
interface Voice {
  /** 마을에서 처음 인사할 때 */
  hello: (me: string) => string;
  /** 창고 앞에서 길을 맡길 때 */
  sendAhead: (me: string) => string;
  /** 두목에게 달려들며 */
  charge: string;
  /** 내가 만든 특성을 이어받아 공격할 때 */
  followUp: (me: string, aspect: string | null) => string;
  /** 내가 공격할 차례를 열어 줄 때 */
  cheer: (me: string) => string;
  /** 마지막 일격 */
  finish: string;
  /** 잔치에서 */
  feast: (me: string) => string;
}

export const VOICES: Record<string, Voice> = {
  hayun: {
    hello: (me) => `${me}, 같이 가겠어요. 마을을 지키겠다고 맹세했으니까.`,
    sendAhead: (me) => `도적들은 내가 붙잡아 둘게요. ${me}, 불길 너머를 부탁해요!`,
    charge: '거기까지다, 도적!',
    followUp: (me, a) =>
      a ? `${me}의 "${a}", 고마워요. 그 틈으로 들어가겠어요!` : '내가 정면을 맡겠어요!',
    cheer: (me) => `지금이에요, ${me}! 숨 돌릴 틈을 주지 마요!`,
    finish: '이걸로 끝이다!',
    feast: (me) => `${me}, 오늘 등을 맡길 수 있어서 든든했어요.`,
  },
  leo: {
    hello: (me) => `${me}! 저 연기 색 좀 봐, 그냥 불이 아니야. 나도 갈래!`,
    sendAhead: (me) => `도적들은 내가 약병으로 붙잡아 둘게. ${me}, 안쪽으로!`,
    charge: '자, 새로 섞은 약을 시험해 볼 시간!',
    followUp: (me, a) =>
      a ? `${me}의 "${a}"! 딱 내가 원하던 거야. 여기에 한 병 더!` : '이번엔 제대로 터뜨린다!',
    cheer: (me) => `${me}, 지금! 놈이 기침하는 사이에!`,
    finish: '마지막 한 병, 받아라!',
    feast: (me) => `${me}, 다음엔 내 실험도 좀 도와줘. 아주 조금만 위험해.`,
  },
  mira: {
    hello: (me) => `…${me}. 혼자 보내긴 불안하니까. 같이 가.`,
    sendAhead: (me) => `도적은 셋. 내가 묶어 둘게. ${me}, 가.`,
    charge: '다락 위. 보인다.',
    followUp: (me, a) => (a ? `"${a}". 좋아, 그 틈으로 쏜다.` : '한 발이면 돼.'),
    cheer: (me) => `${me}, 지금. 놈의 왼쪽이 비었어.`,
    finish: '끝.',
    feast: (me) => `…${me}. 오늘은, 믿을 만했어.`,
  },
};

/** 동료 둘: 고른 캐릭터를 뺀 나머지 (앞에 선 쪽이 A, 뒤가 B) */
export function companionsOf(pick: SampleCharacter): [SampleCharacter, SampleCharacter] {
  const rest = SAMPLE_CHARACTERS.filter((s) => s.key !== pick.key);
  return [rest[0]!, rest[1]!];
}

/** 동료가 공격할 때 쓰는 접근법: 공격 특기가 있으면 그 접근법, 없으면 가장 높은 접근법 */
export function attackApproach(s: SampleCharacter): Approach {
  const st = s.create.stunts.find((x) => x.bonus?.action === 'attack');
  if (st?.bonus) return st.bonus.approach;
  return (Object.entries(s.create.approaches) as [Approach, number][]).reduce((x, y) =>
    y[1] > x[1] ? y : x,
  )[0];
}

/** 작은 이정표에서 고를 수 있는 특기 (바꾸기 · 새로 얻기) */
export const STUNT_IDEAS: Record<string, Stunt[]> = {
  hayun: [
    {
      id: 'shieldwall',
      text: '방패 벽: 신중하게 방어할 때 +2',
      kind: 'bonus',
      bonus: { approach: 'careful', action: 'defend', value: 2 },
    },
    {
      id: 'warcry',
      text: '기사의 일갈: 화려하게 이점을 만들 때 +2',
      kind: 'bonus',
      bonus: { approach: 'flashy', action: 'create_advantage', value: 2 },
    },
  ],
  leo: [
    {
      id: 'flask',
      text: '폭발 플라스크: 지략으로 공격할 때 +2',
      kind: 'bonus',
      bonus: { approach: 'clever', action: 'attack', value: 2 },
    },
    {
      id: 'salve',
      text: '응급 연고: 신중하게 극복할 때 +2',
      kind: 'bonus',
      bonus: { approach: 'careful', action: 'overcome', value: 2 },
    },
  ],
  mira: [
    {
      id: 'treetop',
      text: '나무 타기: 신속하게 극복할 때 +2',
      kind: 'bonus',
      bonus: { approach: 'quick', action: 'overcome', value: 2 },
    },
    {
      id: 'snare',
      text: '덫 놓기: 은밀하게 이점을 만들 때 +2',
      kind: 'bonus',
      bonus: { approach: 'sneaky', action: 'create_advantage', value: 2 },
    },
  ],
};
