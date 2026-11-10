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
  | 'scene-transition'
  | 'speech-pop'
  | 'hit-slash'
  | 'taken-out'
  | 'conflict-drum'
  | 'compel-accept'
  | 'stage-shake';

const KEY = 'fate.sfx';
const VOL_KEY = 'fate.sfx.volume';
const cache = new Map<SfxName, HTMLAudioElement>();
let enabled: boolean | undefined;
let master: number | undefined;

/** 효과음 전체 크기 (0~1). 설정 창의 볼륨 막대 */
export function sfxVolume(): number {
  if (master !== undefined) return master;
  try {
    const v = Number(localStorage.getItem(VOL_KEY));
    master = localStorage.getItem(VOL_KEY) !== null && v >= 0 && v <= 1 ? v : 1;
  } catch {
    master = 1;
  }
  return master;
}

export function setSfxVolume(v: number): void {
  master = Math.min(1, Math.max(0, v));
  try {
    localStorage.setItem(VOL_KEY, String(master));
  } catch {
    // 저장 못 해도 이번 화면에서는 적용된다
  }
}

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

export function playSfx(name: SfxName, volume = 0.6, rate = 1): void {
  if (typeof window === 'undefined' || !sfxEnabled()) return;
  let base = cache.get(name);
  if (!base) {
    base = new Audio(asset(`/sfx/${name}.mp3`));
    base.preload = 'auto';
    cache.set(name, base);
  }
  // 같은 소리가 겹쳐도 끊기지 않게 복제해서 재생
  const a = base.cloneNode() as HTMLAudioElement;
  a.volume = Math.min(1, volume * sfxVolume());
  a.playbackRate = rate;
  // 자동 재생 제한(첫 클릭 전)에 걸리면 조용히 넘어간다
  a.play().catch(() => {});
}

/** 손에 닿는 작은 떨림 (터치 기기에서만, 지원하면) */
export function tap(ms = 10): void {
  if (typeof window === 'undefined' || !sfxEnabled()) return;
  if (!window.matchMedia('(pointer: coarse)').matches) return;
  navigator.vibrate?.(ms);
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
    case 'compel.accepted':
      return 'compel-accept';
    // 스트레스로 막으면 베이는 소리, 후유증까지 받으면 무거운 걸쇠 소리
    case 'damage.absorbed':
      return e.payload.consequences.length ? 'consequence-slot' : 'hit-slash';
    case 'character.taken_out':
      return 'taken-out';
    case 'conflict.started':
      return 'conflict-drum';
    case 'stage.fx_played':
      return e.payload.kind === 'shake'
        ? 'stage-shake'
        : e.payload.kind === 'hit'
          ? 'hit-slash'
          : null;
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
