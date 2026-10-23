import type { NextConfig } from 'next';

// GitHub Pages는 저장소 이름이 경로 앞에 붙는다 (https://qkaxod2.github.io/fate-table/)
const basePath = process.env.PAGES_BASE_PATH ?? '';

const config: NextConfig = {
  output: 'export',
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  transpilePackages: ['@fate/rules-engine', '@fate/glossary', '@fate/portrait'],
};

export default config;
