'use client';

import { term } from '@fate/glossary';
import type { Aspect, InvokeMode, InvokePreview, PaidWith } from '@fate/rules-engine';
import { useEffect } from 'react';
import { AspectCard } from '../aspect/AspectCard';
import { FatePointToken } from '../fate/FatePointToken';
import styles from './InvokeTray.module.css';

export interface InvokeChoice {
  aspect: Aspect;
  owner?: string;
  bonus?: InvokePreview;
  reroll?: InvokePreview;
  /** 상대 캐릭터 특성이라 쓰면 상대가 운명점 1을 받는다 */
  against?: boolean;
  /** 발동할 수 없는 이유 (흐리게 표시) */
  blocked?: string;
}

interface Props {
  choices: InvokeChoice[];
  fatePoints: number;
  selectedId: string | null;
  onSelect: (aspectId: string) => void;
  onInvoke: (aspectId: string, mode: InvokeMode, paidWith: PaidWith) => void;
  onFinalize: () => void;
  /** 확정 버튼 문구 (방어자는 "방어 조정 완료") */
  finalizeLabel?: string;
  /** 있으면 확정을 막고 이 문구를 보여 준다 (상대가 조정 중일 때) */
  waiting?: string;
}

/** 굴림 직후 열리는 발동 트레이. 결과를 바꾸는 카드만 강조하고, 권하는 말은 하지 않는다. */
export function InvokeTray({
  choices,
  fatePoints,
  selectedId,
  onSelect,
  onInvoke,
  onFinalize,
  finalizeLabel = '이대로 확정',
  waiting,
}: Props) {
  const selected = choices.find((c) => c.aspect.id === selectedId && !c.blocked);
  const paidWith: PaidWith = selected?.aspect.freeInvokes ? 'free_invoke' : 'fate_point';
  const cost = paidWith === 'free_invoke' ? term('freeInvoke') : `${term('fatePoint')} 1`;

  // 숫자로 카드 고르기, F +2, R 다시 굴리기, Enter 확정
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target;
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const n = Number(e.key);
      if (n >= 1 && n <= 9 && choices[n - 1]) {
        e.preventDefault();
        onSelect(choices[n - 1]!.aspect.id);
        return;
      }
      const k = e.key.toLowerCase();
      if (selected && k === 'f') onInvoke(selected.aspect.id, 'bonus', paidWith);
      else if (selected && k === 'r') onInvoke(selected.aspect.id, 'reroll', paidWith);
      else if (e.key === 'Enter' && !e.repeat && !waiting) {
        e.preventDefault();
        onFinalize();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [choices, selected, paidWith, onSelect, onInvoke, onFinalize, waiting]);

  return (
    <div className={styles.tray}>
      <div className={styles.head}>
        INVOKE · {term('aspect')} {term('invoke')} · +2 또는 다시 굴리기
      </div>
      <div className={styles.cards}>
        {choices.map((c, i) => (
          <div
            key={c.aspect.id}
            className={styles.slot}
            data-selected={c.aspect.id === selectedId || undefined}
          >
            {i < 9 && (
              <kbd className={styles.key} aria-hidden>
                {i + 1}
              </kbd>
            )}
            <AspectCard
              aspect={c.aspect}
              size="sm"
              {...(c.owner ? { owner: c.owner } : {})}
              highlight={(c.bonus?.improves ?? false) && !c.blocked}
              disabled={!!c.blocked}
              {...(c.blocked
                ? { note: c.blocked }
                : c.against
                  ? { note: '쓰면 상대가 운명점 1을 받아요' }
                  : {})}
              onClick={() => onSelect(c.aspect.id)}
            />
          </div>
        ))}
      </div>
      <div className={styles.foot}>
        <span className={styles.fp}>
          내 {term('fatePoint')} <FatePointToken count={fatePoints} />
        </span>
        <div className={styles.buttons}>
          {selected && (
            <>
              <button
                type="button"
                className={styles.ghost}
                onClick={() => onInvoke(selected.aspect.id, 'reroll', paidWith)}
              >
                <kbd className={styles.keyInline} aria-hidden>
                  R
                </kbd>{' '}
                다시 굴리기 · {cost}
                {selected.reroll?.improveChance !== undefined && (
                  <small> ({Math.round(selected.reroll.improveChance * 100)}%로 나아짐)</small>
                )}
              </button>
              <button
                type="button"
                className={styles.ghost}
                onClick={() => onInvoke(selected.aspect.id, 'bonus', paidWith)}
              >
                <kbd className={styles.keyInline} aria-hidden>
                  F
                </kbd>{' '}
                +2 · {cost}
              </button>
            </>
          )}
          <button
            type="button"
            className={styles.primary}
            onClick={onFinalize}
            disabled={!!waiting}
            title={waiting}
          >
            {waiting ? (
              <>{waiting}…</>
            ) : (
              <>
                {finalizeLabel}{' '}
                <kbd className={styles.keyInline} aria-hidden>
                  Enter
                </kbd>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
