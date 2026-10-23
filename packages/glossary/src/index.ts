// 툴 안의 모든 용어 표기는 이 파일 하나를 기준으로 한다 (plan/glossary.md).

export interface Term {
  label: string;
  tip?: string;
}

export const TERMS = {
  aspect: {
    label: '특성',
    tip: '캐릭터나 장면을 설명하는 짧은 문구. 유리하게도, 불리하게도 쓰여요',
  },
  high: { label: '핵심 컨셉', tip: '캐릭터를 한 줄로 요약한 특성' },
  trouble: { label: '약점', tip: '캐릭터를 곤란하게 만드는 특성' },
  normal: { label: '특성' },
  situation: { label: '장면 특성', tip: '장면이나 구역에 붙은 특성' },
  consequenceAspect: { label: '후유증' },
  boost: { label: '부스트', tip: '한 번 쓰면 사라지는 임시 특성' },
  approach: { label: '접근법', tip: '행동하는 방식. 6가지가 있어요' },
  careful: { label: '신중', tip: '꼼꼼하게, 조심스럽게' },
  clever: { label: '지략', tip: '머리를 써서' },
  flashy: { label: '화려', tip: '눈에 띄게, 멋지게' },
  forceful: { label: '완력', tip: '힘으로 밀어붙여서' },
  quick: { label: '신속', tip: '빠르게' },
  sneaky: { label: '은밀', tip: '몰래, 속여서' },
  stunt: { label: '특기', tip: '특정 상황에서 보너스를 주는 고유 능력' },
  fatePoint: { label: '운명점', tip: '특성을 발동할 때 쓰고, 강요를 받아들이면 얻는 점수' },
  refresh: { label: '재충전', tip: '세션 시작 시 운명점이 채워지는 기준값' },
  stress: { label: '스트레스', tip: '가벼운 피해를 막는 칸 3개' },
  consequence: { label: '후유증', tip: '큰 피해를 받아낸 대가로 남는 특성' },
  mild: { label: '경상', tip: '피해 2를 흡수해요' },
  moderate: { label: '중상', tip: '피해 4를 흡수해요' },
  severe: { label: '중태', tip: '피해 6을 흡수해요' },
  milestone: { label: '이정표', tip: '성장 시점 (소·중·대)' },
  fateDice: { label: '페이트 주사위', tip: '+, −, 빈 면이 있는 주사위 4개' },
  ladder: { label: '등급표', tip: '결과 수치를 말로 표현한 표' },
  overcome: { label: '극복', tip: '장애물을 넘어요' },
  create_advantage: { label: '이점 창출', tip: '새 특성을 만들거나 찾아내요' },
  attack: { label: '공격', tip: '피해를 줘요' },
  defend: { label: '방어', tip: '공격이나 방해를 막아요' },
  fail: { label: '실패' },
  tie: { label: '동점' },
  success: { label: '성공' },
  style: { label: '대성공', tip: '3 이상 차이로 성공' },
  invoke: { label: '발동', tip: '운명점 1로 +2를 받거나 다시 굴려요' },
  freeInvoke: { label: '무료 발동', tip: '운명점 없이 쓰는 발동권' },
  compel: { label: '강요', tip: '약점 등으로 일이 꼬이는 대신 운명점을 받아요' },
  shifts: { label: '차이', tip: '결과와 난이도의 차이' },
  conflict: { label: '갈등', tip: '전투처럼 서로 해치려는 상황' },
  contest: { label: '경합', tip: '먼저 3번 이기는 겨루기' },
  challenge: { label: '도전', tip: '여러 번의 극복으로 푸는 상황' },
  exchange: { label: '라운드' },
  concede: { label: '양보' },
  takenOut: { label: '탈락' },
  zone: { label: '구역' },
} as const satisfies Record<string, Term>;

export type TermKey = keyof typeof TERMS;

export function term(key: TermKey): string {
  return TERMS[key].label;
}

export function tip(key: TermKey): string | undefined {
  return (TERMS[key] as Term).tip;
}

export const LADDER_LABELS: Readonly<Record<number, string>> = {
  8: '전설',
  7: '서사',
  6: '환상',
  5: '최상',
  4: '우수',
  3: '양호',
  2: '준수',
  1: '보통',
  0: '평범',
  [-1]: '미흡',
  [-2]: '최악',
};
