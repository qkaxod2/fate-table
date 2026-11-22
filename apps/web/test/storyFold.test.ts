import { describe, expect, it } from 'vitest';
import { foldScenes } from '@/components/log/StoryLog';
import type { LogLine } from '@/lib/copy';

const L = (seq: number, kind: LogLine['kind'], text: string): LogLine => ({ seq, kind, text });

describe('foldScenes', () => {
  const lines = [
    L(1, 'scene', '세션 1 시작!'),
    L(2, 'scene', '장면 시작: 선술집'),
    L(3, 'gm', '왁자지껄'),
    L(4, 'scene', '장면 시작: 숲'),
    L(5, 'chat', '하윤: 조용하다'),
    L(6, 'scene', '장면 시작: 성'),
    L(7, 'gm', '문이 열린다'),
  ];

  it('지난 장면은 한 줄로 접고 마지막 장면은 그대로 둔다', () => {
    const items = foldScenes(lines, new Set());
    expect(items).toEqual([
      { fold: { id: 2, title: '선술집', count: 3 } },
      { fold: { id: 4, title: '숲', count: 2 } },
      { line: lines[5] },
      { line: lines[6] },
    ]);
  });

  it('펼친 장면은 줄을 다 보여 준다', () => {
    const items = foldScenes(lines, new Set([4]));
    expect(items.filter((i) => 'line' in i)).toHaveLength(4);
  });

  it('장면이 하나뿐이면 접지 않는다', () => {
    expect(foldScenes(lines.slice(0, 3), new Set())).toHaveLength(3);
  });
});
