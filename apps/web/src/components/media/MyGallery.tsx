'use client';

import { findPreset, type MediaKind } from '@fate/portrait';
import { useState } from 'react';
import { toast } from '@/components/ui/Toast';
import {
  KIND_LABEL,
  deleteImage,
  downloadImage,
  useMyImages,
  type ShownImage,
} from '@/lib/myImages';
import styles from './MyGallery.module.css';

interface Props {
  /** 이 종류만 보여 준다. 비우면 전체와 종류 칩 */
  kinds?: readonly MediaKind[];
  /** 고르기 버튼을 달면 그림을 다시 쓸 수 있다 */
  onPick?: (img: ShownImage) => void;
  pickLabel?: string;
  /** 대화창 안에 넣을 때: 지우기 버튼 없이 작게 */
  compact?: boolean;
}

const FILTERS: ReadonlyArray<MediaKind> = ['standing', 'expression', 'portrait', 'npc', 'scene'];

/** 이 브라우저에 담아 둔 내 그림. 받기 · 지우기 · 다시 고르기 */
export function MyGallery({ kinds, onPick, pickLabel = '고르기', compact }: Props) {
  const { images, ready } = useMyImages(kinds);
  const [only, setOnly] = useState<MediaKind | null>(null);
  const shown = only ? images.filter((x) => x.kind === only) : images;
  const present = new Set(images.map((x) => x.kind));

  async function download(img: ShownImage) {
    if (!(await downloadImage(img)))
      toast({ text: '그림을 내려받지 못했어요. 다시 해 주세요.', tone: 'error', key: 'gallery' });
  }

  async function remove(img: ShownImage) {
    if (!confirm('이 그림을 내 그림에서 지울까요? 방에 붙인 그림은 그대로 남아요.')) return;
    await deleteImage(img.id);
  }

  if (!ready) return null;
  if (!images.length)
    return (
      <p className={styles.empty}>
        {kinds ? (
          '아직 담아 둔 그림이 없어요.'
        ) : (
          <>
            <strong>아직 그린 그림이 없어요</strong>
            방에서 초상화나 배경을 그리면 여기에 저절로 담겨요.
          </>
        )}
      </p>
    );

  return (
    <div className={styles.gallery} data-compact={compact || undefined}>
      {!kinds && present.size > 1 && (
        <div className={styles.filters} role="group" aria-label="종류">
          <button type="button" aria-pressed={!only} onClick={() => setOnly(null)}>
            전체 {images.length}
          </button>
          {FILTERS.filter((k) => present.has(k)).map((k) => (
            <button key={k} type="button" aria-pressed={only === k} onClick={() => setOnly(k)}>
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>
      )}
      <ul className={styles.grid}>
        {shown.map((img) => (
          <li key={img.id} className={styles.item} data-kind={img.kind}>
            <div className={styles.thumb}>
              <img src={img.src} alt={`${KIND_LABEL[img.kind]} ${img.prompt.slice(0, 40)}`} />
            </div>
            <p className={styles.meta}>
              <b>{KIND_LABEL[img.kind]}</b>
              <span>{findPreset(img.presetId)?.name ?? ''}</span>
              <time dateTime={img.createdAt}>
                {new Date(img.createdAt).toLocaleDateString('ko-KR', {
                  month: 'numeric',
                  day: 'numeric',
                })}
              </time>
            </p>
            <div className={styles.actions}>
              {onPick && (
                <button type="button" className={styles.pick} onClick={() => onPick(img)}>
                  {pickLabel}
                </button>
              )}
              <button type="button" onClick={() => void download(img)} title="PNG 파일로 받기">
                받기
              </button>
              {!compact && (
                <button type="button" className={styles.del} onClick={() => void remove(img)}>
                  지우기
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
