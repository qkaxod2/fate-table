import { term } from '@fate/glossary';
import type { Aspect, Character, ConsequenceSlot } from '@fate/rules-engine';
import { FatePointToken } from '../fate/FatePointToken';
import styles from './MySheet.module.css';

const SLOTS: ReadonlyArray<readonly [ConsequenceSlot, number]> = [
  ['mild', 2],
  ['moderate', 4],
  ['severe', 6],
];

export interface Companion {
  character: Character;
  image?: string;
  /** 이름 옆 작은 글자 (예: 플레이어 닉네임, NPC) */
  note?: string;
}

/** 책 첫머리: 내 캐릭터 기록지(초상·운명점·스트레스·후유증)와 동료 한 줄 */
export function MySheet({
  character: c,
  aspects,
  image,
  companions = [],
  onPick,
  pickHint,
  onOpenSheet,
  compact,
}: {
  /** 없으면(GM·관전) 동료 줄만 보인다 */
  character?: Character | undefined;
  /** 방의 특성 전체 (state.aspects): 핵심 컨셉·약점·후유증 문구를 찾는다 */
  aspects: Readonly<Record<string, Aspect>>;
  image?: string;
  companions?: Companion[];
  /** 동료를 누르면 (시트 열기, 움직일 캐릭터로 고르기) */
  onPick?: (id: string) => void;
  pickHint?: (id: string) => string;
  /** 내 캐릭터 시트 전체(특성·접근법·특기)를 펼친다 */
  onOpenSheet?: () => void;
  /** 한 줄 기록 (GM: 움직이는 NPC는 무대 이름표에도 나오니 짧게) */
  compact?: boolean;
}) {
  if (!c)
    return (
      <section className={styles.sheet} aria-label="파티">
        <CompanionList companions={companions} onPick={onPick} pickHint={pickHint} />
      </section>
    );
  const mine = Object.values(aspects).filter(
    (a) => a.ownerType === 'character' && a.ownerId === c.id,
  );
  const high = mine.find((a) => a.kind === 'high')?.text;
  const trouble = mine.find((a) => a.kind === 'trouble')?.text;
  return (
    <section
      className={styles.sheet}
      aria-label={`${c.name} 기록지`}
      data-out={c.takenOut || undefined}
      data-compact={compact || undefined}
    >
      <div className={styles.me}>
        {image && <img className={styles.portrait} src={image} alt="" />}
        <div className={styles.body}>
          <h2 className={styles.name}>
            {c.name}
            {onOpenSheet && (
              <button type="button" className={styles.open} onClick={onOpenSheet}>
                시트 펼치기
              </button>
            )}
          </h2>
          {(high || trouble) && (
            <p className={styles.concept}>
              {high}
              {trouble && (
                <>
                  {high && ' · '}
                  {term('trouble')}: {trouble}
                </>
              )}
            </p>
          )}
          <div className={styles.stats}>
            {/* NPC는 운명점 대신 GM 풀을 쓴다 (GM 서랍 줄에 보인다) */}
            {!c.isNpc && (
              <div className={styles.stat}>
                <span className={styles.label}>{term('fatePoint')}</span>
                <span data-fx-fp={c.id} className={styles.coins}>
                  <FatePointToken count={c.fatePoints} />
                </span>
              </div>
            )}
            <div className={styles.stat}>
              <span className={styles.label}>{term('stress')}</span>
              <span className={styles.boxes}>
                {c.stress.map((used, i) => (
                  <span key={i} className={styles.box} data-used={used || undefined}>
                    {i + 1}
                  </span>
                ))}
              </span>
            </div>
            <div className={styles.stat}>
              <span className={styles.label}>{term('consequence')}</span>
              <span className={styles.cons}>
                {SLOTS.map(([slot, n]) => {
                  const taken = c.consequences[slot];
                  return (
                    <span
                      key={slot}
                      className={styles.slot}
                      data-used={taken ? true : undefined}
                      title={taken ? aspects[taken.aspectId]?.text : undefined}
                    >
                      {term(slot)} {n}
                    </span>
                  );
                })}
              </span>
            </div>
          </div>
        </div>
      </div>
      <CompanionList companions={companions} onPick={onPick} pickHint={pickHint} />
    </section>
  );
}

function CompanionList({
  companions,
  onPick,
  pickHint,
}: {
  companions: Companion[];
  onPick?: ((id: string) => void) | undefined;
  pickHint?: ((id: string) => string) | undefined;
}) {
  if (companions.length === 0) return null;
  return (
    <ul className={styles.companions}>
      {companions.map(({ character: o, image: img, note }) => {
        const inner = (
          <>
            {img ? (
              <img src={img} alt="" />
            ) : (
              <span className={styles.initial}>{o.name.slice(0, 1)}</span>
            )}
            <span>{o.name}</span>
            {note && <small>{note}</small>}
            {!o.isNpc && (
              <span data-fx-fp={o.id} className={styles.smallCoins}>
                <FatePointToken count={o.fatePoints} />
              </span>
            )}
            <span className={styles.miniStress} aria-label={term('stress')}>
              {o.stress.map((used, i) => (
                <i key={i} data-used={used || undefined} />
              ))}
            </span>
          </>
        );
        return (
          <li key={o.id} data-out={o.takenOut || undefined}>
            {onPick ? (
              <button type="button" title={pickHint?.(o.id)} onClick={() => onPick(o.id)}>
                {inner}
              </button>
            ) : (
              inner
            )}
          </li>
        );
      })}
    </ul>
  );
}
