import { term } from '@fate/glossary';
import {
  APPROACHES,
  CONSEQUENCE_SLOTS,
  CONSEQUENCE_VALUE,
  refreshFor,
  type Action,
  type Approach,
  type Aspect,
  type Character,
} from '@fate/rules-engine';
import { josa } from './josa';
import type { CharacterDraft } from './myCharacters';

/**
 * 캐릭터 시트를 다른 곳(메신저·메모·다른 툴)에 붙여 넣을 수 있는 글로 옮긴다.
 * 줄마다 「이름표: 내용」 꼴이고, 빈 칸은 빼며, 묶음 사이에는 빈 줄을 둔다.
 */

const sign = (n: number) => `${n >= 0 ? '+' : ''}${n}`;

const approachLine = (r: Partial<Record<Approach, number>>) =>
  `${term('approach')}: ${APPROACHES.map((a) => `${term(a)} ${sign(r[a] ?? 0)}`).join(' · ')}`;

const bonusText = (b: { approach: Approach; action: Action }) =>
  `${josa(term(b.approach), '으로/로')} ${term(b.action)}할 때 +2`;

function stuntLines(
  stunts: { text: string; bonus?: { approach: Approach; action: Action }; kind?: string }[],
): string[] {
  if (stunts.length === 0) return [];
  return [
    `${term('stunt')}`,
    ...stunts.map((s) => {
      const rule = [s.bonus && bonusText(s.bonus), s.kind === 'once_per_session' && '세션당 1회']
        .filter(Boolean)
        .join(', ');
      const name = s.text.trim();
      return `- ${name}${name && rule ? ': ' : ''}${rule}`;
    }),
  ];
}

const storyLines = (story: string | undefined) =>
  story?.trim() ? ['지나온 이야기', story.trim()] : [];

/** 묶음(줄 목록)들을 빈 줄 하나로 잇는다. 빈 묶음은 건너뛴다 */
const join = (...blocks: string[][]) =>
  blocks
    .filter((b) => b.length > 0)
    .map((b) => b.join('\n'))
    .join('\n\n');

/** 캐릭터 만들기에서 저장한 캐릭터 (내 캐릭터 · 운영자 목록) */
export function draftToText(d: CharacterDraft): string {
  const aspects = [
    `${term('high')}: ${d.highConcept.trim()}`,
    ...(d.trouble?.trim() ? [`${term('trouble')}: ${d.trouble.trim()}`] : []),
    ...(d.aspects ?? []).filter((t) => t.trim()).map((t) => `${term('aspect')}: ${t.trim()}`),
  ];
  return join(
    [d.name.trim()],
    aspects,
    [approachLine(d.approaches), `${term('refresh')}: ${refreshFor((d.stunts ?? []).length)}`],
    stuntLines(d.stunts ?? []),
    storyLines(d.backstory),
  );
}

/** 방 안의 캐릭터: 지금 운명점 · 스트레스 · 후유증까지 담는다 */
export function characterToText(c: Character, aspects: Aspect[]): string {
  const mine = aspects.filter((a) => a.ownerType === 'character' && a.ownerId === c.id);
  const byId = new Map(mine.map((a) => [a.id, a]));
  const order = ['high', 'trouble', 'normal', 'boost'] as const;
  const aspectLines = order.flatMap((k) =>
    mine
      .filter((a) => a.kind === k)
      .map((a) => `${k === 'normal' ? term('aspect') : term(k)}: ${a.text.trim()}`),
  );

  const status = [
    approachLine(c.approaches),
    ...(c.isNpc ? [] : [`${term('fatePoint')}: ${c.fatePoints} (${term('refresh')} ${c.refresh})`]),
    `${term('stress')}: ${c.stress.map((on) => (on ? '■' : '□')).join('')}`,
  ];

  const consequences = CONSEQUENCE_SLOTS.map((slot) => {
    const taken = c.consequences[slot];
    const label = `${term(slot)}(${CONSEQUENCE_VALUE[slot]})`;
    if (!taken) return `- ${label}: 비어 있음`;
    const text = byId.get(taken.aspectId)?.text.trim() ?? '';
    return `- ${label}: ${text}${taken.recovering ? ' (회복 중)' : ''}`;
  });

  const head = [
    c.name.trim(),
    ...(c.isNpc ? ['NPC'] : []),
    ...(c.takenOut ? [term('takenOut')] : []),
  ];
  return join(
    [head.join(' · ')],
    aspectLines,
    status,
    [term('consequence'), ...consequences],
    stuntLines(c.stunts),
    storyLines(c.backstory),
  );
}

/** 클립보드에 글을 넣는다. 보안 문맥이 아니라 Clipboard API가 없으면 옛 방식으로 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // 아래 옛 방식으로 한 번 더 해 본다
  }
  try {
    const box = document.createElement('textarea');
    box.value = text;
    box.setAttribute('readonly', '');
    box.style.position = 'fixed';
    box.style.opacity = '0';
    document.body.appendChild(box);
    box.select();
    const ok = document.execCommand('copy');
    box.remove();
    return ok;
  } catch {
    return false;
  }
}
