import type { Approach, Command } from '@fate/rules-engine';

export interface SampleCharacter {
  key: string;
  name: string;
  image: string;
  blurb: string;
  create: Extract<Command, { type: 'character.create' }>['payload'];
}

const spread = (a: Partial<Record<Approach, number>>): Record<Approach, number> => ({
  careful: 0,
  clever: 0,
  flashy: 0,
  forceful: 0,
  quick: 0,
  sneaky: 0,
  ...a,
});

export const SAMPLE_CHARACTERS: SampleCharacter[] = [
  {
    key: 'hayun',
    name: '하윤',
    image: '/try/knight.webp',
    blurb: '힘으로 정면 돌파하는 기사',
    create: {
      name: '하윤',
      isNpc: false,
      approaches: spread({ forceful: 3, careful: 2, flashy: 2, quick: 1, clever: 1 }),
      stunts: [
        {
          id: 'charge',
          text: '마지막 돌격: 완력으로 공격할 때 +2',
          kind: 'bonus',
          bonus: { approach: 'forceful', action: 'attack', value: 2 },
        },
      ],
      highConcept: '망한 왕국의 마지막 기사',
      trouble: '맹세를 어길 수 없다',
      aspects: ['불길 속에서도 물러서지 않는다'],
    },
  },
  {
    key: 'leo',
    name: '레오',
    image: '/try/alch.webp',
    blurb: '머리로 판을 뒤집는 연금술사',
    create: {
      name: '레오',
      isNpc: false,
      approaches: spread({ clever: 3, careful: 2, flashy: 2, quick: 1, sneaky: 1 }),
      stunts: [
        {
          id: 'brew',
          text: '즉석 조합: 지략으로 이점을 창출할 때 +2',
          kind: 'bonus',
          bonus: { approach: 'clever', action: 'create_advantage', value: 2 },
        },
      ],
      highConcept: '호기심 많은 견습 연금술사',
      trouble: '실험부터 하고 본다',
      aspects: ['주머니마다 수상한 약병'],
    },
  },
  {
    key: 'mira',
    name: '미라',
    image: '/try/scout.webp',
    blurb: '그림자 속에서 쏘는 정찰병',
    create: {
      name: '미라',
      isNpc: false,
      approaches: spread({ quick: 3, sneaky: 2, careful: 2, clever: 1, flashy: 1 }),
      stunts: [
        {
          id: 'shadow',
          text: '그림자 사격: 은밀하게 공격할 때 +2',
          kind: 'bonus',
          bonus: { approach: 'sneaky', action: 'attack', value: 2 },
        },
      ],
      highConcept: '숲을 떠난 엘프 정찰병',
      trouble: '사람을 쉽게 믿지 못한다',
      aspects: ['바람 소리로 적을 읽는다'],
    },
  },
];

export const BOSS: Extract<Command, { type: 'character.create' }>['payload'] = {
  name: '도적 두목',
  isNpc: true,
  approaches: spread({ forceful: 3, quick: 2, flashy: 1, careful: 1, sneaky: 1 }),
  stunts: [],
  highConcept: '곡물 창고를 노리는 도적 두목',
  trouble: '눈먼 왼쪽',
  aspects: [],
};

export const SCENE = {
  name: '불타는 곡물 창고',
  background: '/try/bg.jpg',
  bossImage: '/try/boss.webp',
  aspects: [
    { text: '사방에 번지는 불길', hidden: false },
    { text: '무너지는 대들보', hidden: false },
  ],
  opening:
    '문이 부서지자 매캐한 연기와 함께 도적들이 곡물 더미 뒤에서 튀어나온다. 다락 위, 도적 두목이 도끼를 어깨에 걸치고 웃는다. 앞서 동료들과 싸우다 갈비뼈가 부러지고 어깨가 깊게 베였지만, 아직 도끼는 놓지 않았다.',
  overcomeDifficulty: 2,
};
