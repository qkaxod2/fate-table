'use client';

import type { Character } from '@fate/rules-engine';
import styles from './StageCast.module.css';

export interface CastMember {
  character: Character;
  /** 지금 말하거나 고르는 쪽 */
  focus: boolean;
  /** 굴림 결과로 잠깐 짓는 표정 (있으면 우선) */
  face?: string | null;
  /** 스탠딩이 없을 때 초상화라도 세울지 */
  portraitFallback?: boolean;
}

/** 표정 → 그림. 없는 표정이면 기본 스탠딩 */
export function spriteOf(c: Character, face?: string | null): string | undefined {
  const s = c.standing;
  if (!s) return undefined;
  return (face && s[face]) || (c.expression && s[c.expression]) || s.neutral;
}

/** 굴림 결과에 따라 잠깐 바꿔 볼 표정 (있는 것 중 앞에서부터) */
export const OUTCOME_FACES = {
  style: ['smug', 'smile'],
  success: ['smile'],
  tie: ['serious'],
  fail: ['sad', 'angry', 'embarrassed'],
} as const;

export function pickFace(c: Character, wants: readonly string[]): string | null {
  return wants.find((f) => c.standing?.[f]) ?? null;
}

/**
 * 라이트노벨풍 스탠딩. 왼쪽은 지금 움직이는 캐릭터, 오른쪽은 상대.
 * 말하는 쪽은 밝고 크게, 듣는 쪽은 살짝 어둡게. 표정이 바뀌면 그림이 부드럽게 바뀐다.
 */
export function StageCast({ left, right }: { left?: CastMember; right?: CastMember }) {
  return (
    <div className={styles.cast} aria-hidden>
      {left && <Sprite m={left} side="left" />}
      {right && right.character.id !== left?.character.id && <Sprite m={right} side="right" />}
    </div>
  );
}

function Sprite({ m, side }: { m: CastMember; side: 'left' | 'right' }) {
  const c = m.character;
  const url = spriteOf(c, m.face) ?? (m.portraitFallback ? c.portraitUrl : undefined);
  if (!url) return null;
  const cutout = !!c.standing;
  return (
    <figure
      key={c.id}
      className={styles.sprite}
      data-side={side}
      data-focus={m.focus || undefined}
      data-cutout={cutout || undefined}
    >
      <img key={url} src={url} alt="" draggable={false} />
      <figcaption className={styles.name}>{c.name}</figcaption>
    </figure>
  );
}
