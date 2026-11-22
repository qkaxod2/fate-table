// deno test: CORS 화이트리스트
import { allowedOrigins, corsFor } from './http.ts';

function assertEquals(actual: unknown, expected: unknown, msg = '') {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg}\n  actual:   ${a}\n  expected: ${e}`);
}

Deno.test('no list means any site (local development)', () => {
  assertEquals(allowedOrigins(''), null);
  assertEquals(corsFor('https://x.example', null)['Access-Control-Allow-Origin'], '*');
});

Deno.test('a listed site gets its own origin back, others get none', () => {
  const list = allowedOrigins(' https://me.github.io/ , http://localhost:3000 ');
  assertEquals(list, ['https://me.github.io', 'http://localhost:3000']);
  assertEquals(corsFor('https://me.github.io', list)['Access-Control-Allow-Origin'], 'https://me.github.io');
  assertEquals(corsFor('https://evil.example', list)['Access-Control-Allow-Origin'], undefined);
  assertEquals(corsFor(null, list)['Access-Control-Allow-Origin'], undefined);
  assertEquals(corsFor('https://me.github.io', list).Vary, 'Origin');
});
