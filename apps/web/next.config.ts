import type { NextConfig } from 'next';

const config: NextConfig = {
  transpilePackages: ['@fate/rules-engine', '@fate/glossary'],
};

export default config;
