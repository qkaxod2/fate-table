'use client';

import { EXPRESSIONS, findPreset } from '@fate/portrait';
import type { Character, Command, RoomEvent, RoomState } from '@fate/rules-engine';
import { useState } from 'react';
import { MediaStudio, type Drawn } from '@/components/media/MediaStudio';
import { toast } from '@/components/ui/Toast';
import { PortraitError, generateImage } from '@/lib/portraitApi';
import styles from './ArtDialog.module.css';
import gm from './GmConsole.module.css';
import { Modal } from './GmConsole';

type Run = (cmd: Command) => Promise<RoomEvent[]>;

export type ArtTab = 'scene' | 'portrait' | 'standing' | 'face';
export interface ArtOpen {
  tab: ArtTab;
  characterId?: string;
}

const TABS: ReadonlyArray<readonly [ArtTab, string]> = [
  ['scene', '장면 배경'],
  ['standing', '스탠딩'],
  ['face', '표정'],
  ['portrait', '초상화'],
];

/** 캐릭터 특성: 핵심 컨셉 → 문제 → 나머지 순으로 LLM에 넘긴다 */
function aspectsOf(state: RoomState, c: Character): string[] {
  const order = { high: 0, trouble: 1 } as Record<string, number>;
  return Object.values(state.aspects)
    .filter((a) => a.ownerType === 'character' && a.ownerId === c.id && a.kind !== 'boost')
    .sort((a, b) => (order[a.kind] ?? 2) - (order[b.kind] ?? 2))
    .map((a) => a.text);
}

/** 그림 창: 장면 배경 · 라이트노벨풍 스탠딩과 표정 · 초상화. GM은 모두, 플레이어는 자기 캐릭터만 */
export function ArtDialog({
  open,
  state,
  run,
  isGm,
  userId,
  onClose,
}: {
  open: ArtOpen;
  state: RoomState;
  run: Run;
  isGm: boolean;
  userId: string;
  onClose: () => void;
}) {
  const editable = Object.values(state.characters).filter(
    (c) => isGm || (!c.isNpc && c.ownerId === userId),
  );
  const [tab, setTab] = useState<ArtTab>(isGm || open.tab !== 'scene' ? open.tab : 'standing');
  const [charId, setCharId] = useState(open.characterId ?? editable[0]?.id ?? '');
  const c = state.characters[charId];
  const tabs = TABS.filter(([t]) => t !== 'scene' || isGm);

  const attach = async (cmd: Command, done: string) => {
    const evs = await run(cmd);
    // GM에게는 되돌리기 알림이 따로 뜬다
    if (evs.length && !isGm) toast({ text: done, tone: 'success', key: 'art' });
    return evs.length > 0;
  };

  const sceneAspects = state.scene
    ? Object.values(state.aspects)
        .filter((a) => a.ownerType === 'scene' && a.ownerId === state.scene!.id)
        .map((a) => a.text)
    : [];

  return (
    <Modal title="그림" kicker={isGm ? 'GM 도구' : '내 캐릭터'} onClose={onClose} wide>
      <div className={styles.tabs} role="tablist">
        {tabs.map(([t, label]) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab !== 'scene' &&
        (editable.length ? (
          <div className={gm.chips} aria-label="누구를 그릴까요">
            {editable.map((x) => (
              <button
                key={x.id}
                type="button"
                aria-pressed={x.id === charId}
                onClick={() => setCharId(x.id)}
              >
                {x.name}
                {x.isNpc ? ' · NPC' : ''}
              </button>
            ))}
          </div>
        ) : (
          <p className={gm.help}>그릴 캐릭터가 아직 없어요.</p>
        ))}

      {tab === 'scene' &&
        (state.scene ? (
          <>
            {state.scene.backgroundUrl && (
              <img className={styles.currentBg} src={state.scene.backgroundUrl} alt="지금 배경" />
            )}
            <MediaStudio
              key="scene"
              kind="scene"
              context={{ name: state.scene.name, aspects: sceneAspects }}
              applyLabel="무대 배경으로 쓰기"
              onApply={(d) =>
                attach(
                  {
                    type: 'media.attach',
                    payload: { kind: 'scene', target: state.scene!.id, url: d.url },
                  },
                  '배경을 바꿨어요',
                )
              }
            />
          </>
        ) : (
          <p className={gm.help}>장면을 연 다음 배경을 그릴 수 있어요.</p>
        ))}

      {tab === 'standing' && c && (
        <>
          <p className={gm.help}>
            전신을 흰 바탕에 그린 뒤 배경을 따서 무대에 세워요. 새로 그리면 만들어 둔 표정은
            지워져요.
          </p>
          <MediaStudio
            key={`standing:${c.id}`}
            kind="standing"
            context={{
              name: c.name,
              aspects: aspectsOf(state, c),
              ...(state.scene ? { scene: state.scene.name } : {}),
            }}
            applyLabel="스탠딩으로 쓰기"
            onApply={async (d: Drawn) => {
              const ok = await attach(
                {
                  type: 'media.attach',
                  payload: {
                    kind: 'standing',
                    target: c.id,
                    url: d.url,
                    meta: { presetId: d.presetId, prompt: d.prompt, seed: d.seed },
                  },
                },
                `${c.name} 스탠딩을 세웠어요`,
              );
              if (ok) setTab('face');
              return ok;
            }}
          />
        </>
      )}

      {tab === 'face' && c && <FacePanel c={c} run={run} attach={attach} />}

      {tab === 'portrait' && c && (
        <MediaStudio
          key={`portrait:${c.id}`}
          kind="npc"
          context={{
            name: c.name,
            aspects: aspectsOf(state, c),
            ...(state.scene ? { scene: state.scene.name } : {}),
          }}
          applyLabel="초상화로 쓰기"
          onApply={(d) =>
            attach(
              { type: 'media.attach', payload: { kind: 'portrait', target: c.id, url: d.url } },
              `${c.name} 초상화를 바꿨어요`,
            )
          }
        />
      )}
    </Modal>
  );
}

/** 표정 차분: 기본 스탠딩을 바탕으로 얼굴만 바꿔 그린다 */
function FacePanel({
  c,
  run,
  attach,
}: {
  c: Character;
  run: Run;
  attach: (cmd: Command, done: string) => Promise<boolean>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const base = c.standing?.neutral;
  const meta = c.standingMeta;
  if (!base || !meta)
    return <p className={gm.help}>먼저 스탠딩 탭에서 기본 스탠딩을 그려 주세요.</p>;
  const current = c.expression ?? 'neutral';

  async function make(id: string) {
    if (busy || !base || !meta) return;
    setBusy(id);
    setError(null);
    try {
      const r = await generateImage({
        kind: 'expression',
        presetId: meta.presetId,
        appearance: meta.prompt,
        guidance: findPreset(meta.presetId)?.guidance ?? 5,
        seed: meta.seed,
        expression: id,
        baseUrl: base,
      });
      await attach(
        {
          type: 'media.attach',
          payload: { kind: 'standing', target: c.id, url: r.url, expression: id },
        },
        '표정을 하나 더 만들었어요',
      );
    } catch (e) {
      setError(e instanceof PortraitError ? e.message : '표정을 그리지 못했어요.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <p className={gm.help}>
        만든 표정은 대사창 위 표정 칩으로 바로 바꿔 쓸 수 있어요. 굴림 결과에 따라 잠깐씩 저절로
        바뀌기도 해요.
      </p>
      <div className={styles.faces}>
        {EXPRESSIONS.map((e) => {
          const url = c.standing?.[e.id];
          return (
            <div key={e.id} className={styles.face} data-on={current === e.id || undefined}>
              <div className={styles.faceImg}>
                {url ? (
                  <img src={url} alt={`${c.name} ${e.label}`} />
                ) : (
                  <span>{busy === e.id ? '그리는 중…' : '아직 없어요'}</span>
                )}
              </div>
              <b>{e.label}</b>
              {url ? (
                <button
                  type="button"
                  disabled={current === e.id}
                  onClick={() =>
                    void run({
                      type: 'character.expression',
                      payload: { characterId: c.id, expression: e.id === 'neutral' ? null : e.id },
                    })
                  }
                >
                  {current === e.id ? '지금 표정' : '이 표정으로'}
                </button>
              ) : (
                <button type="button" disabled={!!busy} onClick={() => void make(e.id)}>
                  만들기
                </button>
              )}
            </div>
          );
        })}
      </div>
      {error && (
        <p className={styles.bad} role="alert">
          {error}
        </p>
      )}
    </>
  );
}
