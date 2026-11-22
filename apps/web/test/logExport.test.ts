import { describe, expect, it } from 'vitest';
import type { LogLine } from '@/lib/copy';
import { exportFileName, logToMarkdown, richToMarkdown } from '@/lib/logExport';
import { doingLine, readPresence } from '@/state/presence';

const L = (seq: number, kind: LogLine['kind'], text: string): LogLine => ({ seq, kind, text });

describe('logToMarkdown', () => {
  it('장면은 제목, 대사는 문단, 말은 화자, 굴림은 인용 메모로 적는다', () => {
    const md = logToMarkdown(
      [
        L(1, 'scene', '세션 1 시작! 운명점이 재충전 수치까지 채워진다'),
        L(2, 'scene', '장면 시작: 비 오는 선술집'),
        L(3, 'gm', '빗소리가 [글리치]지붕을[/글리치] 두드린다.'),
        L(4, 'chat', '하윤: **잠깐**, 저 사람 누구야?'),
        L(5, 'roll', '하윤: 극복 · 영리하게'),
        L(6, 'fate', '하윤 운명점 -1'),
        L(7, 'system', '민수님이 들어왔다'),
        L(8, 'chat', '# 제목 아님'),
      ],
      { title: '달빛 원정', date: new Date(2026, 10, 22) },
    );
    expect(md).toContain('# 달빛 원정');
    expect(md).toContain('## 세션 1');
    expect(md).toContain('## 비 오는 선술집');
    expect(md).toContain('빗소리가 지붕을 두드린다.');
    expect(md).toContain('**하윤**: **잠깐**, 저 사람 누구야?');
    expect(md).toContain('> 🎲 하윤: 극복 · 영리하게  \n> 🎲 하윤 운명점 -1');
    expect(md).not.toContain('들어왔다');
    expect(md).toContain('\\# 제목 아님');
  });

  it('GM 연출 표시는 글자만 남긴다', () => {
    expect(richToMarkdown('[뒤집기]거꾸로[/뒤집기] *살짝*')).toBe('거꾸로 *살짝*');
  });

  it('파일 이름에서 쓸 수 없는 글자를 뺀다', () => {
    expect(exportFileName('달빛: 원정/1', new Date(2026, 0, 5))).toBe('달빛-원정-1-2026-01-05.md');
  });
});

describe('presence', () => {
  it('탭 여러 개 중 하나라도 하는 일을 보여 주고, 나는 빼고 적는다', () => {
    const p = readPresence({
      a: [
        { nickname: '하윤', doing: null },
        { nickname: '하윤', doing: 'typing' },
      ],
      b: [{ nickname: '민수', doing: 'defending' }],
      me: [{ nickname: '나', doing: 'typing' }],
    });
    expect(p.a?.doing).toBe('typing');
    expect(doingLine(p, 'me', 'typing')).toBe('하윤 님이 쓰는 중…');
    expect(doingLine(p, 'me', 'defending')).toBe('민수 님이 방어를 고르는 중…');
    expect(doingLine(p, 'b', 'defending')).toBeNull();
  });
});
