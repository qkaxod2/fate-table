'use client';

import type { Music, MusicTrack } from '@fate/rules-engine';
export { TRACK_LABELS, musicLabel } from '@/lib/ambience';
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
 * 배경 음악. 장면 배경음 위에 한 곡만 흐르고, GM이 곡을 바꾸면 천천히 엇갈려 바뀐다.
 * 기본 곡은 public/bgm/ (짧게 이어지는 반복 곡), GM이 붙인 음악 파일은 <audio>로 튼다.
 */
const VOL_KEY = 'fate.music.volume';
let vol: number | undefined;

/** 0이면 음악을 끈 것이다 */
export function musicVolume(): number {
  if (vol === undefined) vol = readSoundNumber(VOL_KEY, 0.4);
  return vol;
}

export function setMusicVolume(v: number): void {
  vol = Math.min(1, Math.max(0, v));
  saveSoundSetting(VOL_KEY, String(vol));
  apply();
}

const FADE = 3;
const keyOf = (m: Music | undefined) => (!m ? '' : 'track' in m ? `t:${m.track}` : `u:${m.url}`);

interface Playing {
  key: string;
  stop: () => void;
  setLevel: (v: number) => void;
}
let current: Playing | null = null;
let wanted: Music | undefined;

const level = () => (sfxEnabled() ? musicVolume() * 0.6 : 0);

function startTrack(track: MusicTrack): Playing | null {
  const c = audio();
  if (!c) return null;
  const gain = c.createGain();
  gain.gain.value = 0;
  gain.connect(c.destination);
  const src = c.createBufferSource();
  src.loop = true;
  let stopped = false;
  void loadBuffer(`/bgm/${track}.mp3`).then((buf) => {
    if (!buf || stopped) return;
    src.buffer = buf;
    src.loopStart = 0.05;
    src.loopEnd = buf.duration - 0.05;
    src.connect(gain);
    const t = c.currentTime;
    src.start(t, 0.05);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(level(), t + FADE);
  });
  return {
    key: `t:${track}`,
    setLevel: (v) => gain.gain.setTargetAtTime(v, c.currentTime, 0.3),
    stop: () => {
      stopped = true;
      const t = c.currentTime;
      gain.gain.cancelScheduledValues(t);
      gain.gain.setValueAtTime(gain.gain.value, t);
      gain.gain.linearRampToValueAtTime(0, t + FADE);
      if (src.buffer) src.stop(t + FADE + 0.1);
    },
  };
}

/** 다른 곳의 파일은 Web Audio로 읽을 수 없으므로(CORS) <audio>의 크기를 직접 천천히 바꾼다 */
function startUrl(url: string): Playing {
  const el = new Audio(url);
  el.loop = true;
  el.volume = 0;
  let target = level();
  let timer: ReturnType<typeof setInterval> | null = null;
  const fadeTo = (v: number, then?: () => void) => {
    if (timer) clearInterval(timer);
    const from = el.volume;
    const t0 = performance.now();
    timer = setInterval(() => {
      const k = Math.min(1, (performance.now() - t0) / (FADE * 1000));
      el.volume = Math.min(1, Math.max(0, from + (v - from) * k));
      if (k >= 1) {
        if (timer) clearInterval(timer);
        timer = null;
        then?.();
      }
    }, 100);
  };
  // 자동 재생이 막히면 다음에 화면을 누를 때 다시 시도한다
  const play = () =>
    el.play().catch(() => document.addEventListener('pointerdown', play, { once: true }));
  void play();
  fadeTo(target);
  return {
    key: `u:${url}`,
    setLevel: (v) => {
      target = v;
      fadeTo(target);
    },
    stop: () => {
      document.removeEventListener('pointerdown', play);
      fadeTo(0, () => {
        el.pause();
        el.removeAttribute('src');
        el.load();
      });
    },
  };
}

function apply(): void {
  const key = level() > 0 ? keyOf(wanted) : '';
  if (current && current.key === key) {
    current.setLevel(level());
    return;
  }
  current?.stop();
  current = null;
  if (!key || !wanted) return;
  current = 'track' in wanted ? startTrack(wanted.track) : startUrl(wanted.url);
}

/** 방의 배경 음악을 튼다. 화면을 떠나면 멈춘다 */
export function useMusic(music: Music | undefined): void {
  const key = keyOf(music);
  const [changed, bump] = useState(0);
  useEffect(() => onSoundChange(() => bump((n) => n + 1)), []);
  useEffect(() => {
    wanted = music;
    apply();
    // key가 같으면 같은 곡이다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, changed]);
  useEffect(
    () => () => {
      wanted = undefined;
      apply();
    },
    [],
  );
}
