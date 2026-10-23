import { term } from '@fate/glossary';
import type { Aspect } from '@fate/rules-engine';
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
    >
      <span className={styles.label}>
        {label}
        {aspect.freeInvokes > 0 && (
          <span className={styles.free} title={term('freeInvoke')}>
            {'●'.repeat(aspect.freeInvokes)}
          </span>
        )}
      </span>
      <span className={styles.text}>{aspect.text}</span>
      {note && <span className={styles.note}>{note}</span>}
    </Tag>
  );
}
