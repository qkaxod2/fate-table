'use client';

import { term } from '@fate/glossary';
import type { Character, Command, RoomEvent, RoomState, Zone } from '@fate/rules-engine';
import {
  useLayoutEffect,
  useRef,
  useState,
  type DragEvent,
  type RefObject,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { playSfx } from '@/fx/sfx';
import styles from './ZoneMap.module.css';

interface Props {
  state: RoomState;
  run: (cmd: Command) => Promise<RoomEvent[]>;
  isGm: boolean;
  canControl: (c: Character | undefined) => boolean;
  pending: boolean;
  /** 굴림 중엔 접고(hidden), 결과가 남아 있을 땐 낮게(compact) 보여 준다. 사용자가 누르면 그 선택을 따른다 */
  auto?: 'full' | 'compact' | 'hidden';
}

type Tool = 'move' | 'link';

/** 토큰 이동 요청 번호. 같은 토큰을 연달아 옮겼을 때 나중 요청을 가려낸다 */
let moveSeq = 0;

const clamp = (n: number) => Math.min(96, Math.max(4, Math.round(n)));

/**
 * 구역 지도. 구역은 0~100(%) 좌표에 놓이고, 연결선은 이동할 수 있는 길이다.
 * 누구나 자기 캐릭터 토큰을 끌어다(또는 눌러 고른 뒤 구역을 눌러) 옮기고, GM은 편집 모드에서 구역을 만들고 옮기고 잇는다.
 */
export function ZoneMap({ state, run, isGm, canControl, pending, auto = 'full' }: Props) {
  const scene = state.scene;
  const box = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);
  const [tool, setTool] = useState<Tool>('move');
  const [picked, setPicked] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [placing, setPlacing] = useState<{ x: number; y: number } | null>(null);
  const [newName, setNewName] = useState('');
  const [drag, setDrag] = useState<{ id: string; x: number; y: number; moved: boolean } | null>(
    null,
  );
  const [aspectText, setAspectText] = useState('');
  const [rename, setRename] = useState('');
  const [userOpen, setUserOpen] = useState<boolean | null>(null);
  // 서버 답을 기다리지 않고 옮긴 자리를 먼저 그린다. 답이 오면 서버 상태로 돌아가고, 실패하면 제자리로 미끄러져 돌아간다
  const [moving, setMoving] = useState<Record<string, { zoneId: string | null; req: number }>>({});
  const tokens: Record<string, string | null | undefined> = { ...state.tokens };
  for (const [id, m] of Object.entries(moving)) tokens[id] = m.zoneId;
  useTokenGlide(box, tokens);

  if (!scene) return null;
  const zones = Object.values(scene.zones);
  if (zones.length === 0 && !isGm) return null;

  const characters = Object.values(state.characters);
  const inZone = (zoneId: string) => characters.filter((c) => tokens[c.id] === zoneId);
  const outside = characters.filter((c) => !tokens[c.id] || !scene.zones[tokens[c.id]!]);
  const posOf = (z: Zone) => (drag?.id === z.id ? { x: drag.x, y: drag.y } : { x: z.x, y: z.y });

  const pointPct = (clientX: number, clientY: number) => {
    const r = box.current!.getBoundingClientRect();
    return {
      x: clamp(((clientX - r.left) / r.width) * 100),
      y: clamp(((clientY - r.top) / r.height) * 100),
    };
  };

  const moveToken = (characterId: string, zoneId: string | null) => {
    setPicked(null);
    if ((tokens[characterId] ?? null) === zoneId) return;
    const req = ++moveSeq;
    setMoving((m) => ({ ...m, [characterId]: { zoneId, req } }));
    // 같은 토큰을 그사이 또 옮겼다면 나중 것을 남긴다
    const settle = () =>
      setMoving((m) => {
        if (m[characterId]?.req !== req) return m;
        const rest = { ...m };
        delete rest[characterId];
        return rest;
      });
    run({ type: 'token.move', payload: { characterId, zoneId } }).then(settle, settle);
  };

  const onZoneClick = (z: Zone) => {
    if (editing) {
      if (tool === 'link' && selected && selected !== z.id) {
        const linked = scene.zones[selected]?.links.includes(z.id);
        void run({
          type: linked ? 'zone.unlink' : 'zone.link',
          payload: { from: selected, to: z.id },
        });
        setTool('move');
        return;
      }
      setSelected(z.id === selected ? null : z.id);
      setRename(z.name);
      return;
    }
    if (picked) moveToken(picked, z.id);
  };

  const onZonePointerDown = (e: ReactPointerEvent, z: Zone) => {
    if (!editing || tool !== 'move') return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ id: z.id, x: z.x, y: z.y, moved: false });
  };
  const onZonePointerMove = (e: ReactPointerEvent) => {
    if (!drag) return;
    const p = pointPct(e.clientX, e.clientY);
    const moved = drag.moved || Math.abs(p.x - drag.x) + Math.abs(p.y - drag.y) > 1;
    setDrag({ ...drag, ...p, moved });
  };
  const onZonePointerUp = (z: Zone) => {
    if (!drag) return;
    const d = drag;
    setDrag(null);
    if (d.moved) void run({ type: 'zone.update', payload: { zoneId: z.id, x: d.x, y: d.y } });
    else onZoneClick(z);
  };

  const sel = selected ? scene.zones[selected] : undefined;
  const open = editing || (userOpen ?? (auto !== 'hidden' && zones.length > 0));
  const compact = !editing && userOpen === null && auto === 'compact';

  const token = (c: Character) => {
    const mine = canControl(c);
    return (
      <button
        key={c.id}
        type="button"
        className={styles.token}
        data-token={c.id}
        data-npc={c.isNpc || undefined}
        data-out={c.takenOut || undefined}
        data-picked={picked === c.id || undefined}
        disabled={!mine || editing}
        draggable={mine && !editing}
        title={c.name}
        onDragStart={(e) => {
          e.dataTransfer.setData('text/fate-token', c.id);
          e.dataTransfer.effectAllowed = 'move';
        }}
        onClick={(e) => {
          e.stopPropagation();
          setPicked(picked === c.id ? null : c.id);
        }}
      >
        {c.portraitUrl ? <img src={c.portraitUrl} alt="" /> : <span>{c.name.slice(0, 1)}</span>}
        <small>{c.name}</small>
      </button>
    );
  };

  const dropProps = (zoneId: string | null) => ({
    onDragOver: (e: DragEvent) => {
      if (e.dataTransfer.types.includes('text/fate-token')) e.preventDefault();
    },
    onDrop: (e: DragEvent) => {
      const id = e.dataTransfer.getData('text/fate-token');
      if (id) {
        e.preventDefault();
        moveToken(id, zoneId);
      }
    },
  });

  return (
    <section className={styles.wrap} aria-label={`${term('zone')} 지도`}>
      <div className={styles.head}>
        <span className={styles.kicker}>MAP · {term('zone')}</span>
        {picked && !editing && <span className={styles.hint}>옮길 구역을 눌러 주세요</span>}
        <button
          type="button"
          className={styles.fold}
          aria-expanded={open}
          onClick={() => setUserOpen(!open)}
        >
          {open ? '접기' : '펼치기'}
        </button>
        {isGm && (
          <button
            type="button"
            className={styles.toggle}
            aria-pressed={editing}
            onClick={() => {
              setEditing(!editing);
              setSelected(null);
              setPlacing(null);
              setTool('move');
            }}
          >
            {editing ? '편집 끝' : '지도 편집'}
          </button>
        )}
      </div>

      {open && (
        <div
          ref={box}
          className={styles.map}
          data-map
          data-compact={compact || undefined}
          data-editing={editing || undefined}
          onClick={(e) => {
            if (!editing || e.target !== e.currentTarget) return;
            setSelected(null);
            setPlacing(pointPct(e.clientX, e.clientY));
            setNewName('');
          }}
        >
          <svg
            className={styles.links}
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden
          >
            {zones.flatMap((z) =>
              z.links
                .filter((l) => l > z.id && scene.zones[l])
                .map((l) => {
                  const a = posOf(z);
                  const b = posOf(scene.zones[l]!);
                  return <line key={`${z.id}-${l}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />;
                }),
            )}
          </svg>

          {zones.length === 0 && (
            <p className={styles.empty}>
              {editing
                ? '빈 곳을 눌러 첫 구역을 놓아 보세요.'
                : '지도 편집을 눌러 구역을 만들어요.'}
            </p>
          )}

          {zones.map((z) => {
            const p = posOf(z);
            const aspects = Object.values(state.aspects).filter(
              (a) => a.ownerType === 'zone' && a.ownerId === z.id,
            );
            return (
              <div
                key={z.id}
                className={styles.zone}
                data-zone={z.name}
                style={{
                  left: `clamp(48px, ${p.x}%, calc(100% - 48px))`,
                  top: `clamp(50px, ${p.y}%, calc(100% - 50px))`,
                }}
                data-selected={selected === z.id || undefined}
                data-target={(!!picked && !editing) || undefined}
                data-linking={(editing && tool === 'link' && selected !== z.id) || undefined}
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!editing || tool === 'link') onZoneClick(z);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onZoneClick(z);
                }}
                onPointerDown={(e) => onZonePointerDown(e, z)}
                onPointerMove={onZonePointerMove}
                onPointerUp={() => onZonePointerUp(z)}
                {...dropProps(z.id)}
              >
                <div className={styles.zoneName}>{z.name}</div>
                {aspects.map((a) => (
                  <div key={a.id} className={styles.zoneAspect} data-hidden={a.hidden || undefined}>
                    {a.text}
                    {a.freeInvokes > 0 && ' ' + '●'.repeat(a.freeInvokes)}
                  </div>
                ))}
                {inZone(z.id).length > 0 && (
                  <div className={styles.tokens}>{inZone(z.id).map(token)}</div>
                )}
              </div>
            );
          })}

          {placing && (
            <form
              className={styles.placer}
              style={{ left: `${placing.x}%`, top: `${placing.y}%` }}
              onClick={(e) => e.stopPropagation()}
              onSubmit={(e) => {
                e.preventDefault();
                if (!newName.trim()) return;
                void run({ type: 'zone.add', payload: { name: newName.trim(), ...placing } });
                setPlacing(null);
              }}
            >
              <input
                autoFocus
                placeholder="구역 이름"
                value={newName}
                maxLength={30}
                onChange={(e) => setNewName(e.target.value)}
              />
              <button type="submit" disabled={pending || !newName.trim()}>
                놓기
              </button>
              <button type="button" className={styles.ghost} onClick={() => setPlacing(null)}>
                취소
              </button>
            </form>
          )}
        </div>
      )}

      {editing && sel && (
        <div className={styles.tools}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (rename.trim() && rename.trim() !== sel.name)
                void run({ type: 'zone.update', payload: { zoneId: sel.id, name: rename.trim() } });
            }}
          >
            <input value={rename} maxLength={30} onChange={(e) => setRename(e.target.value)} />
            <button type="submit" disabled={pending}>
              이름 바꾸기
            </button>
          </form>
          <button
            type="button"
            aria-pressed={tool === 'link'}
            onClick={() => setTool(tool === 'link' ? 'move' : 'link')}
          >
            {tool === 'link' ? '이을 구역을 누르세요' : '길 잇기 · 끊기'}
          </button>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!aspectText.trim()) return;
              void run({
                type: 'aspect.add',
                payload: {
                  ownerType: 'zone',
                  ownerId: sel.id,
                  kind: 'situation',
                  text: aspectText.trim(),
                  freeInvokes: 0,
                  hidden: false,
                },
              });
              setAspectText('');
            }}
          >
            <input
              placeholder={`구역 ${term('aspect')}`}
              value={aspectText}
              maxLength={60}
              onChange={(e) => setAspectText(e.target.value)}
            />
            <button type="submit" disabled={pending || !aspectText.trim()}>
              붙이기
            </button>
          </form>
          <button
            type="button"
            className={styles.danger}
            disabled={pending}
            onClick={() => {
              void run({ type: 'zone.remove', payload: { zoneId: sel.id } });
              setSelected(null);
            }}
          >
            구역 지우기
          </button>
        </div>
      )}

      {open && zones.length > 0 && outside.length > 0 && (
        <div className={styles.outside} data-outside {...dropProps(null)}>
          <span className={styles.hint}>지도 밖</span>
          {outside.map(token)}
          {picked && tokens[picked] && (
            <button type="button" className={styles.ghost} onClick={() => moveToken(picked, null)}>
              여기로 빼기
            </button>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * 토큰이 다른 구역으로 옮겨지면 순간이동하지 않고 원래 자리에서 새 자리로 미끄러져 간다.
 * 그린 뒤 위치를 재어 두고, 구역이 바뀐 토큰만 예전 자리에서부터 날아오게 한다(FLIP).
 * 구역을 끌어 옮길 때처럼 구역이 그대로면 따라 움직이기만 한다.
 */
function useTokenGlide(
  box: RefObject<HTMLDivElement | null>,
  tokens: Record<string, string | null | undefined>,
) {
  const last = useRef(new Map<string, { zone: string | null; x: number; y: number }>());
  useLayoutEffect(() => {
    const section = box.current?.closest('section');
    const seen = new Map<string, { zone: string | null; x: number; y: number }>();
    if (!section) {
      last.current = seen;
      return;
    }
    const still =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    for (const el of section.querySelectorAll<HTMLElement>('[data-token]')) {
      const id = el.dataset.token!;
      const r = el.getBoundingClientRect();
      const now = { zone: tokens[id] ?? null, x: r.left, y: r.top };
      seen.set(id, now);
      const before = last.current.get(id);
      if (still || !before || before.zone === now.zone) continue;
      const dx = before.x - now.x;
      const dy = before.y - now.y;
      if (Math.abs(dx) + Math.abs(dy) < 2) continue;
      // 지나가는 길에 다른 구역 밑으로 숨지 않도록 도착 구역을 잠깐 위로 올린다
      const zone = el.closest<HTMLElement>('[data-zone]');
      if (zone) zone.style.zIndex = '2';
      const lift = Math.min(60, Math.hypot(dx, dy) * 0.25 + 12);
      const anim = el.animate(
        [
          { translate: `${dx}px ${dy}px`, scale: '1' },
          { translate: `${dx * 0.5}px ${dy * 0.5 - lift}px`, scale: '1.18', offset: 0.5 },
          { translate: '0 0', scale: '0.92', offset: 0.85 },
          { translate: '0 0', scale: '1' },
        ],
        { duration: 520, easing: 'cubic-bezier(.45,0,.3,1)' },
      );
      el.dataset.landing = '';
      // 내려앉을 때 말이 판에 닿는 작은 소리
      const knock = window.setTimeout(() => playSfx('dice-settle', 0.12, 1.5), 440);
      const done = () => {
        window.clearTimeout(knock);
        delete el.dataset.landing;
        if (zone) zone.style.zIndex = '';
      };
      anim.finished.then(done, done);
    }
    last.current = seen;
  });
}
