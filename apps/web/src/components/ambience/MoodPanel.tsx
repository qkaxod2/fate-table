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
import { useEffect, useRef, useState } from 'react';
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
import { musicLabel, onYoutube, TRACK_LABELS } from '@/fx/music';
import {
  getPlaylist,
  mergePlaylist,
  parseYoutube,
  playlistJson,
  readPlaylist,
  setPlaylist,
  type PlaylistItem,
} from '@/lib/playlist';
import {
  backdropName,
  deleteBackdrop,
  listBackdrops,
  saveBackdrop,
  type SavedBackdrop,
} from '@/lib/gmLibrary';
import { portraitAvailable } from '@/lib/portraitApi';
import { BACKDROP_UPLOAD, UploadError, uploadImage } from '@/lib/uploadImage';
import { usePlaylist } from './usePlaylist';
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
            // 고르기 전에 큰 그림을 미리 받아 둔다. 누르는 순간 무대가 바로 바뀐다
            onPointerEnter={() => void (new Image().src = backdropUrl(b))}
            onFocus={() => void (new Image().src = backdropUrl(b))}
          >
            <img src={backdropUrl(b, true)} alt="" loading="lazy" />
            <span>{BACKDROP_LABELS[b]}</span>
          </button>
        ))}
      </div>
      {scene.backgroundUrl && (
        <p className={styles.note}>지금은 그린 배경이나 내 배경을 쓰는 중. 고르면 바뀐다</p>
      )}

      <MyBackdrops scene={scene} run={run} />

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

/**
 * 내 배경: 가진 그림을 올려 계정 보관함에 모아 두고, 어느 방에서나 눌러서 무대 배경으로 쓴다.
 * 한 장만 올리면 바로 무대에 건다. 여러 장은 보관함에만 담는다.
 */
function MyBackdrops({ scene, run }: { scene: Scene; run: Run }) {
  const [items, setItems] = useState<SavedBackdrop[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const online = portraitAvailable();
  useEffect(() => {
    if (!online) return;
    listBackdrops()
      .then(setItems)
      .catch(() => setItems([]));
  }, [online]);
  const apply = (url: string) =>
    run({ type: 'media.attach', payload: { kind: 'scene', target: scene.id, url } });

  async function take(files: File[]) {
    if (!files.length || busy) return;
    setNote(null);
    let done = 0;
    let last: SavedBackdrop | null = null;
    for (const [i, f] of files.entries()) {
      setBusy(files.length > 1 ? `올리는 중… ${i + 1}/${files.length}` : '올리는 중…');
      try {
        const url = await uploadImage(f, BACKDROP_UPLOAD);
        last = await saveBackdrop(backdropName(f.name), url);
        setItems((xs) => [last!, ...(xs ?? [])]);
        done++;
      } catch (e) {
        setNote(
          `${f.name}: ${e instanceof UploadError ? e.message : '보관함에 담지 못함. 잠시 뒤 다시 시도'}`,
        );
      }
    }
    setBusy(null);
    if (files.length === 1 && last) await apply(last.url);
    else if (done) setNote((n) => n ?? `${done}장을 내 배경에 담았다. 누르면 무대에 건다`);
  }

  async function remove(b: SavedBackdrop) {
    setItems((xs) => xs?.filter((x) => x.key !== b.key) ?? null);
    try {
      await deleteBackdrop(b.key);
    } catch {
      setItems((xs) => [b, ...(xs ?? [])]);
      setNote('지우지 못함. 잠시 뒤 다시 시도');
    }
  }

  return (
    <div
      onDragOver={(e) => online && e.preventDefault()}
      onDrop={(e) => {
        if (!online) return;
        e.preventDefault();
        void take([...e.dataTransfer.files].filter((f) => f.type.startsWith('image/')));
      }}
    >
      <div className={styles.genreRow}>
        <h3 className={styles.label}>내 배경 · 계정에 남아 어느 방에서나 쓴다</h3>
        <button
          type="button"
          className={styles.upload}
          disabled={!online || !!busy}
          onClick={() => file.current?.click()}
        >
          {busy ?? '그림 올리기'}
        </button>
        <input
          ref={file}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          hidden
          onChange={(e) => {
            const fs = [...(e.target.files ?? [])];
            e.target.value = '';
            void take(fs);
          }}
        />
      </div>
      {items && items.length > 0 && (
        <div className={styles.backdrops} role="radiogroup" aria-label="내 배경">
          {items.map((b) => (
            <div key={b.key} className={styles.mine}>
              <button
                type="button"
                role="radio"
                aria-checked={scene.backgroundUrl === b.url}
                className={styles.backdrop}
                onClick={() => scene.backgroundUrl !== b.url && void apply(b.url)}
                title={b.name}
              >
                <img src={b.url} alt="" loading="lazy" />
                <span>{b.name}</span>
              </button>
              <button
                type="button"
                className={styles.mineRemove}
                aria-label={`${b.name} 보관함에서 빼기`}
                onClick={() => void remove(b)}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      <p className={styles.note}>
        {!online
          ? '서버 연결 후 사용 가능'
          : (note ??
            (items?.length
              ? '누르면 무대 배경이 바뀐다. 여러 장을 한꺼번에 골라도 된다'
              : 'PNG · JPG · WEBP. 긴 변 1920px로 줄여서 올린다. 여기로 끌어다 놓아도 된다'))}
      </p>
    </div>
  );
}

/** 배경 음악: 기본 곡, 음악 파일 주소, 유튜브. 장면이 바뀌어도 바꿀 때까지 이어진다 */
function MusicPicker({ music, run }: { music: Music | undefined; run: Run }) {
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [bad, setBad] = useState(false);
  const set = (payload: Extract<Command, { type: 'music.set' }>['payload']) =>
    void run({ type: 'music.set', payload });
  const nowId = music && 'youtube' in music ? music.youtube : undefined;
  const track = music && 'track' in music ? music.track : undefined;
  const submit = (play: boolean) => {
    const u = url.trim();
    const yt = parseYoutube(u);
    if (!yt && (!play || !/^https:\/\/\S+$/.test(u))) {
      setBad(true);
      return;
    }
    const name = title.trim();
    if (yt) {
      const { items } = getPlaylist();
      setPlaylist({ items: mergePlaylist(items, [{ id: yt, ...(name ? { title: name } : {}) }]) });
      if (play) set({ youtube: yt, ...(name ? { title: name } : {}) });
    } else set({ url: u, ...(name ? { title: name } : {}) });
    setUrl('');
    setTitle('');
    setBad(false);
  };
  const isYt = !!parseYoutube(url);
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
        {music && !('track' in music) && (
          <button type="button" role="radio" aria-checked>
            {musicLabel(music)}
          </button>
        )}
      </div>
      {music && 'youtube' in music && (
        <div className={styles.musicUrl} data-row>
          <button
            type="button"
            aria-pressed={music.pausedAt !== undefined}
            onClick={() =>
              void run({ type: 'music.pause', payload: { paused: music.pausedAt === undefined } })
            }
          >
            {music.pausedAt !== undefined ? '▶ 다시 재생' : '❚❚ 잠시 멈춤'}
          </button>
          <span className={styles.note}>
            {music.pausedAt !== undefined ? '모두에게 멈춰 있다' : '모두에게 같이 멈춘다'}
          </span>
        </div>
      )}
      <form
        className={styles.musicUrl}
        onSubmit={(e) => {
          e.preventDefault();
          submit(true);
        }}
      >
        <input
          type="url"
          placeholder="유튜브 링크나 음악 파일 주소"
          aria-label="유튜브 링크나 음악 파일 주소"
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
        {isYt && (
          <button type="button" onClick={() => submit(false)}>
            담기
          </button>
        )}
      </form>
      <p className={styles.note}>
        {bad
          ? '유튜브 링크나 https로 시작하는 음악 파일 주소만 틀 수 있다'
          : '유튜브는 모두가 같은 곳을 함께 듣는다. 음악 파일은 바로 재생되는 mp3 · ogg 주소만 된다'}
      </p>
      <Playlist
        nowId={nowId}
        play={(t) => set({ youtube: t.id, ...(t.title ? { title: t.title } : {}) })}
      />
    </>
  );
}

/** 틀 수 없다고 알려 온 유튜브 영상 (GM 판에 표시) */
function useYoutubeFailed() {
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => onYoutube((n) => n.kind === 'error' && setFailed(n.id)), []);
  return failed;
}

/** GM의 유튜브 목록: 누르면 모두에게 틀고, JSON으로 내려받거나 올린다 */
function Playlist({ nowId, play }: { nowId: string | undefined; play: (t: PlaylistItem) => void }) {
  const { items, chain } = usePlaylist();
  const failed = useYoutubeFailed();
  const importItems = (more: PlaylistItem[]) =>
    setPlaylist({ items: mergePlaylist(getPlaylist().items, more) });
  const remove = (id: string) =>
    setPlaylist({ items: getPlaylist().items.filter((t) => t.id !== id) });
  const file = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState<string | null>(null);
  const download = () => {
    const blob = new Blob([playlistJson(items)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'playlist.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const upload = async (f: File) => {
    try {
      const got = readPlaylist(JSON.parse(await f.text()));
      if (!got.length) {
        setNote('이 파일에서 유튜브 곡을 찾지 못했다');
        return;
      }
      const fresh = got.filter((t) => !items.some((x) => x.id === t.id)).length;
      importItems(got);
      setNote(fresh ? `${fresh}곡을 목록에 더했다` : '모두 이미 목록에 있는 곡이다');
    } catch {
      setNote('JSON 파일을 읽지 못했다');
    }
  };
  return (
    <div className={styles.playlist}>
      <div className={styles.playlistHead}>
        <h3 className={styles.label}>유튜브 목록 · {items.length}곡</h3>
        <label className={styles.chain}>
          <input
            type="checkbox"
            checked={chain}
            onChange={(e) => setPlaylist({ chain: e.target.checked })}
          />
          이어 틀기
        </label>
      </div>
      {items.length > 0 && (
        <ol className={styles.tracks}>
          {items.map((t) => (
            <li key={t.id} aria-current={t.id === nowId || undefined}>
              <button
                type="button"
                className={styles.trackPlay}
                onClick={() => t.id !== nowId && play(t)}
                title={t.id === nowId ? '지금 흐르는 곡' : '모두에게 틀기'}
              >
                <span aria-hidden>{t.id === nowId ? '♪' : '▶'}</span>
                <span className={styles.trackName}>{t.title ?? t.id}</span>
                {failed === t.id && <span className={styles.trackBad}>틀 수 없는 영상</span>}
              </button>
              <button
                type="button"
                className={styles.trackRemove}
                aria-label={`${t.title ?? t.id} 빼기`}
                onClick={() => remove(t.id)}
              >
                ×
              </button>
            </li>
          ))}
        </ol>
      )}
      <div className={styles.musicUrl} data-row>
        <button type="button" onClick={() => file.current?.click()}>
          JSON 올리기
        </button>
        <button type="button" disabled={!items.length} onClick={download}>
          JSON 내려받기
        </button>
        <input
          ref={file}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void upload(f);
          }}
        />
      </div>
      <p className={styles.note}>
        {note ??
          (items.length
            ? '곡을 누르면 모두에게 튼다. 목록은 이 브라우저에 남는다'
            : '유튜브 링크를 틀거나 담으면 여기에 모인다')}
      </p>
    </div>
  );
}
