'use client';

import { PORTRAIT_PRESETS, TAGS_MAX, checkAppearance, findPreset } from '@fate/portrait';
import { useState } from 'react';
import { useCloseGuardDirty } from '@/components/ui/closeGuard';
import { asset } from '@/lib/asset';
import {
  PortraitError,
  generateImage,
  portraitAvailable,
  suggestPrompt,
  type PromptKind,
  type PromptRequest,
} from '@/lib/portraitApi';
import styles from './MediaStudio.module.css';

export interface Drawn {
  url: string;
  seed: number;
  presetId: string;
  prompt: string;
}

interface Props {
  kind: PromptKind;
  /** LLM에 같이 넘길 이름·특성·지금 장면 */
  context: NonNullable<PromptRequest['context']>;
  /** 적용 버튼 문구 */
  applyLabel: string;
  onApply: (d: Drawn) => Promise<boolean>;
}

const COPY: Record<PromptKind, { what: string; placeholder: string; tags: string; wait: string }> =
  {
    scene: {
      what: '어떤 곳인가요?',
      placeholder: '예: 도적들이 불을 지르고 숨어 있는 시골 곡물 창고. 밤, 연기가 자욱해요.',
      tags: 'outdoors, ruins, ancient forest, moss, stone pillars, night, moonlight, fog',
      wait: '배경은 보통 15초 안팎 걸려요',
    },
    npc: {
      what: '어떤 사람인가요?',
      placeholder:
        '예: 덩치 큰 산적 두목. 털옷에 한쪽 눈 흉터, 도끼를 어깨에 메고 비열하게 웃어요.',
      tags: '1boy, bandit, scar across eye, fur cloak, holding axe, smirk, upper body',
      wait: '보통 10초 안팎 걸려요',
    },
    standing: {
      what: '어떤 모습으로 서 있나요?',
      placeholder:
        '예: 은발 단발에 둥근 안경, 주머니 많은 코트를 입고 빛나는 플라스크를 든 견습 연금술사.',
      tags: '1girl, alchemist, silver hair, bob cut, round eyewear, long coat, knee boots, holding flask',
      wait: '그린 뒤 배경을 따느라 15초쯤 걸려요',
    },
  };

const PRESET_KEY = 'fate.artPreset';

function savedPreset(): string {
  try {
    const v = localStorage.getItem(PRESET_KEY);
    if (v && findPreset(v)) return v;
  } catch {}
  return PORTRAIT_PRESETS[0]!.id;
}

/**
 * 묘사 → (Gemini) 태그 → (NAI) 그림 → 적용. 태그는 사람이 고칠 수 있다.
 * 장면 배경 · NPC 초상화 · 라이트노벨풍 스탠딩이 같은 흐름을 쓴다.
 */
export function MediaStudio({ kind, context, applyLabel, onApply }: Props) {
  const copy = COPY[kind];
  const [description, setDescription] = useState('');
  const [prompt, setPrompt] = useState('');
  const [negative, setNegative] = useState('');
  const [summary, setSummary] = useState('');
  const [presetId, setPresetId] = useState(savedPreset);
  const [thinking, setThinking] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drawn, setDrawn] = useState<Drawn[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);
  // 그리는 중이거나 그려 놓고 아직 안 붙인 그림은 창이 실수로 닫혀 날아가지 않게
  const saved = useCloseGuardDirty(thinking || drawing || (drawn.length > 0 && !applied));

  const online = portraitAvailable();
  const preset = findPreset(presetId)!;
  const issue = prompt.trim() ? checkAppearance(prompt, TAGS_MAX) : null;
  const hasContext = !!(context.name || context.aspects?.length);
  const chosen = drawn.find((d) => d.url === picked);

  const fail = (e: unknown, fallback: string) =>
    setError(e instanceof PortraitError ? e.message : fallback);

  async function think() {
    if (thinking) return;
    setThinking(true);
    setError(null);
    try {
      const r = await suggestPrompt({ kind, description, context });
      setPrompt(r.prompt);
      setNegative(r.negative);
      setSummary(r.summary);
    } catch (e) {
      fail(e, '프롬프트를 만들지 못했어요.');
    } finally {
      setThinking(false);
    }
  }

  async function draw() {
    if (drawing || checkAppearance(prompt, TAGS_MAX)) return;
    setDrawing(true);
    setError(null);
    try {
      const r = await generateImage({
        kind,
        presetId,
        appearance: prompt,
        guidance: preset.guidance,
        ...(negative.trim() ? { negative: negative.trim() } : {}),
      });
      const d = { url: r.url, seed: r.seed, presetId, prompt };
      setDrawn((x) => [d, ...x].slice(0, 8));
      setPicked(r.url);
      setApplied(false);
    } catch (e) {
      fail(e, '그림을 만들지 못했어요.');
    } finally {
      setDrawing(false);
    }
  }

  async function apply() {
    if (!chosen || applying) return;
    setApplying(true);
    try {
      if (await onApply(chosen)) {
        setApplied(true);
        saved?.();
      }
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className={styles.studio} data-kind={kind}>
      <section className={styles.block}>
        <label htmlFor="ms-desc" className={styles.h}>
          {copy.what}
        </label>
        {hasContext && (
          <p className={styles.context}>
            {context.name && <b>{context.name}</b>}
            {context.aspects?.map((a) => (
              <span key={a}>「{a}」</span>
            ))}
            <small>도 함께 읽어요</small>
          </p>
        )}
        <textarea
          id="ms-desc"
          className={styles.desc}
          rows={3}
          maxLength={1500}
          placeholder={copy.placeholder}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.think}
            onClick={think}
            disabled={!online || thinking || (!description.trim() && !hasContext)}
          >
            {thinking ? '태그로 옮기는 중…' : prompt ? '✦ 다시 만들기' : '✦ 프롬프트 만들기'}
          </button>
          <span className={styles.wait}>한국어로 편하게 적으면 그림용 태그로 바꿔 줘요</span>
        </div>
        {summary && <p className={styles.summary}>{summary}</p>}
      </section>

      <section className={styles.block}>
        <label htmlFor="ms-tags" className={styles.h}>
          프롬프트 <small>직접 고쳐도 돼요</small>
        </label>
        <textarea
          id="ms-tags"
          className={styles.tags}
          rows={4}
          value={prompt}
          placeholder={copy.tags}
          onChange={(e) => setPrompt(e.target.value)}
          aria-invalid={issue ? true : undefined}
        />
        {issue === 'BLOCKED_TAG' && (
          <p className={styles.bad}>작가 태그는 넣을 수 없어요. 화풍은 아래에서 골라 주세요.</p>
        )}
        {issue === 'TOO_LONG' && (
          <p className={styles.bad}>프롬프트는 {TAGS_MAX}자까지 쓸 수 있어요.</p>
        )}
        <details className={styles.neg}>
          <summary>빼고 싶은 것{negative ? ` · ${negative.split(',').length}개` : ''}</summary>
          <input
            value={negative}
            maxLength={300}
            placeholder="daylight, blue sky"
            onChange={(e) => setNegative(e.target.value)}
            aria-label="네거티브 태그"
          />
        </details>
      </section>

      <section className={styles.block} aria-labelledby="ms-style">
        <h3 id="ms-style" className={styles.h}>
          화풍
        </h3>
        <div className={styles.presets} role="radiogroup" aria-labelledby="ms-style">
          {PORTRAIT_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={p.id === presetId}
              className={styles.preset}
              title={p.blurb}
              onClick={() => {
                setPresetId(p.id);
                try {
                  localStorage.setItem(PRESET_KEY, p.id);
                } catch {}
              }}
            >
              <img src={asset(p.thumb)} alt="" loading="lazy" />
              <span>{p.name}</span>
            </button>
          ))}
        </div>
      </section>

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.draw}
          onClick={draw}
          disabled={!online || drawing || !!checkAppearance(prompt, TAGS_MAX)}
        >
          {drawing ? '그리는 중…' : drawn.length ? '한 장 더 그리기' : '그리기'}
        </button>
        {drawing && <span className={styles.wait}>{copy.wait}</span>}
        {!online && <span className={styles.wait}>서버가 연결되면 쓸 수 있어요</span>}
      </div>
      {error && (
        <p className={styles.bad} role="alert">
          {error}
        </p>
      )}

      {drawn.length > 0 && (
        <section className={styles.block} aria-label="그린 그림">
          <div className={styles.cands}>
            {drawn.map((d) => (
              <button
                key={d.url}
                type="button"
                className={styles.cand}
                aria-pressed={d.url === picked}
                onClick={() => setPicked(d.url)}
              >
                <img src={d.url} alt={`${findPreset(d.presetId)?.name ?? ''} 후보`} />
              </button>
            ))}
          </div>
          <button
            type="button"
            className={styles.apply}
            onClick={apply}
            disabled={!chosen || applying}
          >
            {applying ? '올리는 중…' : applyLabel}
          </button>
        </section>
      )}
    </div>
  );
}
