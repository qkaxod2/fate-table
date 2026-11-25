import type { Metadata } from 'next';
import { DiceLab } from './DiceLab';

export const metadata: Metadata = {
  title: '주사위 실험실 · 운명점 테이블',
  robots: { index: false },
};

// 시험판 화면: 지금 쓰는 CSS 주사위와 Three.js 주사위를 같은 굴림으로 나란히 굴려 본다.
// 메뉴에는 걸지 않는다 (docs/threejs-review.md)
export default function DiceLabPage() {
  return <DiceLab />;
}
