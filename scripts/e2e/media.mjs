// 배포된 그림 함수 점검: 프롬프트 도우미(Gemini) → NAI 배경 · 스탠딩 · 표정 차분.
// 실행: SUPABASE_URL=... SUPABASE_ANON_KEY=... node scripts/e2e/media.mjs
// 결과 그림은 out/media/ 에 저장하고, 로그에는 작은 미리보기(base64 JPEG)를 남긴다.
import { mkdirSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const { error: authError } = await sb.auth.signInAnonymously();
if (authError) throw new Error(`auth: ${authError.message}`);

const out = 'out/media';
mkdirSync(out, { recursive: true });
let failed = false;

async function call(fn, body) {
  const t = Date.now();
  const { data, error } = await sb.functions.invoke(fn, { body });
  const ms = Date.now() - t;
  if (error) {
    const detail = await error.context?.json?.().catch(() => null);
    console.log(`✗ ${fn} ${body.kind} ${ms}ms`, JSON.stringify(detail ?? error.message));
    failed = true;
    return null;
  }
  console.log(`✓ ${fn} ${body.kind} ${ms}ms`);
  return data.data;
}

async function keep(name, url) {
  const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
  writeFileSync(`${out}/${name}.png`, buf);
  const meta = await sharp(buf).metadata();
  const thumb = await sharp(buf)
    .flatten({ background: '#2a3550' })
    .resize({ height: 320 })
    .jpeg({ quality: 70 })
    .toBuffer();
  console.log(`  ${name}: ${meta.width}x${meta.height} alpha=${meta.hasAlpha} ${url}`);
  console.log(`::group::thumb ${name}\nTHUMB ${name} ${thumb.toString('base64')}\n::endgroup::`);
}

const scene = await call('media-prompt', {
  kind: 'scene',
  description: '도적들이 불을 지르고 숨어 있는 시골 곡물 창고. 밤, 연기가 자욱해요.',
  context: { name: '불타는 곡물 창고', aspects: ['연기로 가득한 다락', '겁먹은 일꾼들'] },
});
if (scene) {
  console.log(
    '  scene prompt:',
    scene.prompt,
    '\n  negative:',
    scene.negative,
    '\n  summary:',
    scene.summary,
    '\n  model:',
    scene.model,
  );
  const img = await call('media-image', {
    kind: 'scene',
    presetId: 'watercolor',
    appearance: scene.prompt,
    negative: scene.negative,
    guidance: 5,
  });
  if (img) await keep('scene', img.url);
}

const standing = await call('media-prompt', {
  kind: 'standing',
  description:
    '은발 단발에 둥근 안경, 주머니 많은 코트를 입고 빛나는 플라스크를 든 견습 연금술사 소녀',
  context: { name: '리안', aspects: ['길 잃은 별을 쫓는 견습 연금술사', '폭발은 예술이다'] },
});
if (standing) {
  console.log(
    '  standing prompt:',
    standing.prompt,
    '\n  negative:',
    standing.negative,
    '\n  summary:',
    standing.summary,
  );
  const img = await call('media-image', {
    kind: 'standing',
    presetId: 'cel',
    appearance: standing.prompt,
    negative: standing.negative,
    guidance: 6,
  });
  if (img) {
    await keep('standing', img.url);
    const face = await call('media-image', {
      kind: 'expression',
      presetId: 'cel',
      appearance: standing.prompt,
      guidance: 6,
      seed: img.seed,
      expression: 'surprised',
      baseUrl: img.url,
    });
    if (face) await keep('expression-surprised', face.url);
  }
}

if (failed) process.exit(1);
