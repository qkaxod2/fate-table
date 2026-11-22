'use client';

import {
  MUSIC_TRACKS,
  SCENE_CONDITIONS,
  SCENE_SOUNDS,
  SCENE_TIMES,
  SCENE_WEATHERS,
  type Command,
  type Music,
  type RoomEvent,
  type Scene,
} from '@fate/rules-engine';
import { useEffect, useState } from 'react';
import {
  BACKDROP_GENRES,
  BACKDROP_LABELS,
  backdropUrl,
  CONDITION_LABELS,
  SOUND_LABELS,
  TIME_LABELS,
  WEATHER_LABELS,
} from '@/lib/ambience';
import { autoBed } from '@/fx/ambience';
import { TRACK_LABELS } from '@/fx/music';
import styles from './MoodPanel.module.css';

type Run = (cmd: Command) => Promise<RoomEvent[]>;
type Mood = Extract<Command, { type: 'scene.mood' }>['payload'];

/**
 * GM의 배경 · 분위기 판 (design-system.md 33절).
 * 무대를 가리지 않는 작은 판이라, 고르는 즉시 뒤의 장면이 바뀌는 걸 보면서 고른다.
 */
export function MoodPanel({
  scene,
  music,
  run,
  onClose,
}: {
  scene: Scene;
  /** 방에 흐르는 음악 (장면이 바뀌어도 이어진다) */
  music?: Music | undefined;
  run: Run;
  onClose: () => void;
}) {
  const amb = scene.ambience ?? { time: 'day', weather: 'clear', conditions: [] };
  const set = (payload: Mood) => void run({ type: 'scene.mood', payload });
  const [genre, setGenre] = useState(
    () =>
      BACKDROP_GENRES.find((g) => scene.backdrop && g.items.includes(scene.backdrop))?.id ??
      BACKDROP_GENRES[0]!.id,
  );
  const auto = autoBed(scene);
  const items = BACKDROP_GENRES.find((g) => g.id === genre)?.items ?? [];
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <section className={styles.panel} aria-label="배경과 분위기">
      <header className={styles.head}>
        <b>배경 · 분위기</b>
        <button type="button" className={styles.close} onClick={onClose}>
          닫기 <kbd>Esc</kbd>
        </button>
      </header>

      <div className={styles.genreRow}>
        <h3 className={styles.label}>기본 배경</h3>
        <div className={styles.genres} role="tablist" aria-label="배경 묶음">
          {BACKDROP_GENRES.map((g) => (
            <button
              key={g.id}
              type="button"
              role="tab"
              aria-selected={genre === g.id}
              onClick={() => setGenre(g.id)}
            >
              {g.label}
            </button>
          ))}
        </div>
      </div>
      <div className={styles.backdrops} role="radiogroup" aria-label="기본 배경">
        {items.map((b) => (
          <button
            key={b}
            type="button"
            role="radio"
            aria-checked={scene.backdrop === b}
            className={styles.backdrop}
            onClick={() => set({ backdrop: scene.backdrop === b ? null : b })}
          >
            <img src={backdropUrl(b, true)} alt="" loading="lazy" />
            <span>{BACKDROP_LABELS[b]}</span>
          </button>
        ))}
      </div>
      {scene.backgroundUrl && (
        <p className={styles.note}>지금은 그린 배경을 쓰는 중. 고르면 바뀐다</p>
      )}

      <h3 className={styles.label}>시간</h3>
      <div className={styles.chips} role="radiogroup" aria-label="시간">
        {SCENE_TIMES.map((t) => (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={amb.time === t}
            onClick={() => amb.time !== t && set({ time: t })}
          >
            {TIME_LABELS[t]}
          </button>
        ))}
      </div>

      <h3 className={styles.label}>날씨</h3>
      <div className={styles.chips} role="radiogroup" aria-label="날씨">
        {SCENE_WEATHERS.map((w) => (
          <button
            key={w}
            type="button"
            role="radio"
            aria-checked={amb.weather === w}
            onClick={() => amb.weather !== w && set({ weather: w })}
          >
            {WEATHER_LABELS[w]}
          </button>
        ))}
      </div>

      <h3 className={styles.label}>상태 · 여러 개 겹칠 수 있다</h3>
      <div className={styles.chips} aria-label="상태">
        {SCENE_CONDITIONS.map((c) => {
          const on = amb.conditions.includes(c);
          return (
            <button
              key={c}
              type="button"
              aria-pressed={on}
              onClick={() =>
                set({
                  conditions: on ? amb.conditions.filter((x) => x !== c) : [...amb.conditions, c],
                })
              }
            >
              {CONDITION_LABELS[c]}
            </button>
          );
        })}
      </div>

      <h3 className={styles.label}>배경음 · 비, 눈, 불길 소리는 위에 겹쳐 깔린다</h3>
      <div className={styles.chips} role="radiogroup" aria-label="배경음">
        <button
          type="button"
          role="radio"
          aria-checked={!scene.sound}
          onClick={() => scene.sound && set({ sound: null })}
        >
          자동{auto ? ` (${SOUND_LABELS[auto]})` : ''}
        </button>
        {SCENE_SOUNDS.filter((x) => x !== 'none').map((x) => (
          <button
            key={x}
            type="button"
            role="radio"
            aria-checked={scene.sound === x}
            onClick={() => scene.sound !== x && set({ sound: x })}
          >
            {SOUND_LABELS[x]}
          </button>
        ))}
        <button
          type="button"
          role="radio"
          aria-checked={scene.sound === 'none'}
          onClick={() => scene.sound !== 'none' && set({ sound: 'none' })}
        >
          끄기
        </button>
      </div>

      <MusicPicker music={music} run={run} />
    </section>
  );
}

/** 배경 음악: 기본 곡이나 음악 파일 주소. 장면이 바뀌어도 바꿀 때까지 이어진다 */
function MusicPicker({ music, run }: { music: Music | undefined; run: Run }) {
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [bad, setBad] = useState(false);
  const set = (payload: Extract<Command, { type: 'music.set' }>['payload']) =>
    void run({ type: 'music.set', payload });
  const track = music && 'track' in music ? music.track : undefined;
  return (
    <>
      <h3 className={styles.label}>음악 · 장면이 바뀌어도 이어진다</h3>
      <div className={styles.chips} role="radiogroup" aria-label="음악">
        <button type="button" role="radio" aria-checked={!music} onClick={() => music && set({})}>
          없음
        </button>
        {MUSIC_TRACKS.map((t) => (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={track === t}
            onClick={() => track !== t && set({ track: t })}
          >
            {TRACK_LABELS[t]}
          </button>
        ))}
        {music && 'url' in music && (
          <button type="button" role="radio" aria-checked>
            {music.title ?? '음악 파일'}
          </button>
        )}
      </div>
      <form
        className={styles.musicUrl}
        onSubmit={(e) => {
          e.preventDefault();
          const u = url.trim();
          if (!/^https:\/\/\S+$/.test(u)) {
            setBad(true);
            return;
          }
          set({ url: u, ...(title.trim() ? { title: title.trim() } : {}) });
          setUrl('');
          setTitle('');
          setBad(false);
        }}
      >
        <input
          type="url"
          placeholder="음악 파일 주소 (https://….mp3)"
          aria-label="음악 파일 주소"
          aria-invalid={bad || undefined}
          value={url}
          maxLength={500}
          onChange={(e) => setUrl(e.target.value)}
        />
        <input
          placeholder="곡 이름 (선택)"
          aria-label="곡 이름"
          value={title}
          maxLength={80}
          onChange={(e) => setTitle(e.target.value)}
        />
        <button type="submit" disabled={!url.trim()}>
          틀기
        </button>
      </form>
      <p className={styles.note}>
        {bad
          ? 'https로 시작하는 음악 파일 주소만 틀 수 있다'
          : '바로 재생되는 mp3 · ogg 주소만 된다 (유튜브 같은 페이지 주소는 안 됨)'}
      </p>
    </>
  );
}
