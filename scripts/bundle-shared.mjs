// Edge Function(Deno)이 쓸 공용 코드를 supabase/functions/_shared/ 로 묶는다.
// CI가 다시 묶어서 차이가 없는지 확인하므로, 패키지를 고치면 `pnpm bundle:shared` 후 커밋한다.
import { build } from 'esbuild';

const targets = [
  { entry: 'packages/portrait/src/index.ts', out: 'supabase/functions/_shared/portrait.js' },
  { entry: 'packages/rules-engine/src/index.ts', out: 'supabase/functions/_shared/engine.js' },
];

for (const t of targets) {
  await build({
    entryPoints: [t.entry],
    outfile: t.out,
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    target: 'es2022',
    banner: { js: '// 자동 생성 파일: scripts/bundle-shared.mjs. 직접 고치지 않는다.' },
    logLevel: 'warning',
  });
}
