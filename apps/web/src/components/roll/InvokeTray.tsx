'use client';

import { term } from '@fate/glossary';
import type { Aspect, InvokeMode, InvokePreview, PaidWith } from '@fate/rules-engine';
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
}

/** 굴림 직후 열리는 발동 트레이. 결과를 바꾸는 카드만 강조하고, 권하는 말은 하지 않는다. */
export function InvokeTray({
  choices,
  fatePoints,
  selectedId,
  onSelect,
  onInvoke,
  onFinalize,
}: Props) {
  const selected = choices.find((c) => c.aspect.id === selectedId && !c.blocked);
  const paidWith: PaidWith = selected?.aspect.freeInvokes ? 'free_invoke' : 'fate_point';
  const cost = paidWith === 'free_invoke' ? term('freeInvoke') : `${term('fatePoint')} 1`;

  return (
    <div className={styles.tray}>
      <div className={styles.head}>
        INVOKE · {term('aspect')} {term('invoke')} · +2 또는 다시 굴리기
      </div>
      <div className={styles.cards}>
        {choices.map((c) => (
          <AspectCard
            key={c.aspect.id}
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
                +2 · {cost}
              </button>
            </>
          )}
          <button type="button" className={styles.primary} onClick={onFinalize}>
            이대로 확정
          </button>
        </div>
      </div>
    </div>
  );
}
