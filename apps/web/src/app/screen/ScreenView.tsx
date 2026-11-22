'use client';

// 큰 화면 (탁자 모드): TV나 프로젝터에 띄워 모두가 함께 보는 화면. 누르는 것은 없고 방을 따라가기만 한다.
// 조작은 각자 폰(방 화면의 좁은 배치)에서 한다. GM 계정으로 열어도 공개된 것만 보인다.
import { undoneSeqs, type Character, type RoomEvent, type RoomState } from '@fate/rules-engine';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { SceneAmbience } from '@/components/ambience/SceneAmbience';
import { useSceneAmbience } from '@/fx/ambience';
import { useMusic } from '@/fx/music';
import { sceneImage } from '@/lib/ambience';
import { asset } from '@/lib/asset';
import { describe } from '@/lib/copy';
import { initialOf } from '@/lib/initial';
import { ensureSession, getSupabase } from '@/lib/supabase';
import { RemoteRoom } from '@/state/remoteRoom';
import styles from './screen.module.css';

type Load =
  | { kind: 'loading' }
  | { kind: 'ready'; room: RemoteRoom; name: string; inviteCode: string }
  | { kind: 'error'; message: string };

export function ScreenLoader() {
  const id = useSearchParams().get('id') ?? '';
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  useEffect(() => {
    const sb = getSupabase();
    let room: RemoteRoom | null = null;
    let cancelled = false;
    (async () => {
      if (!sb) throw new Error('서버가 연결된 배포 사이트에서만 열 수 있다.');
      await ensureSession(sb);
      const { data: auth } = await sb.auth.getUser();
      const { data: info } = await sb
        .from('rooms')
        .select('name, invite_code')
        .eq('id', id)
        .maybeSingle();
      if (!info) throw new Error('이 방의 참가자가 아님. 같은 계정으로 방에 먼저 들어가야 한다');
      if (cancelled) return;
      room = new RemoteRoom(sb, id, auth.user!.id);
      await room.start();
      if (!cancelled)
        setLoad({ kind: 'ready', room, name: info.name, inviteCode: info.invite_code });
    })().catch((e: unknown) => {
      if (!cancelled)
        setLoad({ kind: 'error', message: e instanceof Error ? e.message : '방을 열지 못함' });
    });
    return () => {
      cancelled = true;
      room?.stop();
    };
  }, [id]);
  if (load.kind !== 'ready')
    return (
      <main className={styles.blank}>
        <p>{load.kind === 'loading' ? '큰 화면을 펼치는 중…' : load.message}</p>
      </main>
    );
  return <LiveScreen room={load.room} name={load.name} inviteCode={load.inviteCode} />;
}

function LiveScreen({
  room,
  name,
  inviteCode,
}: {
  room: RemoteRoom;
  name: string;
  inviteCode: string;
}) {
  const snap = useSyncExternalStore(room.subscribe, room.getSnapshot, room.getSnapshot);
  if (snap.closed)
    return (
      <main className={styles.blank}>
        <p>방이 닫혔다</p>
      </main>
    );
  return <ScreenView name={name} inviteCode={inviteCode} state={snap.state} events={snap.events} />;
}

/** 화면에 남겨 두는 이야기 줄 수 */
const LINES = 6;

export function ScreenView({
  name,
  inviteCode,
  state,
  events,
}: {
  name: string;
  inviteCode: string;
  state: RoomState;
  events: readonly RoomEvent[];
}) {
  // 소리는 화면을 한 번 눌러야 켤 수 있다 (브라우저 자동 재생 규칙)
  const [started, setStarted] = useState(false);
  useSceneAmbience(started ? state.scene : null);
  useMusic(started ? state.music : undefined);

  const lines = useMemo(() => {
    const undone = undoneSeqs(events);
    const out = [];
    for (let i = events.length - 1; i >= 0 && out.length < LINES; i--) {
      const e = events[i]!;
      if (e.visibility !== 'public' || undone.has(e.seq)) continue;
      const l = describe(e, state);
      if (l && !l.tag) out.push(l);
    }
    return out.reverse();
  }, [events, state]);

  const aspects = Object.values(state.aspects).filter(
    (a) => !a.hidden && (a.ownerType === 'scene' || a.ownerType === 'zone'),
  );
  const pcs = Object.values(state.characters).filter((c) => !c.isNpc);
  const foes = Object.values(state.characters).filter((c) => c.isNpc && !c.takenOut);
  const joinUrl = `${location.origin}${asset('/join/')}?code=${inviteCode}`;

  return (
    <main
      className={styles.screen}
      data-grade={state.scene?.ambience?.time !== 'day' ? state.scene?.ambience?.time : undefined}
    >
      <img className={styles.bg} src={sceneImage(state.scene)} alt="" />
      <SceneAmbience ambience={state.scene?.ambience} />

      <header className={styles.head}>
        <p className={styles.kicker}>
          {state.session ? `세션 ${state.session.number}` : name}
          {state.session ? ` · ${name}` : ''}
        </p>
        <h1 key={state.scene?.id ?? 'none'}>{state.scene?.name ?? '장면을 기다리는 중'}</h1>
        {aspects.length > 0 && (
          <ul className={styles.aspects} aria-label="장면 특성">
            {aspects.map((a) => (
              <li key={a.id} data-boost={a.kind === 'boost' || undefined}>
                {a.text}
                {a.freeInvokes > 0 && <small>{'●'.repeat(a.freeInvokes)}</small>}
              </li>
            ))}
          </ul>
        )}
      </header>

      <aside className={styles.join} aria-label="참가 방법">
        <span>폰으로 참가</span>
        <b>{inviteCode}</b>
        <small>{joinUrl.replace(/^https?:\/\//, '')}</small>
      </aside>

      <ol className={styles.log} aria-live="polite" aria-label="이야기">
        {lines.map((l, i) => (
          <li key={l.seq} data-kind={l.kind} data-new={i === lines.length - 1 || undefined}>
            {l.text}
          </li>
        ))}
      </ol>

      {foes.length > 0 && (
        <ul className={styles.foes} aria-label="상대">
          {foes.map((c) => (
            <li key={c.id}>
              <Seat c={c} state={state} />
            </li>
          ))}
        </ul>
      )}

      <ul className={styles.party} aria-label="캐릭터">
        {pcs.map((c) => (
          <li key={c.id} data-out={c.takenOut || undefined}>
            <Seat c={c} state={state} />
            <span className={styles.fate} aria-label={`운명점 ${c.fatePoints}`}>
              {c.fatePoints}
            </span>
          </li>
        ))}
      </ul>

      {!started && (
        <button
          type="button"
          className={styles.start}
          onClick={() => {
            setStarted(true);
            void document.documentElement.requestFullscreen?.().catch(() => {});
          }}
        >
          눌러서 시작
          <small>전체 화면 · 배경음과 음악 켜기</small>
        </button>
      )}
    </main>
  );
}

function Seat({ c, state }: { c: Character; state: RoomState }) {
  const cons = Object.values(c.consequences)
    .map((x) => (x ? state.aspects[x.aspectId]?.text : undefined))
    .filter((t): t is string => !!t);
  return (
    <>
      <span className={styles.face}>
        {c.portraitUrl ? <img src={c.portraitUrl} alt="" /> : initialOf(c.name)}
      </span>
      <span className={styles.who}>
        <b>{c.name}</b>
        <span
          className={styles.stress}
          aria-label={`스트레스 ${c.stress.filter(Boolean).length}/3`}
        >
          {c.stress.map((on, i) => (
            <i key={i} data-on={on || undefined} />
          ))}
        </span>
        {cons.length > 0 && <small>{cons.join(' · ')}</small>}
      </span>
    </>
  );
}
