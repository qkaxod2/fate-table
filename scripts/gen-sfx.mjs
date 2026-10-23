// 기본 효과음 10종을 ElevenLabs로 한 번 만들어 apps/web/public/sfx/ 에 저장한다.
// 실행: ELEVENLABS_API_KEY=... node scripts/gen-sfx.mjs [이름...]   (이미 있는 파일은 건너뛴다, --force로 덮어쓰기)
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

export const SFX = {
  'dice-roll': ['four wooden dice rattling and tumbling across a wooden tabletop', 1.4],
  'dice-settle': ['a single wooden die clicking to a stop on a wooden table', 0.6],
  'token-flip': ['a heavy gold coin flipped with a bright metallic ring', 0.8],
  'token-fly': ['a soft magical whoosh ending in a gentle coin chime', 0.9],
  success: ['a short warm harp flourish, positive and gentle', 1.2],
  'style-chime': ['a triumphant sparkling bell chime with shimmering magic, short fanfare', 1.8],
  'fail-thud': ['a low muffled thud on wood with a short descending tone', 0.9],
  'compel-card': ['a playing card slid across a table and flipped over, paper swish', 0.8],
  'consequence-slot': ['a heavy iron latch clanking shut with a dull impact', 0.8],
  'scene-transition': ['a soft page turn followed by a low cinematic whoosh', 1.6],
};

const out = 'apps/web/public/sfx';
mkdirSync(out, { recursive: true });
const args = process.argv.slice(2);
const force = args.includes('--force');
const only = args.filter((a) => !a.startsWith('--'));
const key = process.env.ELEVENLABS_API_KEY;

for (const [name, [text, duration]] of Object.entries(SFX)) {
  if (only.length && !only.includes(name)) continue;
  const file = `${out}/${name}.mp3`;
  if (existsSync(file) && !force) continue;
  const res = await fetch('https://api.elevenlabs.io/v1/sound-generation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(key ? { 'xi-api-key': key } : {}) },
    body: JSON.stringify({ text, duration_seconds: duration, prompt_influence: 0.6 }),
  });
  if (!res.ok) throw new Error(`${name}: ${res.status} ${await res.text()}`);
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  console.log('saved', file);
}
