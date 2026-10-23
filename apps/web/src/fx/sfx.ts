import type { Outcome, RoomEvent } from '@fate/rules-engine';
import { asset } from '@/lib/asset';

/** public/sfx/ 의 기본 효과음 (scripts/gen-sfx.mjs 로 생성) */
export type SfxName =
  | 'dice-roll'
  | 'dice-settle'
  | 'token-flip'
  | 'token-fly'
  | 'success'
  | 'style-chime'
  | 'fail-thud'
  | 'compel-card'
  | 'consequence-slot'
  | 'scene-transition';

const KEY = 'fate.sfx';
const cache = new Map<SfxName, HTMLAudioElement>();
let enabled: boolean | undefined;

export function sfxEnabled(): boolean {
  if (enabled !== undefined) return enabled;
  try {
    enabled = localStorage.getItem(KEY) !== 'off';
  } catch {
    enabled = true;
  }
  return enabled;
}

export function setSfxEnabled(on: boolean): void {
  enabled = on;
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    // 저장 못 해도 이번 화면에서는 적용된다
  }
}

export function playSfx(name: SfxName, volume = 0.6): void {
  if (typeof window === 'undefined' || !sfxEnabled()) return;
  let base = cache.get(name);
  if (!base) {
    base = new Audio(asset(`/sfx/${name}.mp3`));
    base.preload = 'auto';
    cache.set(name, base);
  }
  // 같은 소리가 겹쳐도 끊기지 않게 복제해서 재생
  const a = base.cloneNode() as HTMLAudioElement;
  a.volume = volume;
  // 자동 재생 제한(첫 클릭 전)에 걸리면 조용히 넘어간다
  a.play().catch(() => {});
}

/** 이벤트 하나에 어울리는 효과음. 없으면 null */
export function sfxForEvent(e: RoomEvent): SfxName | null {
  switch (e.type) {
    case 'scene.started':
      return 'scene-transition';
    case 'roll.resolved':
    case 'roll.opposition_revealed':
      return 'dice-roll';
    case 'invoke.applied':
      return e.payload.mode === 'reroll' ? 'dice-roll' : 'token-flip';
    case 'compel.offered':
      return 'compel-card';
    case 'fate.adjusted':
      return e.payload.delta > 0 && e.payload.target !== 'gm_pool' ? 'token-fly' : null;
    case 'damage.absorbed':
      return 'consequence-slot';
    default:
      return null;
  }
}

export function sfxForOutcome(o: Outcome): SfxName {
  return o === 'style'
    ? 'style-chime'
    : o === 'success'
      ? 'success'
      : o === 'fail'
        ? 'fail-thud'
        : 'dice-settle';
}
