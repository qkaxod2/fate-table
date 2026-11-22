// 디스코드 알림: 방에 붙인 웹훅으로 세션 시작·끝, 장면 전환, 대성공, 퇴장을 한 줄씩 보낸다.
// 공개 이벤트만 다룬다. 보내기에 실패해도 명령에는 영향이 없다.
import type { StoredEvent } from '../_shared/http.ts';

/** 이름을 찾는 데 필요한 만큼의 방 상태 (명령을 처리하기 전 상태) */
export interface NameSource {
  characters: Record<string, { name: string }>;
  rolls: Record<string, { active: { characterId: string } }>;
}

const WEBHOOK =
  /^https:\/\/(ptb\.|canary\.)?discord(app)?\.com\/api\/webhooks\/[0-9]+\/[A-Za-z0-9_-]+$/;
export const isDiscordWebhook = (url: string) => WEBHOOK.test(url);

/** 마크다운으로 읽히지 않게 이름 속 기호를 막는다 */
const esc = (s: string) => s.replace(/([\\*_~`|>#@[\]()])/g, '\\$1');

export function discordLines(events: readonly StoredEvent[], before: NameSource): string[] {
  const nameOf = (id: string | undefined) =>
    id ? esc(before.characters[id]?.name ?? created(events, id) ?? '누군가') : '누군가';
  const out: string[] = [];
  for (const e of events) {
    if (e.visibility !== 'public') continue;
    const p = e.payload as Record<string, unknown>;
    switch (e.type) {
      case 'session.started':
        out.push(`📖 **세션 ${p.number}** 시작${p.title ? ` · ${esc(String(p.title))}` : ''}`);
        break;
      case 'session.ended':
        out.push(`🏁 세션 끝${p.summary ? `: ${esc(String(p.summary))}` : ''}`);
        break;
      case 'scene.started':
        out.push(`🎬 장면: **${esc(String(p.name))}**`);
        break;
      case 'roll.finalized':
        if (p.outcome === 'style') {
          const id = before.rolls[String(p.rollId)]?.active.characterId ?? roller(events, p.rollId);
          out.push(`✨ **${nameOf(id)}** 대성공!`);
        }
        break;
      case 'character.taken_out':
        out.push(`⚔️ **${nameOf(String(p.characterId))}** 퇴장`);
        break;
    }
  }
  return out;
}

/** 같은 명령에서 굴림이 시작됐으면 그 이벤트에서 굴린 캐릭터를 찾는다 */
function roller(events: readonly StoredEvent[], rollId: unknown): string | undefined {
  for (const e of events) {
    const p = e.payload as Record<string, any>;
    if (p.rollId !== rollId) continue;
    if (e.type === 'roll.resolved') return p.side?.characterId;
    if (e.type === 'roll.opposition_requested') return p.attackerId;
  }
  return undefined;
}

function created(events: readonly StoredEvent[], id: string): string | undefined {
  for (const e of events) {
    const c = (e.payload as { character?: { id: string; name: string } }).character;
    if (e.type === 'character.created' && c?.id === id) return c.name;
  }
  return undefined;
}

/** 줄들을 한 메시지로 보낸다. 5초 안에 답이 없으면 그만둔다 */
export async function postDiscord(url: string, lines: readonly string[]): Promise<void> {
  if (!lines.length || !isDiscordWebhook(url)) return;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: lines.join('\n').slice(0, 1900),
      allowed_mentions: { parse: [] },
    }),
    signal: AbortSignal.timeout(5000),
  }).catch(() => {});
}
