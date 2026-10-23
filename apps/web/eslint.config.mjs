import next from 'eslint-config-next';

const config = [
  ...next,
  { ignores: ['.next/**', 'out/**', 'next-env.d.ts'] },
  // 정적 내보내기(GitHub Pages)라 next/image 최적화를 쓸 수 없다
  { rules: { '@next/next/no-img-element': 'off' } },
];

export default config;
