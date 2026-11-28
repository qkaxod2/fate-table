'use client';

// GM 자료(핸드아웃): 단서 · 편지 · 지도 · 쪽지를 계정 보관함에 만들어 두고,
// 모두에게 또는 고른 플레이어에게만 보여 준다. GM 메모는 보관함에만 남고 방에는 가지 않는다.
import { hasVisibleText, type Command, type RoomEvent, type RoomState } from '@fate/rules-engine';
import { useEffect, useRef, useState } from 'react';
import { audienceOf } from '@/components/handout/Handout';
import {
  deleteHandout,
  listBackdrops,
  listHandouts,
  saveHandout,
  showHandoutCommand,
  type SavedBackdrop,
  type SavedHandout,
} from '@/lib/gmLibrary';
import { BACKDROP_UPLOAD, UploadError, uploadImage } from '@/lib/uploadImage';
import styles from './GmConsole.module.css';
import hs from './HandoutPanel.module.css';

type Run = (cmd: Command) => Promise<RoomEvent[]>;

type Mode =
  | { kind: 'list' }
  | { kind: 'edit'; item: SavedHandout | null }
  | { kind: 'show'; item: SavedHandout };

export function HandoutPanel({
  state,
  run,
  pending,
}: {
  state: RoomState;
  run: Run;
  pending: boolean;
}) {
  const [items, setItems] = useState<SavedHandout[] | null>(null);
  const [error, setError] = useState(false);
  const [mode, setMode] = useState<Mode>({ kind: 'list' });
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    listHandouts()
      .then(setItems)
      .catch(() => setError(true));
  }, []);

  if (error) return <p className={styles.help}>자료 보관함을 읽지 못함. 잠시 뒤 다시</p>;
  if (!items) return <p className={styles.help}>자료 보관함 읽는 중…</p>;

  if (mode.kind === 'edit')
    return (
      <HandoutForm
        item={mode.item}
        onCancel={() => setMode({ kind: 'list' })}
        onSaved={(h) => {
          setItems((xs) => [h, ...(xs ?? []).filter((x) => x.key !== h.key)]);
          setNote(
            state.handouts?.[h.key]
              ? `'${h.title}' 저장. 이미 보여 준 자료는 다시 보여 주면 고친 내용으로 바뀐다`
              : `'${h.title}' 저장`,
          );
          setMode({ kind: 'list' });
        }}
      />
    );

  if (mode.kind === 'show')
    return (
      <ShowTo
        item={mode.item}
        state={state}
        run={run}
        pending={pending}
        onDone={(said) => {
          setNote(said);
          setMode({ kind: 'list' });
        }}
        onCancel={() => setMode({ kind: 'list' })}
      />
    );

  return (
    <>
      <p className={styles.help}>
        단서 · 편지 · 지도처럼 플레이어에게 띄워 줄 글과 그림. 계정에 남아 어느 방에서나 쓰고,
        모두에게 또는 고른 사람에게만 보여 준다. GM 메모는 나만 본다.
      </p>
      <div className={styles.chips}>
        <button type="button" onClick={() => setMode({ kind: 'edit', item: null })}>
          + 새 자료
        </button>
      </div>
      {items.length === 0 ? (
        <p className={styles.help}>아직 만든 자료 없음.</p>
      ) : (
        <ul className={styles.library}>
          {items.map((h) => {
            const shown = state.handouts?.[h.key];
            return (
              <li key={h.key} className={hs.row}>
                <span className={hs.thumb} aria-hidden>
                  {h.imageUrl ? <img src={h.imageUrl} alt="" /> : '✉'}
                </span>
                <span>
                  <b>{h.title}</b>
                  <small data-shown={shown ? '' : undefined} className={hs.status}>
                    {shown ? `보여 줌 · ${audienceOf(shown, state)}` : '아직 안 보여 줌'}
                  </small>
                  {h.gmNotes && <small title={h.gmNotes}>GM 메모: {h.gmNotes}</small>}
                </span>
                <span className={hs.actions}>
                  <button
                    type="button"
                    className={styles.primary}
                    disabled={pending}
                    onClick={() => setMode({ kind: 'show', item: h })}
                  >
                    보여 주기
                  </button>
                  {shown && (
                    <button
                      type="button"
                      className={styles.ghost}
                      disabled={pending}
                      onClick={async () => {
                        const evs = await run({
                          type: 'handout.hide',
                          payload: { handoutId: h.key },
                        });
                        if (evs.length) setNote(`'${h.title}'을 거뒀다`);
                      }}
                    >
                      거두기
                    </button>
                  )}
                  <button
                    type="button"
                    className={styles.ghost}
                    onClick={() => setMode({ kind: 'edit', item: h })}
                  >
                    고치기
                  </button>
                  <button
                    type="button"
                    className={styles.ghost}
                    aria-label={`${h.title} 보관함에서 지우기`}
                    onClick={async () => {
                      setItems((xs) => xs?.filter((x) => x.key !== h.key) ?? null);
                      try {
                        await deleteHandout(h.key);
                      } catch {
                        setItems((xs) => [h, ...(xs ?? [])]);
                        setNote('지우지 못함. 잠시 뒤 다시 시도');
                      }
                    }}
                  >
                    지우기
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {note && (
        <p className={styles.help} role="status">
          {note}
        </p>
      )}
    </>
  );
}

/** 누구에게 보여 줄지: 모두, 또는 고른 플레이어 */
function ShowTo({
  item,
  state,
  run,
  pending,
  onDone,
  onCancel,
}: {
  item: SavedHandout;
  state: RoomState;
  run: Run;
  pending: boolean;
  onDone: (said: string) => void;
  onCancel: () => void;
}) {
  const players = Object.values(state.members).filter((m) => m.role === 'player');
  const pcOf = (userId: string) =>
    Object.values(state.characters).find((c) => !c.isNpc && c.ownerId === userId)?.name;
  const [picked, setPicked] = useState<string[]>([]);
  const send = async (to: string[]) => {
    const evs = await run(showHandoutCommand(item, to));
    if (!evs.length) return;
    onDone(
      to.length
        ? `'${item.title}'을 ${to.map((u) => state.members[u]?.nickname ?? '').join(', ')}에게 보여 줬다`
        : `'${item.title}'을 모두에게 보여 줬다`,
    );
  };
  return (
    <div className={styles.form}>
      <p className={styles.help}>
        <b>{item.title}</b>을 누구에게 보여 줄까? 고른 사람만 보고, 다른 사람 화면과 기록에는 남지
        않는다.
      </p>
      {players.length > 0 ? (
        <div className={styles.chips} role="group" aria-label="받을 사람">
          {players.map((m) => {
            const on = picked.includes(m.userId);
            const pc = pcOf(m.userId);
            return (
              <button
                key={m.userId}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  setPicked((xs) => (on ? xs.filter((x) => x !== m.userId) : [...xs, m.userId]))
                }
              >
                {m.nickname}
                {pc && pc !== m.nickname ? ` (${pc})` : ''}
              </button>
            );
          })}
        </div>
      ) : (
        <p className={styles.help}>
          아직 들어온 플레이어 없음. 모두에게 보여 두면 나중에 온 사람도 본다.
        </p>
      )}
      <div className={hs.buttons}>
        <button type="button" className={styles.ghost} onClick={onCancel}>
          뒤로
        </button>
        <button
          type="button"
          className={picked.length ? styles.primary : styles.ghost}
          disabled={pending || picked.length === 0}
          onClick={() => void send(picked)}
        >
          고른 {picked.length}명에게
        </button>
        <button
          type="button"
          className={picked.length ? styles.ghost : styles.primary}
          disabled={pending}
          onClick={() => void send([])}
        >
          모두에게 보여 주기
        </button>
      </div>
    </div>
  );
}

/** 자료 만들기 · 고치기: 제목, 그림(올리기 · 내 배경에서 고르기), 본문, GM 메모 */
function HandoutForm({
  item,
  onCancel,
  onSaved,
}: {
  item: SavedHandout | null;
  onCancel: () => void;
  onSaved: (h: SavedHandout) => void;
}) {
  const [title, setTitle] = useState(item?.title ?? '');
  const [body, setBody] = useState(item?.body ?? '');
  const [gmNotes, setGmNotes] = useState(item?.gmNotes ?? '');
  const [imageUrl, setImageUrl] = useState(item?.imageUrl ?? '');
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [mine, setMine] = useState<SavedBackdrop[] | null>(null);
  const file = useRef<HTMLInputElement>(null);

  async function take(f: File | undefined) {
    if (!f) return;
    setBusy('그림 올리는 중…');
    setNote(null);
    try {
      setImageUrl(await uploadImage(f, BACKDROP_UPLOAD));
    } catch (e) {
      setNote(e instanceof UploadError ? e.message : '그림을 올리지 못함. 잠시 뒤 다시 시도');
    }
    setBusy(null);
  }

  return (
    <form
      className={styles.form}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        void take([...e.dataTransfer.files].find((f) => f.type.startsWith('image/')));
      }}
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy('저장하는 중…');
        try {
          onSaved(
            await saveHandout({
              ...(item ? { key: item.key } : {}),
              title,
              body,
              gmNotes,
              ...(imageUrl ? { imageUrl } : {}),
            }),
          );
        } catch {
          setNote('저장하지 못함. 잠시 뒤 다시 시도');
          setBusy(null);
        }
      }}
    >
      <label className={styles.field}>
        제목
        <input
          autoFocus
          placeholder="예: 찢어진 편지, 등대 지도"
          value={title}
          maxLength={60}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <div className={styles.field}>
        그림 <small>(선택 · 끌어다 놓아도 된다)</small>
        {imageUrl && (
          <span className={hs.preview}>
            {}
            <img src={imageUrl} alt="" />
          </span>
        )}
        <span className={hs.buttons} data-start="">
          <button
            type="button"
            className={styles.ghost}
            disabled={!!busy}
            onClick={() => file.current?.click()}
          >
            {imageUrl ? '다른 그림 올리기' : '그림 올리기'}
          </button>
          <button
            type="button"
            className={styles.ghost}
            aria-pressed={mine !== null}
            onClick={() =>
              mine
                ? setMine(null)
                : void listBackdrops()
                    .then(setMine)
                    .catch(() => setNote('내 배경을 읽지 못함'))
            }
          >
            내 배경에서 고르기
          </button>
          {imageUrl && (
            <button type="button" className={styles.ghost} onClick={() => setImageUrl('')}>
              그림 빼기
            </button>
          )}
        </span>
        <input
          ref={file}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            void take(f);
          }}
        />
        {mine &&
          (mine.length === 0 ? (
            <small>내 배경 없음. 배경 · 분위기에서 올린 그림이 여기에 보인다</small>
          ) : (
            <span className={hs.pick}>
              {mine.map((b) => (
                <button
                  key={b.key}
                  type="button"
                  title={b.name}
                  aria-pressed={imageUrl === b.url}
                  onClick={() => {
                    setImageUrl(b.url);
                    setMine(null);
                  }}
                >
                  {}
                  <img src={b.url} alt={b.name} />
                </button>
              ))}
            </span>
          ))}
      </div>
      <label className={styles.field}>
        본문 <small>(플레이어가 보는 글 · **굵게** *기울임*)</small>
        <textarea
          rows={5}
          placeholder="예: 자정, 세 번째 부두. 혼자 와라."
          value={body}
          maxLength={4000}
          onChange={(e) => setBody(e.target.value)}
        />
      </label>
      <label className={styles.field}>
        GM 메모 <small>(나만 본다 · 방에는 가지 않는다)</small>
        <textarea
          rows={2}
          placeholder="예: 쓴 사람은 항구 관리인. 필체를 비교하면 들킨다"
          value={gmNotes}
          maxLength={4000}
          onChange={(e) => setGmNotes(e.target.value)}
        />
      </label>
      {note && (
        <p className={styles.help} role="status">
          {note}
        </p>
      )}
      <div className={hs.buttons}>
        <button type="button" className={styles.ghost} onClick={onCancel}>
          취소
        </button>
        <button
          type="submit"
          className={styles.primary}
          disabled={!!busy || !hasVisibleText(title)}
        >
          {busy ?? (item ? '고친 내용 저장' : '보관함에 저장')}
        </button>
      </div>
    </form>
  );
}
