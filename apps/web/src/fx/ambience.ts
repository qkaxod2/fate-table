'use client';

import type { Backdrop, Scene, SceneSound } from '@fate/rules-engine';
import { useEffect, useState } from 'react';
import {
  audio,
  loadBuffer,
  onSoundChange,
  readSoundNumber,
  saveSoundSetting,
  sfxEnabled,
} from './sfx';

/**
 * 장면 배경음. 장소마다 바닥에 깔리는 소리 하나에 날씨(비 · 폭풍 · 눈)와 불길을 겹친다.
 * 장면이나 분위기가 바뀌면 천천히 엇갈려 바뀐다. public/amb/ (scripts/gen-sfx.mjs 로 생성)
 */
export type AmbLayer =
  | 'indoor'
  | 'cafe'
  | 'city'
  | 'birds'
  | 'night'
  | 'tavern'
  | 'hall'
  | 'dungeon'
  | 'harbor'
  | 'wind'
  | 'rain'
  | 'storm'
  | 'snow'
  | 'fire';

/** 바깥인 곳은 밤이 되면 풀벌레 소리로 바뀐다 */
/** 바닥에 깔리는 소리 (GM이 고를 수 있는 것) */
export type Bed = Exclude<SceneSound, 'none'>;

const PLACE: Record<Backdrop, { day: Bed; night?: Bed }> = {
  classroom: { day: 'indoor' },
  office: { day: 'indoor' },
  cafe: { day: 'cafe' },
  store: { day: 'indoor' },
  street: { day: 'city' },
  residential: { day: 'city', night: 'night' },
  subway: { day: 'city' },
  park: { day: 'birds', night: 'night' },
  rooftop: { day: 'city', night: 'wind' },
  apartment: { day: 'indoor' },
  forest: { day: 'birds', night: 'night' },
  village: { day: 'birds', night: 'night' },
  tavern: { day: 'tavern' },
  castle: { day: 'hall' },
  dungeon: { day: 'dungeon' },
  harbor: { day: 'harbor' },
  plains: { day: 'wind', night: 'night' },
  mountain: { day: 'wind' },
  ruins: { day: 'wind', night: 'night' },
  alley: { day: 'city', night: 'night' },
};

/** 층마다 크기 (파일은 같은 크기로 맞춰 두었다). 날씨는 장소보다 앞에 나온다 */
const LEVEL: Record<AmbLayer, number> = {
  indoor: 0.5,
  cafe: 0.6,
  city: 0.55,
  birds: 0.6,
  night: 0.6,
  tavern: 0.6,
  hall: 0.6,
  dungeon: 0.6,
  harbor: 0.6,
  wind: 0.55,
  rain: 0.75,
  storm: 0.8,
  snow: 0.6,
  fire: 0.65,
};

/** 배경 그림과 시간으로 고르는 바닥 소리 (GM이 따로 고르지 않았을 때). 직접 그린 배경이면 짐작하지 않는다 */
export function autoBed(scene: Scene | null | undefined): Bed | null {
  const place = scene?.backdrop && !scene.backgroundUrl ? PLACE[scene.backdrop] : undefined;
  if (!place) return null;
  const t = scene!.ambience?.time;
  return (t === 'night' || t === 'dusk') && place.night ? place.night : place.day;
}

/** 지금 장면에 깔 소리들 */
export function ambLayers(scene: Scene | null | undefined): AmbLayer[] {
  if (!scene || scene.sound === 'none') return [];
  const a = scene.ambience;
  const out: AmbLayer[] = [];
  const bed = scene.sound ?? autoBed(scene);
  // 폭풍이 치면 풀벌레·새소리는 들리지 않는다 (GM이 직접 고른 소리는 그대로)
  if (bed && (scene.sound || a?.weather !== 'storm')) out.push(bed);
  if (a?.weather === 'rain' || a?.weather === 'storm' || a?.weather === 'snow') out.push(a.weather);
  if (a?.conditions.includes('fire')) out.push('fire');
  return out;
}

const ON_KEY = 'fate.amb';
const VOL_KEY = 'fate.amb.volume';
let ambOn: boolean | undefined;
let ambVol: number | undefined;

export function ambienceEnabled(): boolean {
  if (ambOn !== undefined) return ambOn;
  try {
    ambOn = localStorage.getItem(ON_KEY) !== 'off';
  } catch {
    ambOn = true;
  }
  return ambOn;
}

export function setAmbienceEnabled(on: boolean): void {
  ambOn = on;
  saveSoundSetting(ON_KEY, on ? 'on' : 'off');
  apply();
}

export function ambienceVolume(): number {
  if (ambVol === undefined) ambVol = readSoundNumber(VOL_KEY, 0.5);
  return ambVol;
}

export function setAmbienceVolume(v: number): void {
  ambVol = Math.min(1, Math.max(0, v));
  saveSoundSetting(VOL_KEY, String(ambVol));
  apply();
}

// ---------- 재생 ----------

const FADE = 2.5;
let bus: GainNode | null = null;
const playing = new Map<AmbLayer, { src: AudioBufferSourceNode; gain: GainNode }>();
let wanted: AmbLayer[] = [];

function level(): number {
  return sfxEnabled() && ambienceEnabled() ? ambienceVolume() * 0.5 : 0;
}

function apply(): void {
  const c = audio();
  if (!c) return;
  if (!bus) {
    bus = c.createGain();
    bus.gain.value = 0;
    bus.connect(c.destination);
  }
  const now = c.currentTime;
  bus.gain.cancelScheduledValues(now);
  bus.gain.setTargetAtTime(level(), now, 0.4);

  // 빠진 층은 천천히 줄이고 멈춘다
  for (const [name, p] of playing) {
    if (wanted.includes(name)) continue;
    playing.delete(name);
    p.gain.gain.cancelScheduledValues(now);
    p.gain.gain.setValueAtTime(p.gain.gain.value, now);
    p.gain.gain.linearRampToValueAtTime(0, now + FADE);
    // 아직 받는 중이라 시작 전이면 받은 뒤 버려진다
    if (p.src.buffer) p.src.stop(now + FADE + 0.1);
  }
  // 소리를 껐으면 새로 받지 않는다
  if (level() === 0) return;
  for (const name of wanted) {
    if (playing.has(name)) continue;
    const gain = c.createGain();
    gain.gain.value = 0;
    gain.connect(bus);
    const src = c.createBufferSource();
    src.loop = true;
    playing.set(name, { src, gain });
    void loadBuffer(`/amb/${name}.mp3`).then((buf) => {
      // 받는 사이에 장면이 바뀌었으면 버린다
      if (!buf || playing.get(name)?.src !== src) return;
      src.buffer = buf;
      // mp3 앞뒤에 붙는 아주 짧은 빈칸을 건너뛰어 이음매가 튀지 않게
      src.loopStart = 0.05;
      src.loopEnd = buf.duration - 0.05;
      src.connect(gain);
      const t = c.currentTime;
      // 매번 같은 곳에서 시작하지 않게
      src.start(t, 0.05 + Math.random() * (buf.duration - 0.2));
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(LEVEL[name], t + FADE);
    });
  }
}

/** 장면 배경음을 깐다. 화면을 떠나면 걷힌다 */
export function useSceneAmbience(scene: Scene | null | undefined): void {
  const key = ambLayers(scene).join('+');
  // 소리 스위치가 바뀌면 다시 맞춘다 (껐다 켜면 새로 깔린다)
  const [changed, bump] = useState(0);
  useEffect(() => onSoundChange(() => bump((n) => n + 1)), []);
  useEffect(() => {
    wanted = key ? (key.split('+') as AmbLayer[]) : [];
    apply();
  }, [key, changed]);
  useEffect(
    () => () => {
      wanted = [];
      apply();
    },
    [],
  );
}
