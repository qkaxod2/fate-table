// deno test: 디스코드 알림 문구
import type { StoredEvent } from '../_shared/http.ts';
import { discordLines, isDiscordWebhook } from './discord.ts';

function assertEquals(actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`\n  actual:   ${a}\n  expected: ${e}`);
}

const ev = (seq: number, type: string, payload: unknown, visibility = 'public'): StoredEvent =>
  ({ seq, type, actor_id: null, payload, visibility }) as unknown as StoredEvent;

const before = {
  characters: { c1: { name: '하윤' }, c2: { name: '*경비*' } },
  rolls: { r1: { active: { characterId: 'c1' } } },
};

Deno.test('discord lines: session, scene, style success, taken out', () => {
  const lines = discordLines(
    [
      ev(1, 'session.started', { sessionId: 's', number: 3, title: '비 오는 밤' }),
      ev(2, 'scene.started', { sceneId: 'x', name: '부두', pcIds: [], zones: [] }),
      ev(3, 'roll.finalized', { rollId: 'r1', outcome: 'style', total: 5, shifts: 3, rewards: [] }),
      ev(4, 'roll.finalized', {
        rollId: 'r1',
        outcome: 'success',
        total: 2,
        shifts: 1,
        rewards: [],
      }),
      ev(5, 'character.taken_out', { characterId: 'c2', conflictId: null }),
      ev(6, 'gm.note', { text: '비밀' }, 'gm'),
      ev(7, 'session.ended', { sessionId: 's' }),
    ],
    before,
  );
  assertEquals(lines, [
    '📖 **세션 3** 시작 · 비 오는 밤',
    '🎬 장면: **부두**',
    '✨ **하윤** 대성공!',
    '⚔️ **\\*경비\\*** 퇴장',
    '🏁 세션 끝',
  ]);
});

Deno.test('discord lines: a roll started in the same command finds its roller', () => {
  const lines = discordLines(
    [
      ev(1, 'roll.resolved', { rollId: 'r9', side: { characterId: 'c2' } }),
      ev(2, 'roll.finalized', { rollId: 'r9', outcome: 'style' }),
    ],
    before,
  );
  assertEquals(lines, ['✨ **\\*경비\\*** 대성공!']);
});

Deno.test('only discord webhook urls are accepted', () => {
  assertEquals(isDiscordWebhook('https://discord.com/api/webhooks/123/abc-DEF_1'), true);
  assertEquals(isDiscordWebhook('https://discordapp.com/api/webhooks/1/x'), true);
  assertEquals(isDiscordWebhook('https://evil.com/api/webhooks/1/x'), false);
  assertEquals(isDiscordWebhook('http://discord.com/api/webhooks/1/x'), false);
  assertEquals(isDiscordWebhook('https://discord.com.evil.com/api/webhooks/1/x'), false);
});
