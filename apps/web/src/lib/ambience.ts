import type {
  Backdrop,
  Scene,
  SceneCondition,
  SceneSound,
  SceneTime,
  SceneWeather,
} from '@fate/rules-engine';
import { asset } from './asset';

/** 범용 기본 배경 이름 (design-system.md 33절) */
export const BACKDROP_LABELS: Record<Backdrop, string> = {
  classroom: '교실',
  office: '사무실',
  cafe: '카페',
  store: '편의점',
  street: '도심 거리',
  residential: '주택가',
  subway: '지하철역',
  park: '공원',
  rooftop: '옥상',
  apartment: '거실',
  forest: '숲길',
  village: '마을 광장',
  tavern: '선술집',
  castle: '성 대전',
  dungeon: '지하 감옥',
  harbor: '항구',
  plains: '초원 길',
  mountain: '산길',
  ruins: '폐허',
  alley: '뒷골목',
};

/** 고르는 판에서 나누어 보이는 묶음 */
export const BACKDROP_GENRES: ReadonlyArray<{ id: string; label: string; items: Backdrop[] }> = [
  {
    id: 'modern',
    label: '현대',
    items: [
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
    ],
  },
  {
    id: 'fantasy',
    label: '판타지',
    items: [
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
    ],
  },
];

export const TIME_LABELS: Record<SceneTime, string> = {
  day: '낮',
  dawn: '새벽',
  dusk: '노을',
  night: '밤',
};

export const WEATHER_LABELS: Record<SceneWeather, string> = {
  clear: '맑음',
  rain: '비',
  storm: '폭풍',
  snow: '눈',
};

/** 장면 배경음의 바닥 소리 이름 */
export const SOUND_LABELS: Record<Exclude<SceneSound, 'none'>, string> = {
  indoor: '실내 (시계 소리)',
  cafe: '카페 웅성임',
  city: '도시 소음',
  birds: '새소리',
  night: '밤 개구리',
  tavern: '선술집 웅성임',
  hall: '돌로 된 큰 방',
  dungeon: '지하 물방울',
  harbor: '파도와 갈매기',
  wind: '바람',
};

export const CONDITION_LABELS: Record<SceneCondition, string> = {
  fire: '화재',
  dust: '황사',
  fog: '안개',
};

export const backdropUrl = (b: Backdrop, thumb = false) =>
  asset(`/backdrops/${b}${thumb ? '-thumb' : ''}.webp`);

/** 장면 그림: 그린 배경 → 기본 배경 → 체험용 그림 */
export function sceneImage(scene: Scene | null | undefined): string {
  if (scene?.backgroundUrl) return scene.backgroundUrl;
  if (scene?.backdrop) return backdropUrl(scene.backdrop);
  return asset('/try/bg.jpg');
}
