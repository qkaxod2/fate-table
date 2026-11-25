/*
 * 운명점 테이블 표지: 모서리 쪽에서 본 페이트 주사위 (design-system.md 36절).
 * 한눈에 세 면이 보인다. 위는 빈칸, 왼쪽은 +, 오른쪽은 −. 굴림의 세 결과가 한 물건에 다 있다.
 * 색은 놋쇠 한 가지를 빛 받는 정도로 세 단계로 나눈다(위가 가장 밝다). mono는 글자색 한 가지.
 * 24px 이하에서는 틈과 기호를 굵게 한 작은 판(small)을 쓴다.
 */

const PATHS = {
  large: {
    top: 'M128 21.4L215.7 72L128 122.6L40.3 72Z',
    left: 'M34.8 81.5L122.5 132.2L122.5 233.5L34.8 182.8ZM70.4 121.8L86.9 131.2L86.9 152.8L105.5 163.5L105.5 182.5L86.9 171.8L86.9 193.2L70.4 183.8L70.4 162.2L51.8 151.5L51.8 132.5L70.4 143.2Z',
    right:
      'M133.5 132.2L221.2 81.5L221.2 182.8L133.5 233.5ZM150.5 163.5L204.2 132.5L204.2 151.5L150.5 182.5Z',
  },
  small: {
    top: 'M128 25.4L208.7 72L128 118.6L47.3 72Z',
    left: 'M38.3 87.6L119 134.2L119 227.4L38.3 180.8ZM67.4 121L89.9 134L89.9 151L104.6 159.5L104.6 185.5L89.9 177L89.9 194L67.4 181L67.4 164L52.7 155.5L52.7 129.5L67.4 138Z',
    right:
      'M137 134.2L217.7 87.6L217.7 180.8L137 227.4ZM151.4 159.5L203.3 129.5L203.3 155.5L151.4 185.5Z',
  },
} as const;

interface Props {
  /** 한 변의 픽셀 크기 */
  size?: number;
  /** brass: 놋쇠 세 단계 · mono: 글자색 한 가지 */
  tone?: 'brass' | 'mono';
  className?: string;
  /** 주면 읽을 수 있는 그림, 안 주면 장식 */
  title?: string;
}

export function BrandMark({ size = 32, tone = 'brass', className, title }: Props) {
  const p = size <= 24 ? PATHS.small : PATHS.large;
  const fill = (face: 1 | 2 | 3) => (tone === 'mono' ? 'currentColor' : `var(--mark-${face})`);
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 256 256"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      <path data-face="top" fill={fill(1)} d={p.top} />
      <path data-face="left" fill={fill(2)} fillRule="evenodd" d={p.left} />
      <path data-face="right" fill={fill(3)} fillRule="evenodd" d={p.right} />
    </svg>
  );
}
