'use client';

import { LADDER_LABELS, term } from '@fate/glossary';
import {
  APPROACHES,
  refreshFor,
  type Approach,
  type Aspect,
  type Character,
  type Stunt,
} from '@fate/rules-engine';
import { useState } from 'react';
import { josa } from '@/lib/josa';
import styles from './try.module.css';

export type MilestoneChoice =
  | { kind: 'swap'; a: Approach; b: Approach }
  | { kind: 'aspect'; aspectId: string; text: string }
  | { kind: 'swapStunt'; replace: string; stuntId: string }
  | { kind: 'newStunt'; stuntId: string };

type Kind = MilestoneChoice['kind'];

const sign = (n: number) => `${n >= 0 ? '+' : ''}${n}`;

/**
 * 작은 이정표 (기동형 페이트): 아래 넷 중 하나만 고른다.
 * 접근법 두 개 맞바꾸기 · 핵심 컨셉이 아닌 특성 하나 고쳐 쓰기 · 특기 하나 바꾸기 · 새 특기 얻기
 */
export function MilestonePicker({
  character,
  aspects,
  ideas,
  onDone,
}: {
  character: Character;
  aspects: Aspect[];
  /** 바꾸거나 새로 얻을 수 있는 특기 후보 */
  ideas: Stunt[];
  onDone: (choice: MilestoneChoice | null) => void;
}) {
  const [kind, setKind] = useState<Kind | null>(null);
  const [pair, setPair] = useState<Approach[]>([]);
  const rewritable = aspects.filter((a) => a.kind === 'trouble' || a.kind === 'normal');
  const [aspectId, setAspectId] = useState<string | null>(rewritable[0]?.id ?? null);
  const [text, setText] = useState(rewritable[0]?.text ?? '');
  const [stuntId, setStuntId] = useState<string | null>(null);
  const fresh = ideas.filter((i) => !character.stunts.some((s) => s.id === i.id));
  const replace = character.stunts[0];

  const OPTIONS: { kind: Kind; title: string; sub: string }[] = [
    { kind: 'swap', title: `${term('approach')} 두 개 맞바꾸기`, sub: '잘하는 방식을 바꾼다' },
    {
      kind: 'aspect',
      title: `${term('aspect')} 하나 고쳐 쓰기`,
      sub: `${term('high')}은 그대로 둔다`,
    },
    { kind: 'swapStunt', title: `${term('stunt')} 하나 바꾸기`, sub: '있던 재주를 다른 재주로' },
    {
      kind: 'newStunt',
      title: `새 ${term('stunt')} 얻기`,
      sub: `4개째부터 ${term('refresh')} −1`,
    },
  ];

  const ready =
    (kind === 'swap' && pair.length === 2) ||
    (kind === 'aspect' &&
      !!aspectId &&
      !!text.trim() &&
      text.trim() !== rewritable.find((a) => a.id === aspectId)?.text) ||
    ((kind === 'swapStunt' || kind === 'newStunt') && !!stuntId);

  const submit = () => {
    if (!ready || !kind) return;
    if (kind === 'swap') onDone({ kind, a: pair[0]!, b: pair[1]! });
    if (kind === 'aspect') onDone({ kind, aspectId: aspectId!, text: text.trim() });
    if (kind === 'swapStunt' && replace) onDone({ kind, replace: replace.id, stuntId: stuntId! });
    if (kind === 'newStunt') onDone({ kind, stuntId: stuntId! });
  };

  const togglePair = (a: Approach) =>
    setPair((p) => (p.includes(a) ? p.filter((x) => x !== a) : [...p, a].slice(-2)));
  const after = (a: Approach) =>
    pair.length === 2 && pair.includes(a)
      ? character.approaches[pair.find((x) => x !== a)!]
      : character.approaches[a];

  const nextCount = character.stunts.length + 1;
  const nextRefresh = refreshFor(nextCount);

  return (
    <form
      className={`${styles.prompt} ${styles.milestone}`}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className={styles.promptHead}>
        작은 {term('milestone')} · 혜택 하나 고르기
      </div>
      <p className={styles.promptHelp}>
        세션을 마친 {josa(character.name, '은/는')} 조금 달라질 수 있다. 넷 중 하나만 고른다.
      </p>

      <div className={styles.msOptions} role="radiogroup" aria-label="이정표 혜택">
        {OPTIONS.map((o) => (
          <button
            key={o.kind}
            type="button"
            role="radio"
            aria-checked={kind === o.kind}
            className={styles.msOption}
            onClick={() => {
              setKind(o.kind);
              setStuntId(null);
            }}
          >
            <b>{o.title}</b>
            <span>{o.sub}</span>
          </button>
        ))}
      </div>

      {kind === 'swap' && (
        <div className={styles.msDetail}>
          <p>두 개를 고르면 값이 서로 바뀐다. 합은 그대로라 더 강해지진 않는다.</p>
          <div className={styles.msChips}>
            {APPROACHES.map((a) => (
              <button
                key={a}
                type="button"
                aria-pressed={pair.includes(a)}
                className={styles.msChip}
                onClick={() => togglePair(a)}
              >
                {term(a)}{' '}
                <b>
                  {sign(character.approaches[a])}
                  {after(a) !== character.approaches[a] && ` → ${sign(after(a))}`}
                </b>
                <small>{LADDER_LABELS[after(a)]}</small>
              </button>
            ))}
          </div>
        </div>
      )}

      {kind === 'aspect' && (
        <div className={styles.msDetail}>
          <p>
            이번 이야기에서 겪은 일로 바뀐 점을 적는다. {term('high')}은 큰 {term('milestone')}
            에서만 바꾼다.
          </p>
          <div className={styles.msChips}>
            {rewritable.map((a) => (
              <button
                key={a.id}
                type="button"
                aria-pressed={aspectId === a.id}
                className={styles.msChip}
                onClick={() => {
                  setAspectId(a.id);
                  setText(a.text);
                }}
              >
                <small>{a.kind === 'trouble' ? term('trouble') : term('aspect')}</small> {a.text}
              </button>
            ))}
          </div>
          <input
            aria-label={`새 ${term('aspect')} 문구`}
            className={styles.promptInput}
            value={text}
            maxLength={40}
            onChange={(e) => setText(e.target.value)}
            placeholder="예: 동료의 신호만은 믿는다"
          />
        </div>
      )}

      {(kind === 'swapStunt' || kind === 'newStunt') && (
        <div className={styles.msDetail}>
          {kind === 'swapStunt' ? (
            <p>
              지금 {term('stunt')}: <b>{replace?.text}</b>. 이걸 아래 것 중 하나로 바꾼다.
            </p>
          ) : (
            <p>
              {term('stunt')} {character.stunts.length}개 → {nextCount}개. {term('stunt')} 3개까지는{' '}
              {term('refresh')}이 그대로라 {term('refresh')} {character.refresh} →{' '}
              <b>{nextRefresh}</b>.
              {nextRefresh < character.refresh &&
                ` 세션마다 받는 ${josa(term('fatePoint'), '이/가')} 하나 준다.`}
            </p>
          )}
          <div className={styles.msChips}>
            {fresh.map((i) => (
              <button
                key={i.id}
                type="button"
                aria-pressed={stuntId === i.id}
                className={styles.msChip}
                onClick={() => setStuntId(i.id)}
              >
                {i.text}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className={styles.promptButtons}>
        <button type="button" className={styles.restart} onClick={() => onDone(null)}>
          이번엔 넘기기
        </button>
        <button type="submit" className={styles.promptOk} disabled={!ready}>
          이걸로 성장
        </button>
      </div>
    </form>
  );
}
