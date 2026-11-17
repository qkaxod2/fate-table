'use client';

import { term } from '@fate/glossary';
import { APPROACHES, refreshFor, type Action, type Approach } from '@fate/rules-engine';
import { josa } from '@/lib/josa';
import type { CharacterDraft } from '@/lib/myCharacters';
import styles from './create.module.css';

export type Ratings = Record<Approach, number | null>;

export interface StuntDraft {
  text: string;
  approach: Approach;
  action: Action;
}

export const emptyRatings = (): Ratings =>
  Object.fromEntries(APPROACHES.map((a) => [a, null])) as Ratings;

/** 저장한 캐릭터를 만들기 화면의 입력값으로 되돌린다 (고치기·목록 카드에 쓴다) */
export function draftToForm(d: CharacterDraft) {
  const ratings = emptyRatings();
  for (const a of APPROACHES) ratings[a] = d.approaches[a] ?? 0;
  const extra = [...(d.aspects ?? [])];
  while (extra.length < 2) extra.push('');
  return {
    name: d.name,
    high: d.highConcept,
    trouble: d.trouble ?? '',
    extra: extra.slice(0, 2),
    ratings,
    stunts: (d.stunts ?? []).map((s): StuntDraft => ({
      text: s.text,
      approach: s.bonus?.approach ?? 'forceful',
      action: s.bonus?.action ?? 'attack',
    })),
    portrait: d.portraitUrl,
    story: d.backstory ?? '',
  };
}

/**
 * 캐릭터 기록지: 초상 + 이름 + 특성 인덱스 카드 + 접근법 + 특기.
 * 만드는 동안에는 오른쪽 미리보기로, 완성 화면에서는 크게(full), 내 캐릭터 목록에서는 저장본(saved)으로 쓴다.
 */
export function Sheet({
  name,
  high,
  trouble,
  extra,
  ratings,
  stunts,
  portrait,
  story = '',
  full = false,
  saved = false,
}: {
  name: string;
  high: string;
  trouble: string;
  extra: string[];
  ratings: Ratings;
  stunts: StuntDraft[];
  portrait: string | undefined;
  /** 지나온 이야기 (선택) */
  story?: string;
  full?: boolean;
  /** 저장한 캐릭터 목록의 카드: 빈 칸 안내를 숨긴다 */
  saved?: boolean;
}) {
  const cards: {
    kind: 'high' | 'trouble' | 'normal';
    label: string;
    text: string;
    hint: string;
  }[] = [
    { kind: 'high', label: term('high'), text: high, hint: '어떤 사람인지 한 줄로' },
    { kind: 'trouble', label: term('trouble'), text: trouble, hint: '자꾸 곤란해지는 점' },
    ...extra
      .map((t, i) => ({
        kind: 'normal' as const,
        label: term('aspect'),
        text: t,
        hint: i === 0 ? '하나 더 (선택)' : '관계나 지난 일 (선택)',
      }))
      .filter((c) => (full || saved ? c.text.trim() : true)),
  ];
  const refresh = refreshFor(stunts.length);
  return (
    <div className={styles.sheetCard} data-full={full || undefined} data-ink="paper">
      <div className={styles.sheetTop}>
        <div className={styles.photo} data-none={!portrait || undefined}>
          {portrait ? (
            <img src={portrait} alt={`${name} 초상화`} className={styles.portrait} />
          ) : (
            // 초상화가 없으면 이름 첫 글자를 도장처럼 찍어 둔다 (빈 점선 칸 대신)
            <div className={styles.noPortrait} data-mono={name.trim() ? '' : undefined}>
              {name.trim() ? Array.from(name.trim())[0] : '초상화'}
            </div>
          )}
        </div>
        <div className={styles.who}>
          {full ? (
            <h2 className={styles.name}>{name}</h2>
          ) : (
            <p className={styles.name} data-empty={!name.trim() || undefined}>
              {name.trim() || '이름'}
            </p>
          )}
          <p className={styles.refresh}>
            {term('fatePoint')}{' '}
            <span className={styles.coins} aria-hidden>
              {Array.from({ length: refresh }, (_, i) => (
                <i key={i} />
              ))}
            </span>
            <small>
              {term('refresh')} {refresh}
            </small>
          </p>
        </div>
      </div>

      <ul className={styles.aspects}>
        {cards.map((c, i) => (
          <li key={i} className={styles.index} data-kind={c.kind}>
            <span className={styles.indexLabel}>{c.label}</span>
            <span className={styles.indexText} data-empty={!c.text.trim() || undefined}>
              {c.text.trim() || c.hint}
            </span>
          </li>
        ))}
      </ul>

      <ul className={styles.ratingList} aria-label={term('approach')}>
        {APPROACHES.map((a) => {
          const v = ratings[a];
          return (
            <li key={a} data-empty={v === null || undefined}>
              <span>{term(a)}</span>
              <span className={styles.pips} aria-hidden>
                {[1, 2, 3].map((n) => (
                  <i key={n} data-on={v !== null && n <= v ? '' : undefined} />
                ))}
              </span>
              <b>{v === null ? '–' : `+${v}`}</b>
            </li>
          );
        })}
      </ul>

      {stunts.length > 0 && (
        <ul className={styles.stuntList}>
          {stunts.map((s, i) => (
            <li key={i}>
              <b>{s.text.trim() || `${term('stunt')} ${i + 1}`}</b>{' '}
              {josa(term(s.approach), '으로/로')} {term(s.action)}할 때 +2
            </li>
          ))}
        </ul>
      )}

      {(story.trim() || !(full || saved)) && (
        <section className={styles.story} data-empty={!story.trim() || undefined}>
          <span className={styles.indexLabel}>지나온 이야기</span>
          <p>{story.trim() || '어디서 왔는지 (선택)'}</p>
        </section>
      )}
    </div>
  );
}
