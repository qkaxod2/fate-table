'use client';

import { term, tip } from '@fate/glossary';
import {
  ACTIONS,
  APPROACHES,
  formatRating,
  refreshFor,
  type Action,
  type Approach,
  type Stunt,
} from '@fate/rules-engine';
import Link from 'next/link';
import { useState } from 'react';
import { PortraitStudio } from '@/components/media/PortraitStudio';
import { saveMyCharacter } from '@/lib/myCharacters';
import styles from './create.module.css';

const STEPS = ['컨셉', term('approach'), term('stunt'), '초상화', '완성'] as const;
const SPREAD = [3, 2, 2, 1, 1, 0];
const VALUES = [3, 2, 1, 0];
const MAX_STUNTS = 3;

type Ratings = Record<Approach, number | null>;

interface StuntDraft {
  text: string;
  approach: Approach;
  action: Action;
}

const emptyRatings = (): Ratings => Object.fromEntries(APPROACHES.map((a) => [a, null])) as Ratings;

/** 아직 남은 값 (예: +2가 하나 남음) */
function remaining(r: Ratings): number[] {
  const left = [...SPREAD];
  for (const v of Object.values(r)) {
    if (v === null) continue;
    const i = left.indexOf(v);
    if (i >= 0) left.splice(i, 1);
  }
  return left;
}

export function CreationWizard() {
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [high, setHigh] = useState('');
  const [trouble, setTrouble] = useState('');
  const [extra, setExtra] = useState(['', '']);
  const [ratings, setRatings] = useState<Ratings>(emptyRatings);
  const [stunts, setStunts] = useState<StuntDraft[]>([]);
  const [portrait, setPortrait] = useState<string | undefined>();
  const [saved, setSaved] = useState(false);

  const left = remaining(ratings);
  const conceptOk = name.trim() && high.trim() && trouble.trim();
  const ratingsOk = left.length === 0;
  const stuntsOk = stunts.every((s) => s.text.trim());
  const canNext = [conceptOk, ratingsOk, stuntsOk, true, false][step];

  function rate(a: Approach, v: number) {
    setRatings((r) => {
      if (r[a] === v) return { ...r, [a]: null };
      const next = { ...r, [a]: null };
      if (!remaining(next).includes(v)) return r;
      return { ...next, [a]: v };
    });
  }

  function save() {
    const approaches = Object.fromEntries(APPROACHES.map((a) => [a, ratings[a] ?? 0])) as Record<
      Approach,
      number
    >;
    const stuntList: Stunt[] = stunts.map((s, i) => ({
      id: `stunt-${i + 1}`,
      text: s.text.trim(),
      kind: 'bonus',
      bonus: { approach: s.approach, action: s.action, value: 2 },
    }));
    saveMyCharacter({
      key: crypto.randomUUID(),
      name: name.trim(),
      isNpc: false,
      approaches,
      stunts: stuntList,
      highConcept: high.trim(),
      trouble: trouble.trim(),
      aspects: extra.map((t) => t.trim()).filter(Boolean),
      portraitUrl: portrait,
      savedAt: new Date().toISOString(),
    });
    setSaved(true);
  }

  return (
    <main className={styles.main}>
      <header className={styles.top}>
        <Link href="/" className={styles.back}>
          ← 처음으로
        </Link>
        <h1 className={styles.title}>캐릭터 만들기</h1>
        <ol className={styles.steps}>
          {STEPS.map((s, i) => (
            <li key={s} data-state={i < step ? 'done' : i === step ? 'now' : 'todo'}>
              <span className={styles.stepNo}>{i + 1}</span>
              {s}
            </li>
          ))}
        </ol>
      </header>

      <section className={styles.card}>
        {step === 0 && (
          <div className={styles.form}>
            <Field label="이름">
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
            </Field>
            <Field label={term('high')} help={tip('high')} example="예: 망한 왕국의 마지막 기사">
              <input value={high} onChange={(e) => setHigh(e.target.value)} maxLength={80} />
            </Field>
            <Field label={term('trouble')} help={tip('trouble')} example="예: 맹세를 어길 수 없다">
              <input value={trouble} onChange={(e) => setTrouble(e.target.value)} maxLength={80} />
            </Field>
            {extra.map((v, i) => (
              <Field key={i} label={`${term('aspect')} ${i + 1} (선택)`}>
                <input
                  value={v}
                  onChange={(e) => setExtra((x) => x.map((t, j) => (j === i ? e.target.value : t)))}
                  maxLength={80}
                />
              </Field>
            ))}
          </div>
        )}

        {step === 1 && (
          <div className={styles.form}>
            <p className={styles.lead}>
              {formatRating(3)} 하나, {formatRating(2)} 둘, {formatRating(1)} 둘, {formatRating(0)}{' '}
              하나를 나눠 줘요.
              <span className={styles.left}>
                남은 값: {left.length ? left.map((v) => `+${v}`).join(' ') : '없음'}
              </span>
            </p>
            <ul className={styles.approaches}>
              {APPROACHES.map((a) => (
                <li key={a} className={styles.approach}>
                  <div>
                    <strong>{term(a)}</strong>
                    <span className={styles.muted}>{tip(a)}</span>
                  </div>
                  <div className={styles.values} role="group" aria-label={term(a)}>
                    {VALUES.map((v) => {
                      const on = ratings[a] === v;
                      const avail = on || left.includes(v);
                      return (
                        <button
                          key={v}
                          type="button"
                          aria-pressed={on}
                          disabled={!avail}
                          onClick={() => rate(a, v)}
                        >
                          +{v}
                        </button>
                      );
                    })}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {step === 2 && (
          <div className={styles.form}>
            <p className={styles.lead}>
              {term('stunt')}은 정해진 상황에서 +2를 받는 능력이에요. 3개까지 넣을 수 있고, 지금은
              비워 둬도 괜찮아요. {term('refresh')} {refreshFor(stunts.length)}
            </p>
            {stunts.map((s, i) => (
              <div key={i} className={styles.stunt}>
                <input
                  placeholder="예: 마지막 돌격"
                  value={s.text}
                  maxLength={80}
                  onChange={(e) =>
                    setStunts((x) =>
                      x.map((t, j) => (j === i ? { ...t, text: e.target.value } : t)),
                    )
                  }
                  aria-label={`${term('stunt')} ${i + 1} 이름`}
                />
                <span className={styles.muted}>:</span>
                <select
                  value={s.approach}
                  aria-label={term('approach')}
                  onChange={(e) =>
                    setStunts((x) =>
                      x.map((t, j) =>
                        j === i ? { ...t, approach: e.target.value as Approach } : t,
                      ),
                    )
                  }
                >
                  {APPROACHES.map((a) => (
                    <option key={a} value={a}>
                      {term(a)}
                    </option>
                  ))}
                </select>
                <span className={styles.muted}>으로</span>
                <select
                  value={s.action}
                  aria-label="행동"
                  onChange={(e) =>
                    setStunts((x) =>
                      x.map((t, j) => (j === i ? { ...t, action: e.target.value as Action } : t)),
                    )
                  }
                >
                  {ACTIONS.map((a) => (
                    <option key={a} value={a}>
                      {term(a)}
                    </option>
                  ))}
                </select>
                <span className={styles.muted}>할 때 +2</span>
                <button
                  type="button"
                  className={styles.remove}
                  onClick={() => setStunts((x) => x.filter((_, j) => j !== i))}
                  aria-label={`${term('stunt')} ${i + 1} 지우기`}
                >
                  ×
                </button>
              </div>
            ))}
            {stunts.length < MAX_STUNTS && (
              <button
                type="button"
                className={styles.ghost}
                onClick={() =>
                  setStunts((x) => [...x, { text: '', approach: 'forceful', action: 'attack' }])
                }
              >
                + {term('stunt')} 추가
              </button>
            )}
          </div>
        )}

        {step === 3 && <PortraitStudio value={portrait} onChange={setPortrait} />}

        {step === 4 && (
          <div className={styles.summary}>
            {portrait ? (
              <img src={portrait} alt={`${name} 초상화`} className={styles.portrait} />
            ) : (
              <div className={styles.noPortrait}>초상화 없음</div>
            )}
            <div className={styles.sheet}>
              <h2 className={styles.name}>{name}</h2>
              <p>
                <span className={styles.tag}>{term('high')}</span> {high}
              </p>
              <p>
                <span className={styles.tag}>{term('trouble')}</span> {trouble}
              </p>
              {extra
                .filter((t) => t.trim())
                .map((t) => (
                  <p key={t}>
                    <span className={styles.tag}>{term('aspect')}</span> {t}
                  </p>
                ))}
              <ul className={styles.ratingList}>
                {APPROACHES.map((a) => (
                  <li key={a}>
                    {term(a)} <b>+{ratings[a] ?? 0}</b>
                  </li>
                ))}
              </ul>
              {stunts.map((s) => (
                <p key={s.text} className={styles.muted}>
                  {s.text}: {term(s.approach)}으로 {term(s.action)}할 때 +2
                </p>
              ))}
              <p className={styles.muted}>
                {term('refresh')} {refreshFor(stunts.length)}
              </p>
              {saved ? (
                <p className={styles.ok} role="status">
                  이 브라우저에 저장했어요. 방이 열리면 바로 불러올 수 있어요.
                </p>
              ) : (
                <button type="button" className={styles.primary} onClick={save}>
                  저장하기
                </button>
              )}
            </div>
          </div>
        )}
      </section>

      <footer className={styles.nav}>
        <button
          type="button"
          className={styles.ghost}
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
        >
          이전
        </button>
        {step < STEPS.length - 1 && (
          <button
            type="button"
            className={styles.primary}
            onClick={() => setStep((s) => s + 1)}
            disabled={!canNext}
          >
            {step === 3 && !portrait ? '초상화 없이 다음' : '다음'}
          </button>
        )}
      </footer>
    </main>
  );
}

function Field({
  label,
  help,
  example,
  children,
}: {
  label: string;
  help?: string;
  example?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={styles.field}>
      <span className={styles.label}>{label}</span>
      {help && <span className={styles.muted}>{help}</span>}
      {children}
      {example && <span className={styles.example}>{example}</span>}
    </label>
  );
}
