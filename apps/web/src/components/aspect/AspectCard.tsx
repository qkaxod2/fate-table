import { term } from '@fate/glossary';
import type { Aspect } from '@fate/rules-engine';
import type { PointerEvent } from 'react';
import styles from './AspectCard.module.css';

const KIND_LABEL: Record<Aspect['kind'], string> = {
  high: term('high'),
  trouble: term('trouble'),
  normal: term('normal'),
  situation: term('situation'),
  consequence: term('consequence'),
  boost: term('boost'),
};

interface Props {
  aspect: Aspect;
  /** 카드 위 작은 줄 앞에 붙는 말 (예: 캐릭터 이름) */
  owner?: string;
  /** 발동 트레이: 결과를 바꾸는 카드 강조 */
  highlight?: boolean;
  disabled?: boolean;
  note?: string;
  onClick?: () => void;
  size?: 'md' | 'sm';
}

/** 누를 수 있는 카드는 마우스 쪽으로 살짝 기울고, 종이 위에 빛이 따라온다 */
function tilt(e: PointerEvent<HTMLElement>) {
  if (e.pointerType !== 'mouse') return;
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width;
  const y = (e.clientY - r.top) / r.height;
  el.style.setProperty('--rx', `${((0.5 - y) * 8).toFixed(2)}deg`);
  el.style.setProperty('--ry', `${((x - 0.5) * 10).toFixed(2)}deg`);
  el.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`);
  el.style.setProperty('--my', `${(y * 100).toFixed(1)}%`);
}

function untilt(e: PointerEvent<HTMLElement>) {
  for (const v of ['--rx', '--ry', '--mx', '--my']) e.currentTarget.style.removeProperty(v);
}

export function AspectCard({
  aspect,
  owner,
  highlight,
  disabled,
  note,
  onClick,
  size = 'md',
}: Props) {
  const label = [KIND_LABEL[aspect.kind], owner].filter(Boolean).join(' · ');
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      className={styles.card}
      data-kind={aspect.kind}
      data-size={size}
      data-highlight={highlight || undefined}
      data-disabled={disabled || undefined}
      disabled={onClick ? disabled : undefined}
      onClick={onClick}
      {...(onClick && !disabled ? { onPointerMove: tilt, onPointerLeave: untilt } : {})}
    >
      <span className={styles.label}>
        {label}
        {aspect.freeInvokes > 0 && (
          <span
            className={styles.free}
            title={`${term('freeInvoke')} ${aspect.freeInvokes}`}
            aria-label={`${term('freeInvoke')} ${aspect.freeInvokes}`}
          >
            {Array.from({ length: aspect.freeInvokes }, (_, i) => (
              <i key={i} className={styles.pin} />
            ))}
          </span>
        )}
      </span>
      <span className={styles.text}>{aspect.text}</span>
      {note && <span className={styles.note}>{note}</span>}
    </Tag>
  );
}
