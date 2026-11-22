// Edge Function(Deno)이 쓸 공용 코드를 supabase/functions/_shared/ 로 묶는다.
// 결과물은 git에 넣지 않는다. CI와 배포 워크플로가 만들고, 로컬에서 함수를 돌릴 때는 `pnpm bundle:shared`를 먼저 실행한다.
import { build } from 'esbuild';

const targets = [
  { entry: 'packages/portrait/src/index.ts', out: 'supabase/functions/_shared/portrait.js' },
  { entry: 'packages/rules-engine/src/index.ts', out: 'supabase/functions/_shared/engine.js' },
];

// Zod는 모든 언어의 오류 문구를 함께 내보낸다. 서버는 기본(영어)만 쓰므로 나머지는 빈 모듈로 바꾼다
const onlyEnglishLocale = {
  name: 'zod-english-only',
  setup(b) {
    b.onResolve({ filter: /\/locales\/index\.js$/ }, (args) =>
      args.importer.includes('/zod/') ? { path: 'zod-locales', namespace: 'stub' } : undefined,
    );
    b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export {};', loader: 'js' }));
  },
};

for (const t of targets) {
  await build({
    entryPoints: [t.entry],
    outfile: t.out,
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    target: 'es2022',
    banner: { js: '// 자동 생성 파일: scripts/bundle-shared.mjs. 직접 고치지 않는다.' },
    minify: true,
    legalComments: 'none',
    plugins: [onlyEnglishLocale],
    logLevel: 'warning',
  });
}
