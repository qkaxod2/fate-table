'use client';

// GM 준비함: 세션 전에 장면(배경·분위기·특성·NPC·강요 메모)을 만들어 두고 클릭 한 번으로 연다.
// NPC 보관함: 자주 쓰는 졸개·조연·보스를 계정에 두고 어느 방에서나 바로 부른다.
import { term } from '@fate/glossary';
import { hasVisibleText, type Command, type RoomEvent, type RoomState } from '@fate/rules-engine';
import { useEffect, useRef, useState } from 'react';
import {
  deleteNpc,
  deleteScene,
  listNpcs,
  listScenes,
  openPreset,
  presetFromScene,
  saveNpc,
  saveScene,
  type NpcPayload,
  type SavedNpc,
  type ScenePreset,
} from '@/lib/gmLibrary';
import { mergeNpcs, npcsJson, readNpcs } from '@/lib/npcJson';
import styles from './GmConsole.module.css';

type Run = (cmd: Command) => Promise<RoomEvent[]>;

function useLibrary<T>(load: () => Promise<T[]>) {
  const [items, setItems] = useState<T[] | null>(null);
  const [error, setError] = useState(false);
  const reload = () =>
    load()
      .then((x) => {
        setItems(x);
        setError(false);
      })
      .catch(() => setError(true));
  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { items, error, reload };
}

/** NPC 보관함: 눌러서 이 방에 부르기, 지우기, JSON으로 내려받거나 올리기 */
export function NpcLibrary({ run, pending }: { run: Run; pending: boolean }) {
  const { items, error, reload } = useLibrary<SavedNpc>(listNpcs);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  if (error) return <p className={styles.help}>보관함을 읽지 못함. 잠시 뒤 다시</p>;
  if (!items) return <p className={styles.help}>보관함 읽는 중…</p>;
  const download = () => {
    const blob = new Blob([npcsJson(items)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'npcs.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const upload = async (f: File) => {
    setNote('올리는 중…');
    let got;
    try {
      got = readNpcs(JSON.parse(await f.text()));
    } catch {
      setNote('JSON 파일을 읽지 못했다');
      return;
    }
    if (!got.length) {
      setNote('이 파일에서 NPC를 찾지 못했다');
      return;
    }
    const { fresh, portraits } = mergeNpcs(items, got);
    try {
      for (const n of fresh) await saveNpc(n);
      for (const x of portraits) await saveNpc(x.npc, x.key);
    } catch {
      setNote('보관함에 저장하지 못했다. 잠시 뒤 다시');
      void reload();
      return;
    }
    const said = [
      fresh.length ? `NPC ${fresh.length}명을 보관함에 더했다` : '',
      portraits.length ? `${portraits.length}명에게 초상화를 입혔다` : '',
    ].filter(Boolean);
    setNote(said.length ? said.join(', ') : '모두 이미 보관함에 있다');
    void reload();
  };
  return (
    <>
      {items.length === 0 ? (
        <p className={styles.help}>
          보관한 NPC 없음. NPC 시트의 &lsquo;NPC 보관&rsquo;이나 아래 만들기, JSON 올리기로 저장할
          수 있다.
        </p>
      ) : (
        <ul className={styles.library}>
          {items.map((n) => (
            <li key={n.key}>
              <span>
                <b>{n.npc.name}</b>
                <small>{n.npc.highConcept}</small>
              </span>
              <button
                type="button"
                className={styles.ghost}
                disabled={pending || busy === n.key}
                onClick={async () => {
                  setBusy(n.key);
                  await run({ type: 'character.create', payload: { ...n.npc, isNpc: true } });
                  setBusy(null);
                }}
              >
                부르기
              </button>
              <button
                type="button"
                className={styles.ghost}
                aria-label={`${n.npc.name} 보관함에서 지우기`}
                onClick={() => void deleteNpc(n.key).then(reload)}
              >
                지우기
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className={styles.libraryFile}>
        <button type="button" className={styles.ghost} onClick={() => file.current?.click()}>
          JSON 올리기
        </button>
        <button type="button" className={styles.ghost} disabled={!items.length} onClick={download}>
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
      {note && (
        <p className={styles.help} role="status">
          {note}
        </p>
      )}
    </>
  );
}

/** 장면 준비함 */
export function PrepPanel({
  state,
  run,
  pending,
  onClose,
}: {
  state: RoomState;
  run: Run;
  pending: boolean;
  onClose: () => void;
}) {
  const scenes = useLibrary<ScenePreset>(listScenes);
  const npcs = useLibrary<SavedNpc>(listNpcs);
  const [opening, setOpening] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [msg, setMsg] = useState('');

  const open = async (p: ScenePreset) => {
    setOpening(p.key);
    const ok = await openPreset(p, state, run);
    setOpening(null);
    if (ok) onClose();
  };

  const snapshotCurrent = async () => {
    const p = presetFromScene(state);
    if (!p) return;
    try {
      await saveScene(p);
      setMsg(`'${p.name}'을 준비함에 저장`);
      void scenes.reload();
    } catch {
      setMsg('저장하지 못함');
    }
  };

  return (
    <>
      <p className={styles.help}>
        장면 이름 · {term('situation')} · 분위기 · NPC · {term('compel')} 메모를 미리 묶어 두고,
        플레이 중에 눌러서 한 번에 연다.
      </p>
      <div className={styles.chips}>
        <button type="button" aria-pressed={editing} onClick={() => setEditing((e) => !e)}>
          + 새 장면 준비
        </button>
        {state.scene && (
          <button type="button" onClick={() => void snapshotCurrent()}>
            지금 장면을 준비함에 저장
          </button>
        )}
      </div>
      {msg && <p className={styles.help}>{msg}</p>}
      {editing && (
        <PresetForm
          npcs={npcs.items ?? []}
          onSaved={() => {
            setEditing(false);
            void scenes.reload();
          }}
        />
      )}
      <h3 className={styles.sub}>준비한 장면</h3>
      {scenes.error && <p className={styles.help}>준비함을 읽지 못함</p>}
      {scenes.items?.length === 0 && <p className={styles.help}>아직 준비한 장면 없음</p>}
      <ul className={styles.library}>
        {(scenes.items ?? []).map((p) => (
          <li key={p.key}>
            <span>
              <b>{p.name}</b>
              <small>
                {[
                  p.aspects.length ? `${term('aspect')} ${p.aspects.length}` : '',
                  p.npcs.length ? `NPC ${p.npcs.map((n) => n.name).join(', ')}` : '',
                  p.memo ? '메모' : '',
                ]
                  .filter(Boolean)
                  .join(' · ') || '이름만'}
              </small>
            </span>
            <button
              type="button"
              className={styles.primary}
              disabled={pending || opening !== null}
              onClick={() => void open(p)}
            >
              {opening === p.key ? '여는 중…' : state.scene ? '이 장면으로 넘어가기' : '열기'}
            </button>
            <button
              type="button"
              className={styles.ghost}
              aria-label={`${p.name} 준비함에서 지우기`}
              onClick={() => void deleteScene(p.key).then(scenes.reload)}
            >
              지우기
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

function PresetForm({ npcs, onSaved }: { npcs: SavedNpc[]; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [aspects, setAspects] = useState([
    { text: '', hidden: false },
    { text: '', hidden: false },
    { text: '', hidden: true },
  ]);
  const [picked, setPicked] = useState<string[]>([]);
  const [memo, setMemo] = useState('');
  const [saving, setSaving] = useState(false);
  return (
    <form
      className={styles.form}
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        const chosen: NpcPayload[] = npcs.filter((n) => picked.includes(n.key)).map((n) => n.npc);
        try {
          await saveScene({
            name: name.trim(),
            aspects: aspects.map((a) => ({ ...a, text: a.text.trim() })).filter((a) => a.text),
            npcs: chosen,
            ...(memo.trim() ? { memo: memo.trim() } : {}),
          });
          onSaved();
        } finally {
          setSaving(false);
        }
      }}
    >
      <label className={styles.field}>
        장면 이름
        <input
          autoFocus
          placeholder="예: 비 오는 부두"
          value={name}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <div className={styles.field}>
        {term('situation')} <small>(숨김을 켜면 플레이어에게 안 보이다가 GM이 공개)</small>
        {aspects.map((a, i) => (
          <span key={i} className={styles.row}>
            <input
              placeholder={['짙은 안개', '미끄러운 갑판', '숨은 저격수'][i]}
              value={a.text}
              maxLength={80}
              onChange={(e) =>
                setAspects((x) => x.map((y, j) => (j === i ? { ...y, text: e.target.value } : y)))
              }
            />
            <button
              type="button"
              aria-pressed={a.hidden}
              onClick={() =>
                setAspects((x) => x.map((y, j) => (j === i ? { ...y, hidden: !y.hidden } : y)))
              }
            >
              숨김
            </button>
          </span>
        ))}
      </div>
      {npcs.length > 0 && (
        <div className={styles.field}>
          등장 NPC <small>(NPC 보관함에서)</small>
          <div className={styles.chips}>
            {npcs.map((n) => (
              <button
                key={n.key}
                type="button"
                aria-pressed={picked.includes(n.key)}
                onClick={() =>
                  setPicked((x) =>
                    x.includes(n.key) ? x.filter((k) => k !== n.key) : [...x, n.key],
                  )
                }
              >
                {n.npc.name}
              </button>
            ))}
          </div>
        </div>
      )}
      <label className={styles.field}>
        {term('compel')} 아이디어 · 메모 <small>(열 때 GM 메모로 남는다)</small>
        <textarea
          rows={3}
          value={memo}
          maxLength={1000}
          placeholder="예: 하윤의 맹세 — 인질을 앞세우면 칼을 거둔다"
          onChange={(e) => setMemo(e.target.value)}
        />
      </label>
      <button type="submit" className={styles.primary} disabled={saving || !hasVisibleText(name)}>
        준비함에 저장
      </button>
    </form>
  );
}
