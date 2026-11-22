// 세션 기록을 마크다운으로 내보낸다. 책(StoryLog book)처럼 장면은 제목, GM 대사는 문단,
// 말은 화자와 대사, 굴림·운명점은 인용 메모로 적는다. 입장·생성 같은 알림은 뺀다.
import { parseRich } from '@fate/rules-engine';
import type { LogLine } from './copy';

/** 꾸민 글을 마크다운으로: 굵게·기울임은 살리고 GM 연출 표시([글리치] 등)는 글자만 남긴다 */
export function richToMarkdown(text: string): string {
  return parseRich(text, { gm: true })
    .map((s) => {
      if (!s.text.trim()) return s.text;
      if (s.bold && s.italic) return `***${s.text}***`;
      if (s.bold) return `**${s.text}**`;
      if (s.italic) return `*${s.text}*`;
      return s.text;
    })
    .join('');
}

/** 마크다운 제목·목록으로 읽히지 않게 줄 앞 기호를 막는다 */
function safe(line: string): string {
  return line.replace(/^(\s*)([#>\-+]|\d+\.)(\s)/, '$1\\$2$3');
}

/** "하윤: 대사" → 화자와 대사 (StoryLog와 같은 규칙) */
function splitSpeaker(text: string): [string | null, string] {
  const m = /^([^:：]{1,16})[:：]\s*(.+)$/s.exec(text);
  return m ? [m[1]!, m[2]!] : [null, text];
}

export interface ExportOptions {
  title: string;
  /** 머리말에 적을 날짜 */
  date?: Date;
  /** 입장·생성 같은 알림도 넣는다 */
  withSystem?: boolean;
}

export function logToMarkdown(lines: readonly LogLine[], opts: ExportOptions): string {
  const date = (opts.date ?? new Date()).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const out: string[] = [`# ${opts.title}`, '', `_${date} · 운명점 테이블 기록_`, ''];
  let notes: string[] = [];
  const flush = () => {
    if (notes.length === 0) return;
    out.push(...notes.map((n) => `> ${n}  `), '');
    notes = [];
  };
  for (const l of lines) {
    switch (l.kind) {
      case 'scene': {
        flush();
        const scene = /^장면 시작: (.+)$/.exec(l.text);
        const session = /^세션 (\d+) 시작/.exec(l.text);
        if (scene) out.push(`## ${scene[1]}`, '');
        else if (session) out.push(`---`, '', `## 세션 ${session[1]}`, '');
        else out.push(`*${l.text}*`, '');
        break;
      }
      case 'gm':
        flush();
        out.push(
          ...richToMarkdown(l.text)
            .split('\n')
            .map((p) => safe(p)),
          '',
        );
        break;
      case 'chat': {
        flush();
        const [who, said] = splitSpeaker(l.text);
        const body = richToMarkdown(said).replace(/\n/g, '  \n');
        out.push(who ? `**${who}**: ${body}` : safe(body), '');
        break;
      }
      case 'roll':
      case 'fate':
        notes.push(`🎲 ${l.text}`);
        break;
      case 'system':
        if (opts.withSystem) notes.push(`· ${l.text}`);
        break;
    }
  }
  flush();
  return `${out.join('\n').trimEnd()}\n`;
}

/** 파일 이름에 쓸 수 없는 글자를 뺀다 */
export function exportFileName(title: string, date = new Date()): string {
  const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const base = title.replace(/[\\/:*?"<>|\s]+/g, '-').replace(/^-+|-+$/g, '') || '기록';
  return `${base}-${day}.md`;
}

/** 브라우저에서 파일로 받는다 */
export function downloadText(name: string, text: string, type = 'text/markdown'): void {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
