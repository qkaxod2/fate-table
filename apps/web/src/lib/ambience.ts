import type { Backdrop, Scene, SceneCondition, SceneTime, SceneWeather } from '@fate/rules-engine';
import { asset } from './asset';

/** 범용 기본 배경 이름 (design-system.md 33절) */
export const BACKDROP_LABELS: Record<Backdrop, string> = {
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
