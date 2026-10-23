'use client';

import {
  APPEARANCE_CHIPS,
  APPEARANCE_MAX,
  GUIDANCE,
  PORTRAIT_PRESETS,
  checkAppearance,
  findPreset,
} from '@fate/portrait';
import { useState } from 'react';
import { asset } from '@/lib/asset';
import { PortraitError, generatePortrait, portraitAvailable } from '@/lib/portraitApi';
import styles from './PortraitStudio.module.css';

interface Candidate {
  url: string;
  seed: number;
  presetId: string;
}

interface Props {
  value?: string;
  onChange: (url: string | undefined) => void;
}

const ISSUE_COPY = {
  EMPTY: '외형을 한 가지 이상 적어 주세요.',
  TOO_LONG: `외형은 ${APPEARANCE_MAX}자까지 적을 수 있어요.`,
  BLOCKED_TAG: '작가 태그나 노출 관련 태그는 넣을 수 없어요. 화풍은 위에서 골라 주세요.',
} as const;

function splitTags(text: string): string[] {
  return text
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function PortraitStudio({ value, onChange }: Props) {
  const [presetId, setPresetId] = useState<string>(PORTRAIT_PRESETS[0]!.id);
  const [appearance, setAppearance] = useState('');
  const [guidance, setGuidance] = useState(PORTRAIT_PRESETS[0]!.guidance);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const online = portraitAvailable();
  const preset = findPreset(presetId)!;
  const issue = appearance.trim() ? checkAppearance(appearance) : null;
  const tags = splitTags(appearance);

  function pickPreset(id: string) {
    setPresetId(id);
    setGuidance(findPreset(id)!.guidance);
  }

  function toggleChip(tag: string) {
    setAppearance(
      tags.includes(tag) ? tags.filter((t) => t !== tag).join(', ') : [...tags, tag].join(', '),
    );
  }

  async function draw() {
    if (busy || checkAppearance(appearance)) return;
    setBusy(true);
    setError(null);
    try {
      const r = await generatePortrait({ presetId, appearance, guidance });
      setCandidates((c) => [{ ...r, presetId }, ...c].slice(0, 8));
      if (!value) onChange(r.url);
    } catch (e) {
      setError(e instanceof PortraitError ? e.message : '그림을 만들지 못했어요.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.studio}>
      <section className={styles.block} aria-labelledby="ps-style">
        <h3 id="ps-style" className={styles.h}>
          화풍
        </h3>
        <div className={styles.presets} role="radiogroup" aria-labelledby="ps-style">
          {PORTRAIT_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={p.id === presetId}
              className={styles.preset}
              data-on={p.id === presetId || undefined}
              onClick={() => pickPreset(p.id)}
            >
              <img src={asset(p.thumb)} alt="" className={styles.thumb} loading="lazy" />
              <span className={styles.pName}>{p.name}</span>
              <span className={styles.pBlurb}>{p.blurb}</span>
            </button>
          ))}
        </div>
      </section>

      <section className={styles.block}>
        <label htmlFor="ps-look" className={styles.h}>
          외형
        </label>
        <p className={styles.hint}>
          영어 태그를 쉼표로 이어 적어요. 아래 칩을 눌러 넣을 수도 있어요.
        </p>
        <div className={styles.chips}>
          {APPEARANCE_CHIPS.map((c) => (
            <button
              key={c.tag}
              type="button"
              className={styles.chip}
              aria-pressed={tags.includes(c.tag)}
              onClick={() => toggleChip(c.tag)}
              title={c.tag}
            >
              {c.label}
            </button>
          ))}
        </div>
        <textarea
          id="ps-look"
          className={styles.look}
          rows={4}
          maxLength={APPEARANCE_MAX + 50}
          placeholder="1girl, silver hair, long hair, blue eyes, armor, cape, upper body, looking at viewer"
          value={appearance}
          onChange={(e) => setAppearance(e.target.value)}
          aria-invalid={issue ? true : undefined}
          aria-describedby="ps-look-msg"
        />
        <p id="ps-look-msg" className={issue ? styles.bad : styles.count}>
          {issue ? ISSUE_COPY[issue] : `${appearance.length} / ${APPEARANCE_MAX}`}
        </p>
      </section>

      <section className={styles.block}>
        <div className={styles.row}>
          <label htmlFor="ps-guide" className={styles.h}>
            가이던스 <span className={styles.num}>{guidance.toFixed(1)}</span>
          </label>
          {guidance !== preset.guidance && (
            <button
              type="button"
              className={styles.link}
              onClick={() => setGuidance(preset.guidance)}
            >
              화풍 기본값 {preset.guidance.toFixed(1)}
            </button>
          )}
        </div>
        <input
          id="ps-guide"
          type="range"
          className={styles.slider}
          min={GUIDANCE.min}
          max={GUIDANCE.max}
          step={GUIDANCE.step}
          value={guidance}
          onChange={(e) => setGuidance(Number(e.target.value))}
        />
        <div className={styles.scale}>
          <span>자유롭게</span>
          <span>입력한 대로</span>
        </div>
      </section>

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.draw}
          onClick={draw}
          disabled={!online || busy || !!checkAppearance(appearance)}
        >
          {busy ? '그리는 중…' : candidates.length ? '한 장 더 그리기' : '그리기'}
        </button>
        {busy && <span className={styles.wait}>보통 10초 안팎 걸려요</span>}
        {!online && <span className={styles.wait}>서버가 연결되면 쓸 수 있어요</span>}
      </div>
      {error && (
        <p className={styles.bad} role="alert">
          {error}
        </p>
      )}

      {candidates.length > 0 && (
        <section className={styles.block} aria-label="그린 그림">
          <div className={styles.cands}>
            {candidates.map((c) => (
              <button
                key={c.url}
                type="button"
                className={styles.cand}
                data-on={c.url === value || undefined}
                aria-pressed={c.url === value}
                onClick={() => onChange(c.url)}
              >
                <img src={c.url} alt={`${findPreset(c.presetId)?.name ?? ''} 후보`} />
              </button>
            ))}
          </div>
          <p className={styles.hint}>마음에 드는 그림을 눌러 초상화로 정해요.</p>
        </section>
      )}
    </div>
  );
}
