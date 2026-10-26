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
import { useRouter } from 'next/navigation';
import { useState, useSyncExternalStore } from 'react';
import { PortraitStudio } from '@/components/media/PortraitStudio';
import { josa } from '@/lib/josa';
import { roomHref } from '@/lib/lobby';
import { saveMyCharacter } from '@/lib/myCharacters';
import styles from './create.module.css';

const STEPS = ['컨셉', term('approach'), term('stunt'), '초상화', '완성'] as const;
const SPREAD = [3, 2, 2, 1, 1, 0];
const VALUES = [3, 2, 1, 0];
const MAX_STUNTS = 3;

/** 나머지 특성 두 칸에 무엇을 적으면 좋을지 */
const EXTRA_HELP = [
  `${term('high')}과 ${term('trouble')} 말고도 캐릭터를 잘 보여 주는 점을 하나 더 적어요. 아끼는 물건, 특별한 재주, 남다른 버릇 같은 거요.`,
  '다른 사람과의 관계나 지나온 일을 적어 봐요. 누구에게 빚을 졌는지, 누구와 원수인지 같은 거요. 비워 두고 게임하면서 채워도 돼요.',
];
const EXTRA_EXAMPLE = ['예: 아버지가 남긴 낡은 방패', '예: 세라에게는 목숨을 빚졌다'];

type Ratings = Record<Approach, number | null>;

interface StuntDraft {
  text: string;
  approach: Approach;
  action: Action;
}

const emptyRatings = (): Ratings => Object.fromEntries(APPROACHES.map((a) => [a, null])) as Ratings;

const noSubscribe = () => () => {};

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
  /** 넘어가는 방향: 다음이면 오른쪽에서, 이전이면 왼쪽에서 들어온다 */
  const [dir, setDir] = useState<'next' | 'back'>('next');
  const go = (to: number) => {
    setDir(to > step ? 'next' : 'back');
    setStep(to);
  };
  const [name, setName] = useState('');
  const [high, setHigh] = useState('');
  const [trouble, setTrouble] = useState('');
  const [extra, setExtra] = useState(['', '']);
  const [ratings, setRatings] = useState<Ratings>(emptyRatings);
  const [stunts, setStunts] = useState<StuntDraft[]>([]);
  const [portrait, setPortrait] = useState<string | undefined>();
  const [saved, setSaved] = useState(false);
  const router = useRouter();
  /** 방에서 넘어왔다면 그 방 (?room=id). 다 만들거나 그만두면 그 방으로 돌아간다 */
  const fromRoom = useSyncExternalStore(
    noSubscribe,
    () => new URLSearchParams(location.search).get('room'),
    () => null,
  );

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
    const key = crypto.randomUUID();
    saveMyCharacter({
      key,
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
    // 방에서 왔다면 돌아가서 바로 그 방에 데려온다
    if (fromRoom) router.push(`${roomHref(fromRoom)}&bring=${encodeURIComponent(key)}`);
  }

  return (
    <main className={styles.main}>
      <header className={styles.top}>
        {fromRoom ? (
          <Link href={roomHref(fromRoom)} className={styles.back}>
            ← 방으로 돌아가기
          </Link>
        ) : (
          <Link href="/" className={styles.back}>
            ← 처음으로
          </Link>
        )}
        <h1 className={styles.title}>캐릭터 만들기</h1>
        <ol className={styles.steps} aria-label="단계">
          {STEPS.map((s, i) => {
            const state = i < step ? 'done' : i === step ? 'now' : 'todo';
            const label = (
              <>
                <span className={styles.stepNo} aria-hidden>
                  {state === 'done' ? '✓' : i + 1}
                </span>
                {s}
              </>
            );
            return (
              <li key={s} data-state={state} aria-current={state === 'now' ? 'step' : undefined}>
                {/* 지나온 단계는 눌러서 돌아가 고칠 수 있다 */}
                {state === 'done' && step < STEPS.length - 1 ? (
                  <button type="button" className={styles.stepBtn} onClick={() => go(i)}>
                    {label}
                  </button>
                ) : (
                  label
                )}
              </li>
            );
          })}
        </ol>
      </header>

      <div className={styles.desk} data-final={step === STEPS.length - 1 || undefined}>
        <section className={styles.card}>
          <div key={step} className={styles.pane} data-dir={dir}>
            {step === 0 && (
              <div className={styles.form}>
                <div className={styles.lead}>
                  <p>
                    {term('aspect')}은 캐릭터를 설명하는 짧은 문구예요. 숫자 대신 &quot;이 사람은
                    어떤 사람인가&quot;를 말로 적어 두는 거죠. 적는 대로 오른쪽 카드에 바로 써져요.
                  </p>
                  <p>
                    굴림이 아쉬우면 {term('fatePoint')} 1개를 내고 {term('aspect')}을{' '}
                    {term('invoke')}해 +2를 받아요. 이때 &quot;이 {term('aspect')} 덕분에
                    잘한다&quot;는 이유를 이야기로 대요. 반대로 GM이 {term('aspect')} 때문에 일이
                    꼬인다고 제안하면, 받아들이는 대가로 {term('fatePoint')}을 얻어요.
                  </p>
                  <p>
                    그래서 장점과 단점이 함께 보이는 문구가 좋아요. &quot;힘이 세다&quot;보다
                    &quot;황소도 넘어뜨리는 대장장이&quot;가 쓸 곳이 많아요.
                  </p>
                </div>
                <Field label="이름">
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={40}
                    placeholder="예: 하윤"
                  />
                </Field>
                <Field
                  label={term('high')}
                  help={`캐릭터가 어떤 사람인지 한 줄로 요약해요. 직업이나 역할에 특징 하나를 붙이면 좋아요. 게임에서 가장 자주 ${term('invoke')}하게 될 ${term('aspect')}이에요.`}
                  example="예: 망한 왕국의 마지막 기사"
                >
                  <input value={high} onChange={(e) => setHigh(e.target.value)} maxLength={80} />
                </Field>
                <Field
                  label={term('trouble')}
                  help={`캐릭터를 자꾸 곤란하게 만드는 점이에요. 나쁜 버릇, 쫓아오는 원수, 꼭 지켜야 하는 맹세 같은 거요. GM이 이걸로 일을 꼬이게 하면 ${term('fatePoint')}을 받을 수 있어요.`}
                  example="예: 맹세를 어길 수 없다"
                >
                  <input
                    value={trouble}
                    onChange={(e) => setTrouble(e.target.value)}
                    maxLength={80}
                  />
                </Field>
                {extra.map((v, i) => (
                  <Field
                    key={i}
                    label={`${term('aspect')} ${i + 1} (선택)`}
                    help={EXTRA_HELP[i]}
                    example={EXTRA_EXAMPLE[i]}
                  >
                    <input
                      value={v}
                      onChange={(e) =>
                        setExtra((x) => x.map((t, j) => (j === i ? e.target.value : t)))
                      }
                      maxLength={80}
                    />
                  </Field>
                ))}
              </div>
            )}

            {step === 1 && (
              <div className={styles.form}>
                <p className={styles.lead}>
                  여섯 {term('approach')}에 {formatRating(3)} 하나, {formatRating(2)} 둘,{' '}
                  {formatRating(1)} 둘, {formatRating(0)} 하나를 나눠 줘요. 가장 자신 있는 방식에
                  +3을 주면 돼요.
                </p>
                <Allocation ratings={ratings} />
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
                  {josa(term('stunt'), '은/는')} 정해진 상황에서 +2를 받는 능력이에요. 3개까지 넣을
                  수 있고, 지금은 비워 둬도 괜찮아요. 세션이 시작될 때마다 {term('fatePoint')}은{' '}
                  {refreshFor(stunts.length)}개까지 채워져요. 이 수를 {term('refresh')}이라고 해요.
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
                    <span className={styles.muted}>
                      {josa(term(s.approach), '으로/로').slice(term(s.approach).length)}
                    </span>
                    <select
                      value={s.action}
                      aria-label="행동"
                      onChange={(e) =>
                        setStunts((x) =>
                          x.map((t, j) =>
                            j === i ? { ...t, action: e.target.value as Action } : t,
                          ),
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
              <div className={styles.summary} data-saved={saved || undefined}>
                <Sheet
                  name={name}
                  high={high}
                  trouble={trouble}
                  extra={extra}
                  ratings={ratings}
                  stunts={stunts}
                  portrait={portrait}
                  full
                />
                <div className={styles.finish}>
                  {saved ? (
                    <p className={styles.ok} role="status">
                      {fromRoom
                        ? '저장했어요. 방으로 돌아가는 중…'
                        : '이 브라우저에 저장했어요. 방에 들어가면 바로 불러올 수 있어요.'}
                    </p>
                  ) : (
                    <button type="button" className={styles.primary} onClick={save}>
                      {fromRoom ? '저장하고 방으로 돌아가기' : '저장하기'}
                    </button>
                  )}
                  {saved && !fromRoom && (
                    <p className={styles.next}>
                      <Link href="/rooms/new/">방 만들기</Link>
                      <Link href="/join/">초대 코드로 참가</Link>
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>

        {step < STEPS.length - 1 && (
          <aside className={styles.preview} aria-label="캐릭터 카드 미리보기">
            <p className={styles.previewHead}>미리보기</p>
            <Sheet
              name={name}
              high={high}
              trouble={trouble}
              extra={extra}
              ratings={ratings}
              stunts={stunts}
              portrait={portrait}
            />
          </aside>
        )}
      </div>

      <footer className={styles.nav}>
        <button
          type="button"
          className={styles.ghost}
          onClick={() => go(Math.max(0, step - 1))}
          disabled={step === 0}
        >
          이전
        </button>
        {step < STEPS.length - 1 && (
          <button
            type="button"
            className={styles.primary}
            onClick={() => go(step + 1)}
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

/**
 * 접근법 배분 토큰 여섯 개 (+3 +2 +2 +1 +1 +0). 이미 준 값은 주홍으로 차고 받은 접근법 이름이 붙는다.
 * 남은 값이 한눈에 보인다.
 */
function Allocation({ ratings }: { ratings: Ratings }) {
  const used = new Map<number, Approach[]>();
  for (const a of APPROACHES) {
    const v = ratings[a];
    if (v !== null) used.set(v, [...(used.get(v) ?? []), a]);
  }
  const seen = new Map<number, number>();
  const left = remaining(ratings);
  return (
    <div className={styles.alloc}>
      <ol className={styles.tokens} aria-label={`${term('approach')} 배분`}>
        {SPREAD.map((v, i) => {
          const n = seen.get(v) ?? 0;
          seen.set(v, n + 1);
          const owner = used.get(v)?.[n];
          return (
            <li key={i} className={styles.token} data-used={owner ? '' : undefined}>
              <b>+{v}</b>
              <span>{owner ? term(owner) : '남음'}</span>
            </li>
          );
        })}
      </ol>
      <p className={styles.allocNote} role="status">
        {left.length
          ? `남은 값 ${left.map((v) => `+${v}`).join(' ')}`
          : `다 나눴어요. 바꾸려면 숫자를 한 번 더 눌러 비워요.`}
      </p>
    </div>
  );
}

/**
 * 캐릭터 기록지: 초상 + 이름 + 특성 인덱스 카드 + 접근법 + 특기.
 * 만드는 동안에는 오른쪽 미리보기로, 완성 화면에서는 크게(full) 쓴다.
 */
function Sheet({
  name,
  high,
  trouble,
  extra,
  ratings,
  stunts,
  portrait,
  full = false,
}: {
  name: string;
  high: string;
  trouble: string;
  extra: string[];
  ratings: Ratings;
  stunts: StuntDraft[];
  portrait: string | undefined;
  full?: boolean;
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
      .filter((c) => (full ? c.text.trim() : true)),
  ];
  const refresh = refreshFor(stunts.length);
  return (
    <div className={styles.sheetCard} data-full={full || undefined}>
      <div className={styles.sheetTop}>
        <div className={styles.photo} data-none={!portrait || undefined}>
          {portrait ? (
            <img src={portrait} alt={`${name} 초상화`} className={styles.portrait} />
          ) : (
            <div className={styles.noPortrait}>{full ? '초상화 없음' : '초상화'}</div>
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
            {term('fatePoint')} <span aria-hidden>{'◆'.repeat(refresh)}</span>
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
    </div>
  );
}
