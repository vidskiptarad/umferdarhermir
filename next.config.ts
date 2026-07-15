import type { NextConfig } from 'next';

// Served at https://vi.is/umferdarhermir; everything lives under that path.
const BASE_PATH = '/umferdarhermir';

const nextConfig: NextConfig = {
  basePath: BASE_PATH,
  env: {
    NEXT_PUBLIC_BASE_PATH: BASE_PATH,
  },
};

export default nextConfig;
