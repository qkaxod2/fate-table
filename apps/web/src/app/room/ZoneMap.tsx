'use client';

import { term } from '@fate/glossary';
import type { Character, Command, RoomEvent, RoomState, Zone } from '@fate/rules-engine';
import { useRef, useState, type DragEvent, type PointerEvent as ReactPointerEvent } from 'react';
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

  if (!scene) return null;
  const zones = Object.values(scene.zones);
  if (zones.length === 0 && !isGm) return null;

  const characters = Object.values(state.characters);
  const inZone = (zoneId: string) => characters.filter((c) => state.tokens[c.id] === zoneId);
  const outside = characters.filter(
    (c) => !state.tokens[c.id] || !scene.zones[state.tokens[c.id]!],
  );
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
    if ((state.tokens[characterId] ?? null) === zoneId) return;
    void run({ type: 'token.move', payload: { characterId, zoneId } });
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
          {picked && state.tokens[picked] && (
            <button type="button" className={styles.ghost} onClick={() => moveToken(picked, null)}>
              여기로 빼기
            </button>
          )}
        </div>
      )}
    </section>
  );
}
