'use client';

// 읽기 전용 리플레이: 공유 링크(?t=토큰)로 방의 공개 기록을 책처럼 읽거나, 처음부터 한 줄씩 다시 본다.
import { replay, type RoomEvent } from '@fate/rules-engine';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { StoryLog } from '@/components/log/StoryLog';
import { PageNav } from '@/components/nav/PageNav';
import { describe } from '@/lib/copy';
import { downloadText, exportFileName, logToMarkdown } from '@/lib/logExport';
import { getSupabase } from '@/lib/supabase';
import styles from './replay.module.css';

type Load =
  { kind: 'loading' } | { kind: 'missing' } | { kind: 'ready'; name: string; events: RoomEvent[] };

export function ReplayLoader() {
  const token = useSearchParams().get('t') ?? '';
  const valid = /^[0-9a-f-]{36}$/i.test(token) && getSupabase() !== null;
  const [load, setLoad] = useState<Load>(valid ? { kind: 'loading' } : { kind: 'missing' });
  useEffect(() => {
    const sb = getSupabase();
    if (!sb || !valid) return;
    void sb.rpc('replay_room', { p_token: token }).then(({ data, error }) => {
      if (error || !data) setLoad({ kind: 'missing' });
      else
        setLoad({
          kind: 'ready',
          name: String(data.name),
          events: data.events as RoomEvent[],
        });
    });
  }, [token, valid]);
  if (load.kind === 'loading') return <p className={styles.note}>기록을 펼치는 중…</p>;
  if (load.kind === 'missing')
    return (
      <main className={styles.page}>
        <PageNav tone="stage" fallback="/" />
        <p className={styles.note}>리플레이를 찾지 못함. 링크가 지워졌거나 잘못됐다.</p>
      </main>
    );
  return <ReplayView name={load.name} events={load.events} />;
}

/** 이야기가 흘러가는 속도 (한 줄에 ms) */
const STEP_MS = 1400;

export function ReplayView({ name, events }: { name: string; events: RoomEvent[] }) {
  const total = events.length;
  const [at, setAt] = useState(total);
  const [playing, setPlaying] = useState(false);
  // 끝에 닿으면 멈춘다
  const running = playing && at < total;
  useEffect(() => {
    if (!running) return;
    const t = window.setTimeout(() => setAt((n) => Math.min(total, n + 1)), STEP_MS);
    return () => window.clearTimeout(t);
  }, [running, at, total]);

  const shown = useMemo(() => events.slice(0, at), [events, at]);
  const state = useMemo(() => replay(shown), [shown]);
  const lines = useMemo(
    () => shown.map((e) => describe(e, state)).filter((l) => l !== null),
    [shown, state],
  );
  const scene = state.scene?.name;

  return (
    <main className={styles.page}>
      <PageNav tone="stage" fallback="/" />
      <header className={styles.head}>
        <p className={styles.kicker}>리플레이 · 읽기 전용</p>
        <h1>{name}</h1>
        {scene && <p className={styles.scene}>지금 장면: {scene}</p>}
      </header>
      <div className={styles.controls}>
        <button
          type="button"
          onClick={() => {
            if (at >= total) setAt(0);
            setPlaying(!running);
          }}
        >
          {running ? '멈춤' : at >= total ? '처음부터 다시 보기' : '이어서 보기'}
        </button>
        <input
          type="range"
          min={0}
          max={total}
          value={at}
          aria-label="기록 위치"
          onChange={(e) => {
            setPlaying(false);
            setAt(Number(e.target.value));
          }}
        />
        <span className={styles.count}>
          {at} / {total}
        </span>
        <button
          type="button"
          onClick={() => downloadText(exportFileName(name), logToMarkdown(lines, { title: name }))}
        >
          마크다운으로 받기
        </button>
      </div>
      <div className={styles.book}>
        <StoryLog variant="book" lines={lines} />
      </div>
    </main>
  );
}
