'use client';

import { term } from '@fate/glossary';
import type { Aspect, Character, RoomState } from '@fate/rules-engine';
import type { CSSProperties, PointerEvent } from 'react';
import { asset } from '@/lib/asset';
import styles from './TraitCard.module.css';

/**
 * 특성 카드 (design-system.md 32절).
 * 그림은 카드의 주인이 정한다: 캐릭터·NPC 것이면 그 사람 초상, 장면 것이면 장면 배경,
 * 주인이 없거나 초상이 없으면 종류별 공용 그림. 종류는 색 가공·테·이름판으로 가른다.
 */
export type TraitTone = 'core' | 'plain' | 'trouble' | 'scene' | 'cons' | 'boost';

const ICON: Record<TraitTone, string> = {
  scene: 'M8 14c-3 0-4.5-2-4.5-4.2C3.5 7 6 6 6.5 2.5 9 4 12.5 6.5 12.5 9.8 12.5 12 11 14 8 14Z',
  core: 'M2 12.5h12M2.5 12.5 2 4.5l3.5 3L8 2.5l2.5 5 3.5-3-.5 8',
  plain: 'M3 13 12.5 3.5M10 3h3v3M4.5 9.5l2 2M2.5 13.5l1-1',
  trouble:
    'M4 5.5h1.5a2.5 2.5 0 0 1 0 5H4a2.5 2.5 0 0 1 0-5Zm6.5 0H12a2.5 2.5 0 0 1 0 5h-1.5a2.5 2.5 0 0 1 0-5ZM6 8h4',
  cons: 'M3 12 9 3M6 13.5 12 4.5M9.5 14l3.5-5',
  boost: 'M8 1.5 9.4 6.6 14.5 8 9.4 9.4 8 14.5 6.6 9.4 1.5 8 6.6 6.6Z',
};

const SLOT_DEPTH: Record<string, 1 | 2 | 3> = { mild: 1, mild2: 1, moderate: 2, severe: 3 };

/** 후유증 깊이 (경상 1 · 중상 2 · 중태 3). 후유증이 아니면 0 */
export function consequenceDepth(aspect: Aspect, state: RoomState): 0 | 1 | 2 | 3 {
  if (aspect.kind !== 'consequence' || aspect.ownerType !== 'character') return 0;
  const c = state.characters[aspect.ownerId];
  const slot = c
    ? Object.entries(c.consequences).find(([, v]) => v?.aspectId === aspect.id)?.[0]
    : undefined;
  return slot ? (SLOT_DEPTH[slot] ?? 1) : 1;
}

export function toneOf(aspect: Aspect): TraitTone {
  switch (aspect.kind) {
    case 'high':
      return 'core';
    case 'trouble':
      return 'trouble';
    case 'consequence':
      return 'cons';
    case 'boost':
      return 'boost';
    case 'situation':
      return aspect.ownerType === 'character' ? 'plain' : 'scene';
    default:
      return 'plain';
  }
}

const KIND_LABEL: Record<TraitTone, string> = {
  core: term('high'),
  plain: term('normal'),
  trouble: term('trouble'),
  scene: term('situation'),
  cons: term('consequence'),
  boost: term('boost'),
};
const DEPTH_LABEL = ['', term('mild'), term('moderate'), term('severe')] as const;

export interface TraitArt {
  /** 주인(캐릭터·NPC)의 초상. 없으면 공용 그림 */
  portrait?: string | null | undefined;
  /** 장면 특성이 끌어다 쓸 지금 장면 배경 */
  scene?: string | null | undefined;
}

/** 카드에 깔 그림과, 초상을 가공해 쓰는지 */
function artOf(tone: TraitTone, aspect: Aspect, depth: number, art: TraitArt) {
  const owned = aspect.ownerType === 'character' && tone !== 'boost' && !!art.portrait;
  if (owned) return { url: art.portrait!, owned: true };
  if (tone === 'scene' && art.scene) return { url: art.scene, owned: false };
  const file =
    tone === 'cons' ? `cons-${depth || 2}` : tone === 'core' || tone === 'scene' ? 'plain' : tone;
  return { url: asset(`/cards/${file}.webp`), owned: false };
}

function tilt(e: PointerEvent<HTMLElement>) {
  if (e.pointerType !== 'mouse') return;
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width;
  const y = (e.clientY - r.top) / r.height;
  el.style.setProperty('--rx', `${((0.5 - y) * 14).toFixed(2)}deg`);
  el.style.setProperty('--ry', `${((x - 0.5) * 14).toFixed(2)}deg`);
  el.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`);
  el.style.setProperty('--my', `${(y * 100).toFixed(1)}%`);
}
function untilt(e: PointerEvent<HTMLElement>) {
  for (const v of ['--rx', '--ry', '--mx', '--my']) e.currentTarget.style.removeProperty(v);
}

interface Props {
  aspect: Aspect;
  art: TraitArt;
  /** 카드 위 작은 줄 앞에 붙는 주인 이름 */
  owner?: string | undefined;
  depth?: 0 | 1 | 2 | 3;
  /** 큰 카드(손패·탁자) 또는 장면에 붙는 꼬리표 */
  size?: 'card' | 'small' | 'tag';
  /** 오른쪽 위 배지 (예: +2) */
  badge?: string | undefined;
  /** 지금 낼 수 있음(빛남) / 이미 냄(흐림) */
  state?: 'can' | 'used' | 'off' | undefined;
  selected?: boolean;
  title?: string;
  onClick?: (() => void) | undefined;
  style?: CSSProperties;
  className?: string | undefined;
  dataTour?: string;
}

export function TraitCard({
  aspect,
  art,
  owner,
  depth = 0,
  size = 'card',
  badge,
  state,
  selected,
  title,
  onClick,
  style,
  className,
  dataTour,
}: Props) {
  const tone = toneOf(aspect);
  const pic = artOf(tone, aspect, depth, art);
  const kind = [owner, tone === 'cons' && depth ? DEPTH_LABEL[depth] : KIND_LABEL[tone]]
    .filter(Boolean)
    .join(' · ');
  const foot =
    aspect.freeInvokes > 0
      ? `${term('freeInvoke')} ${aspect.freeInvokes}`
      : tone === 'boost'
        ? '한 번 쓰면 사라짐'
        : tone === 'trouble'
          ? `강요받으면 ${term('fatePoint')} +1`
          : `${term('fatePoint')} 1`;
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      className={className ? `${styles.card} ${className}` : styles.card}
      data-tone={tone}
      data-size={size}
      data-owned={pic.owned || undefined}
      data-depth={depth || undefined}
      data-state={state}
      data-selected={selected || undefined}
      data-tour={dataTour}
      title={title}
      style={{
        ...style,
        ['--art' as string]: `url(${pic.url})`,
        ...(pic.owned && tone === 'trouble'
          ? { ['--chain' as string]: `url(${asset('/cards/trouble.webp')})` }
          : {}),
        ...(pic.owned && tone === 'cons'
          ? { ['--slash' as string]: `url(${asset(`/cards/cons-${depth || 2}.webp`)})` }
          : {}),
      }}
      disabled={onClick ? state === 'off' || state === 'used' : undefined}
      onClick={onClick}
      {...(onClick && size !== 'tag' ? { onPointerMove: tilt, onPointerLeave: untilt } : {})}
    >
      {size !== 'tag' && <span className={styles.pic} aria-hidden />}
      {size !== 'tag' && <span className={styles.shade} aria-hidden />}
      <span className={styles.gem} aria-hidden>
        <svg viewBox="0 0 16 16">
          <path d={ICON[tone]} />
        </svg>
      </span>
      {badge && <span className={styles.badge}>{badge}</span>}
      <span className={styles.plate}>
        <span className={styles.kind}>
          {kind}
          {tone === 'cons' && depth > 0 && (
            <span className={styles.depth} aria-hidden>
              {[1, 2, 3].map((n) => (
                <i key={n} data-on={n <= depth || undefined} />
              ))}
            </span>
          )}
        </span>
        <b className={styles.name}>{aspect.text}</b>
        {size !== 'tag' && (
          <span className={styles.foot}>
            {aspect.freeInvokes > 0 && <i className={styles.pip} />}
            {foot}
          </span>
        )}
      </span>
    </Tag>
  );
}

/** 특성의 주인 초상 (캐릭터 초상 URL이 있을 때만) */
export function portraitOf(
  aspect: Aspect,
  state: RoomState,
  extra?: (c: Character) => string | null | undefined,
): string | null {
  if (aspect.ownerType !== 'character') return null;
  const c = state.characters[aspect.ownerId];
  if (!c) return null;
  return extra?.(c) ?? c.portraitUrl ?? null;
}
