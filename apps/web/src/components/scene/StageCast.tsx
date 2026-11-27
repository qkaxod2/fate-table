'use client';

import type { Character } from '@fate/rules-engine';
import { useEffect, useRef, useState } from 'react';
import { reducedMotion } from '@/lib/motion';
import { RichText } from '../ui/RichText';
import styles from './StageCast.module.css';

export interface CastMember {
  character: Character;
  /** 지금 말하거나 고르는 쪽 */
  focus: boolean;
  /** 굴림 결과로 잠깐 짓는 표정 (있으면 우선) */
  face?: string | null;
  /** 스탠딩이 없을 때 초상화라도 세울지 */
  portraitFallback?: boolean;
  /** 공격을 맞았다: 한 번 움찔한다 */
  hit?: boolean;
  /** 방금 한 말: 말풍선으로 잠깐 띄우고 몸을 살짝 들썩인다 */
  say?: { seq: number; text: string; fx?: boolean } | null;
  /** 한 번 움직임: 타격(번쩍 움찔 + 베인 자국) · 떨림(오들오들) */
  motion?: { seq: number; kind: 'hit' | 'tremble' } | null;
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
 * 라이트노벨풍 스탠딩. 왼쪽은 지금 움직이는 캐릭터, 오른쪽은 상대(굴림 상대나 대화 상대).
 * 말하는 쪽은 밝고 크게, 듣는 쪽은 살짝 어둡게. 표정이 바뀌면 그림이 부드럽게 바뀐다.
 * 말을 하면 머리 옆에 말풍선이 뜨고, 쓰러진 캐릭터는 빛이 빠진 채 가라앉는다.
 * 무대에서 내려가는 사람은 뚝 사라지지 않고 바깥쪽으로 물러나며 흐려진다.
 */
export function StageCast({ left, right }: { left?: CastMember; right?: CastMember }) {
  return (
    <div className={styles.cast} aria-hidden>
      <Side m={left} side="left" />
      <Side
        m={right && right.character.id !== left?.character.id ? right : undefined}
        side="right"
      />
    </div>
  );
}

/** 내려가는 그림이 물러나며 흐려지는 시간 (CSS의 castOut과 맞춘다) */
const LEAVE_MS = 420;

/** 한쪽 자리: 지금 선 사람 + 막 내려가는 사람(들) */
function Side({ m, side }: { m: CastMember | undefined; side: 'left' | 'right' }) {
  const [shown, setShown] = useState(m);
  const [gone, setGone] = useState<CastMember[]>([]);
  // 자리의 주인이 바뀌면 앞사람을 '내려가는 중'으로 잠깐 남긴다 (말풍선·움직임은 떼고)
  if (m !== shown) {
    const was = shown;
    const id = m?.character.id;
    if (was && was.character.id !== id) {
      setGone((g) => [
        ...g.filter((x) => x.character.id !== was.character.id && x.character.id !== id),
        { ...was, say: null, motion: null, hit: false },
      ]);
    } else if (id && gone.some((x) => x.character.id === id)) {
      setGone((g) => g.filter((x) => x.character.id !== id));
    }
    setShown(m);
  }
  useEffect(() => {
    if (!gone.length) return;
    const t = window.setTimeout(() => setGone([]), LEAVE_MS);
    return () => window.clearTimeout(t);
  }, [gone]);
  return (
    <>
      {gone.map((g) => (
        <Sprite key={`gone:${g.character.id}`} m={g} side={side} leaving />
      ))}
      {m && <Sprite key={m.character.id} m={m} side={side} />}
    </>
  );
}

/** 표정이 바뀌면 앞 그림을 잠깐 남겨 두고 새 그림과 겹쳐서 바꾼다 */
const CROSSFADE_MS = 320;

function Sprite({
  m,
  side,
  leaving,
}: {
  m: CastMember;
  side: 'left' | 'right';
  leaving?: boolean;
}) {
  const c = m.character;
  const url = spriteOf(c, m.face) ?? (m.portraitFallback ? c.portraitUrl : undefined);
  const [shown, setShown] = useState(url);
  const [prev, setPrev] = useState<string | undefined>(undefined);
  if (url !== shown) {
    setPrev(shown);
    setShown(url);
  }
  useEffect(() => {
    if (!prev) return;
    const t = window.setTimeout(() => setPrev(undefined), CROSSFADE_MS);
    return () => window.clearTimeout(t);
  }, [prev]);
  if (!url) return null;
  const cutout = !!c.standing;
  return <Figure m={m} side={side} url={url} prev={prev} cutout={cutout} leaving={leaving} />;
}

function Figure({
  m,
  side,
  url,
  prev,
  cutout,
  leaving,
}: {
  m: CastMember;
  side: 'left' | 'right';
  url: string;
  prev: string | undefined;
  cutout: boolean;
  leaving?: boolean | undefined;
}) {
  const c = m.character;
  const fig = useRef<HTMLElement>(null);
  const saySeq = m.say?.seq;
  // 말할 때마다 한 번 들썩인다 (그림 자체를 다시 그리지 않도록 Web Animations로)
  useEffect(() => {
    if (saySeq == null || reducedMotion()) return;
    fig.current?.animate(
      [
        { translate: '0 0' },
        { translate: '0 -9px' },
        { translate: '0 0' },
        { translate: '0 -4px' },
        { translate: '0 0' },
      ],
      { duration: 620, easing: 'ease-out' },
    );
  }, [saySeq]);
  const motionSeq = m.motion?.seq;
  const motionKind = m.motion?.kind;
  useEffect(() => {
    if (motionSeq == null || reducedMotion()) return;
    const el = fig.current;
    if (!el) return;
    const away = side === 'right' ? 1 : -1;
    const a =
      motionKind === 'tremble'
        ? el.animate(
            Array.from({ length: 24 }, (_, i) => ({
              translate: `${(i % 2 ? -1 : 1) * (i < 20 ? 3 : 1.5)}px ${i % 3 ? 0 : 1}px`,
            })).concat({ translate: '0 0' }),
            { duration: 1400, easing: 'linear' },
          )
        : el.animate(
            [
              { translate: '0 0', filter: 'brightness(2.4) saturate(0.2)' },
              {
                translate: `${away * 22}px 0`,
                filter: 'brightness(1.6) saturate(0.6)',
                offset: 0.15,
              },
              { translate: `${away * -8}px 0`, offset: 0.4 },
              { translate: `${away * 4}px 0`, filter: 'none', offset: 0.65 },
              { translate: '0 0', filter: 'none' },
            ],
            { duration: 560, easing: 'ease-out' },
          );
    return () => a.cancel();
  }, [motionSeq, motionKind, side]);
  return (
    <figure
      ref={fig}
      className={styles.sprite}
      data-side={side}
      data-focus={m.focus || undefined}
      data-cutout={cutout || undefined}
      data-hit={m.hit || undefined}
      data-down={c.takenOut || undefined}
      data-leaving={leaving || undefined}
    >
      {prev && prev !== url && (
        <img key={`was:${prev}`} className={styles.leaving} src={prev} alt="" draggable={false} />
      )}
      <img key={url} src={url} alt="" draggable={false} />
      {m.motion?.kind === 'hit' && <i key={m.motion.seq} className={styles.slash} />}
      <figcaption className={styles.name}>{c.name}</figcaption>
      {m.say && (
        <p key={m.say.seq} className={styles.bubble}>
          <b>{c.name}</b>
          <span>
            <RichText text={m.say.text} fx={m.say.fx} />
          </span>
        </p>
      )}
    </figure>
  );
}
