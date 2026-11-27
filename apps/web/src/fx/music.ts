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
 * 기본 곡은 public/bgm/ (짧게 이어지는 반복 곡), GM이 붙인 음악 파일은 <audio>로,
 * 유튜브는 숨긴 IFrame 플레이어로 튼다. 한 번에 하나만 흐르므로 서로 겹치지 않는다.
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
const keyOf = (m: Music | undefined) =>
  !m
    ? ''
    : 'track' in m
      ? `t:${m.track}`
      : 'youtube' in m
        ? `y:${m.youtube}:${m.at}`
        : `u:${m.url}`;

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

/* ---------------- 유튜브 ---------------- */

interface YtPlayer {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(s: number, allowSeekAhead: boolean): void;
  setVolume(v: number): void;
  getVolume(): number;
  getDuration(): number;
  getPlayerState(): number;
  getVideoData(): { title?: string };
  destroy(): void;
}
interface YtApi {
  Player: new (
    el: HTMLElement,
    o: {
      videoId: string;
      width: number;
      height: number;
      playerVars: Record<string, number | string>;
      events: Record<string, (e: { data: number; target: YtPlayer }) => void>;
    },
  ) => YtPlayer;
}
declare global {
  interface Window {
    YT?: YtApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let ytApi: Promise<YtApi> | null = null;
function loadYt(): Promise<YtApi> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  ytApi ??= new Promise((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      if (window.YT) resolve(window.YT);
    };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.async = true;
    s.onerror = () => {
      ytApi = null;
      reject(new Error('YT'));
    };
    document.head.append(s);
  });
  return ytApi;
}

/** 유튜브 재생 소식: 곡이 끝났다 · 틀 수 없다 · 제목을 알았다 (GM 플레이리스트가 듣는다) */
export type YoutubeNews =
  { kind: 'ended' | 'error'; id: string } | { kind: 'title'; id: string; title: string };
const ytListeners = new Set<(n: YoutubeNews) => void>();
export function onYoutube(fn: (n: YoutubeNews) => void): () => void {
  ytListeners.add(fn);
  return () => void ytListeners.delete(fn);
}
const tell = (n: YoutubeNews) => ytListeners.forEach((fn) => fn(n));

const ENDED = 0;
const PLAYING = 1;

/** 숨긴 유튜브 플레이어로 튼다. 서버가 튼 시각(at)부터 지난 만큼 넘겨서 모두 같은 곳을 듣는다 */
function startYoutube(id: string, at: number): Playing {
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText =
    'position:fixed;left:0;bottom:0;width:1px;height:1px;opacity:0;pointer-events:none;overflow:hidden';
  const box = document.createElement('div');
  host.append(box);
  document.body.append(host);

  let player: YtPlayer | null = null;
  let stopped = false;
  let target = level();
  let timer: ReturnType<typeof setInterval> | null = null;
  const fadeTo = (v: number, then?: () => void) => {
    if (timer) clearInterval(timer);
    timer = null;
    const p = player;
    if (!p) return then?.();
    const from = p.getVolume() / 100;
    const t0 = performance.now();
    timer = setInterval(() => {
      const k = Math.min(1, (performance.now() - t0) / (FADE * 1000));
      p.setVolume(Math.round(Math.min(1, Math.max(0, from + (v - from) * k)) * 100));
      if (k >= 1) {
        if (timer) clearInterval(timer);
        timer = null;
        then?.();
      }
    }, 100);
  };
  /** 지금 들어야 할 곳 (초). 곡 길이를 알면 그 안으로 돌린다 (끝나면 처음부터 반복하므로) */
  const offset = () => {
    const d = player?.getDuration() ?? 0;
    const t = at > 0 ? Math.max(0, (Date.now() - at) / 1000) : 0;
    return d > 1 ? t % d : t;
  };
  const sync = () => {
    if (!player || stopped) return;
    if (player.getPlayerState() === PLAYING) return;
    player.seekTo(offset(), true);
    player.playVideo();
  };
  // 자동 재생이 막히면 다음에 화면을 누를 때 다시 시도한다
  const retry = () => {
    if (stopped || !player) return;
    if (player.getPlayerState() !== PLAYING) {
      sync();
      document.addEventListener('pointerdown', retry, { once: true });
    }
  };
  const destroy = () => {
    document.removeEventListener('pointerdown', retry);
    player?.destroy();
    player = null;
    host.remove();
  };

  void loadYt()
    .then((YT) => {
      if (stopped) return destroy();
      player = new YT.Player(box, {
        videoId: id,
        width: 200,
        height: 200,
        playerVars: { autoplay: 1, controls: 0, disablekb: 1, playsinline: 1, rel: 0 },
        events: {
          onReady: ({ target: p }) => {
            if (stopped) return destroy();
            p.setVolume(0);
            sync();
            fadeTo(target);
            const title = p.getVideoData().title;
            if (title) tell({ kind: 'title', id, title });
            setTimeout(retry, 1500);
          },
          onStateChange: ({ data }) => {
            if (data !== ENDED || stopped) return;
            tell({ kind: 'ended', id });
            // GM이 다음 곡을 틀면 이 플레이어는 곧 멈춘다. 아무도 안 바꾸면 처음부터 다시
            setTimeout(() => {
              if (stopped || !player) return;
              player.seekTo(0, true);
              player.playVideo();
            }, 2500);
          },
          onError: () => tell({ kind: 'error', id }),
        },
      });
    })
    .catch(() => {
      host.remove();
      tell({ kind: 'error', id });
    });

  return {
    key: `y:${id}:${at}`,
    setLevel: (v) => {
      target = v;
      fadeTo(target);
    },
    stop: () => {
      stopped = true;
      fadeTo(0, destroy);
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
  current =
    'track' in wanted
      ? startTrack(wanted.track)
      : 'youtube' in wanted
        ? startYoutube(wanted.youtube, wanted.at)
        : startUrl(wanted.url);
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
