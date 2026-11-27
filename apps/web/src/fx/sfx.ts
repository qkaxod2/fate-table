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
  | 'stage-shake'
  | 'aspect-place'
  | 'aspect-reveal'
  | 'heal'
  | 'milestone'
  | 'turn-bell'
  | 'concede'
  | 'sheathe'
  | 'pencil-mark'
  | 'paper-tap'
  | 'book-open'
  | CueName;

/** GM이 연출 쪽지에서 모두에게 들려주는 소리 (sfx.play 이벤트의 assetId) */
export const CUES = [
  ['cue-thunder', '천둥'],
  ['cue-door', '문 삐걱'],
  ['cue-knock', '노크'],
  ['cue-footsteps', '발소리'],
  ['cue-glass', '유리 깨짐'],
  ['cue-clash', '칼 부딪힘'],
  ['cue-explosion', '폭발'],
  ['cue-gunshot', '총성'],
  ['cue-howl', '늑대 울음'],
  ['cue-bell', '종소리'],
  ['cue-gasp', '사람들 놀람'],
  ['cue-phone', '전화벨'],
] as const;
export type CueName = (typeof CUES)[number][0];
const CUE_SET = new Set<string>(CUES.map(([n]) => n));
export const isCue = (id: string): id is CueName => CUE_SET.has(id);

/** 같은 소리가 연달아 나도 기계처럼 들리지 않게 높이를 조금씩 흔드는 작은 소리들 */
const VARY = new Set<SfxName>([
  'dice-settle',
  'paper-tap',
  'pencil-mark',
  'speech-pop',
  'aspect-place',
]);

const KEY = 'fate.sfx';
// 기본 크기를 낮추며 키를 바꿨다 (예전 값은 버리고 새 기본에서 시작한다)
const VOL_KEY = 'fate.sfx.volume.v2';
let enabled: boolean | undefined;
let master: number | undefined;

/** 효과음 전체 크기 (0~1). 설정 창의 볼륨 막대 */
export function sfxVolume(): number {
  if (master !== undefined) return master;
  master = readNumber(VOL_KEY, 0.6);
  return master;
}

export function setSfxVolume(v: number): void {
  master = Math.min(1, Math.max(0, v));
  save(VOL_KEY, String(master));
}

/** 소리 전체 스위치. 끄면 효과음과 배경음이 모두 멈춘다 */
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
  save(KEY, on ? 'on' : 'off');
  for (const fn of listeners) fn();
}

// ---------- 소리 장치 ----------
// Web Audio로 미리 풀어 둔 소리를 바로 튼다. <audio>보다 늦음이 적고, 같은 소리가 겹쳐도 끊기지 않는다.
// 브라우저가 첫 클릭 전에는 소리를 막으니, 첫 손길에 장치를 깨운다.

const listeners = new Set<() => void>();
/** 소리 스위치가 바뀔 때 (배경음이 따라서 멈추거나 다시 깔린다) */
export function onSoundChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

let ctx: AudioContext | null | undefined;
const buffers = new Map<string, Promise<AudioBuffer | null>>();
const fallback = new Map<string, HTMLAudioElement>();

/** 소리 장치. 지원하지 않으면 null */
export function audio(): AudioContext | null {
  if (ctx !== undefined) return ctx;
  if (typeof window === 'undefined') return null;
  const AC =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  ctx = AC ? new AC() : null;
  if (ctx) {
    const wake = () => {
      if (ctx!.state !== 'running') void ctx!.resume().catch(() => {});
    };
    for (const ev of ['pointerdown', 'keydown', 'touchend'] as const)
      window.addEventListener(ev, wake, { capture: true, passive: true });
  }
  return ctx;
}

/** 파일 하나를 받아 풀어 둔다. 같은 파일은 한 번만 받는다 */
export function loadBuffer(path: string): Promise<AudioBuffer | null> {
  let p = buffers.get(path);
  if (!p) {
    const c = audio();
    p = c
      ? fetch(asset(path))
          .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
          .then((b) => c.decodeAudioData(b))
          .catch(() => null)
      : Promise.resolve(null);
    buffers.set(path, p);
  }
  return p;
}

/** 곧 쓸 소리를 미리 받아 둔다 (첫 소리가 늦지 않게) */
export function preloadSfx(names: readonly SfxName[]): void {
  if (typeof window === 'undefined') return;
  for (const n of names) void loadBuffer(`/sfx/${n}.mp3`);
}

function fallbackPlay(name: SfxName, volume: number, rate: number): void {
  let base = fallback.get(name);
  if (!base) {
    base = new Audio(asset(`/sfx/${name}.mp3`));
    base.preload = 'auto';
    fallback.set(name, base);
  }
  const a = base.cloneNode() as HTMLAudioElement;
  a.volume = Math.min(1, volume);
  a.playbackRate = rate;
  // 자동 재생 제한(첫 클릭 전)에 걸리면 조용히 넘어간다
  a.play().catch(() => {});
}

/** 이름마다 알맞은 기본 크기. 손끝의 작은 소리는 작게, GM이 일부러 트는 소리는 크게 */
const LEVEL: Partial<Record<SfxName, number>> = {
  'paper-tap': 0.22,
  'pencil-mark': 0.3,
  'aspect-place': 0.4,
  'book-open': 0.3,
  'turn-bell': 0.45,
  heal: 0.5,
  concede: 0.45,
  sheathe: 0.45,
  'aspect-reveal': 0.55,
};

export function playSfx(
  name: SfxName,
  volume = LEVEL[name] ?? (isCue(name) ? 0.8 : 0.6),
  rate = 1,
): void {
  if (typeof window === 'undefined' || !sfxEnabled()) return;
  const v = volume * sfxVolume();
  if (v <= 0) return;
  const r = VARY.has(name) ? rate * (0.96 + Math.random() * 0.08) : rate;
  const c = audio();
  if (!c) return fallbackPlay(name, v, r);
  const asked = c.currentTime;
  void loadBuffer(`/sfx/${name}.mp3`).then((buf) => {
    // 처음 받느라 한참 늦었으면 엉뚱한 때 울리지 않게 버린다
    if (!buf || c.state !== 'running' || c.currentTime - asked > 0.6) return;
    const src = c.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = r;
    const g = c.createGain();
    g.gain.value = Math.min(1, v);
    src.connect(g).connect(c.destination);
    src.start();
  });
}

function readNumber(key: string, dflt: number): number {
  try {
    const raw = localStorage.getItem(key);
    const v = Number(raw);
    return raw !== null && v >= 0 && v <= 1 ? v : dflt;
  } catch {
    return dflt;
  }
}

function save(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // 저장 못 해도 이번 화면에서는 적용된다
  }
}

export { readNumber as readSoundNumber, save as saveSoundSetting };

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
    case 'invoke.revoked':
    case 'compel.refused':
      return 'token-flip';
    case 'compel.offered':
    case 'compel.proposed':
      return 'compel-card';
    case 'roll.helped':
      return 'token-flip';
    case 'fate.adjusted':
      return e.payload.delta > 0 && e.payload.target !== 'gm_pool' ? 'token-fly' : null;
    case 'compel.accepted':
      return 'compel-accept';
    // 스트레스로 막으면 베이는 소리, 후유증까지 받으면 무거운 걸쇠 소리
    case 'damage.absorbed':
      return e.payload.consequences.length ? 'consequence-slot' : 'hit-slash';
    case 'character.taken_out':
      return 'taken-out';
    case 'character.conceded':
      return 'concede';
    case 'conflict.started':
    case 'contest.started':
      return 'conflict-drum';
    case 'conflict.ended':
      return 'sheathe';
    case 'aspect.added':
      return e.payload.aspect.hidden ? null : 'aspect-place';
    case 'aspect.revealed':
      return 'aspect-reveal';
    case 'consequence.cleared':
    case 'consequence.recovery_started':
      return 'heal';
    case 'milestone.granted':
      return 'milestone';
    case 'room.member_joined':
      return 'cue-knock';
    case 'sfx.played':
      return isCue(e.payload.assetId) ? e.payload.assetId : null;
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

/** 큰 소리가 같이 나면 묻히는 작은 소리 (장면이 열리며 상황 카드가 깔릴 때 등) */
const COVERED_BY: Partial<Record<SfxName, SfxName[]>> = {
  'aspect-place': ['scene-transition', 'consequence-slot', 'aspect-reveal', 'conflict-drum'],
  'token-flip': ['compel-accept'],
  'cue-knock': ['scene-transition'],
};

/** 한꺼번에 들어온 이벤트들의 소리. 같은 소리는 한 번, 묻히는 소리는 뺀다. [이름, 크기] */
export function sfxForEvents(es: readonly RoomEvent[]): Array<[SfxName, number | undefined]> {
  const names = new Set<SfxName>();
  for (const e of es) {
    const n = sfxForEvent(e);
    if (n) names.add(n);
  }
  for (const n of [...names]) if (COVERED_BY[n]?.some((m) => names.has(m))) names.delete(n);
  // 누가 들어온 노크는 멀리서 들리듯 작게
  return [...names].map((n) => [n, n === 'cue-knock' ? 0.3 : undefined]);
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
