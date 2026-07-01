import type { NextConfig } from 'next';

const PILOT_SERVER = process.env.PILOT_SERVER_URL ?? 'http://127.0.0.1:17361';

const config: NextConfig = {
  // Don't fail builds on lint/typecheck — those run separately.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },

  // Same-origin proxy: the browser hits /api/* on this Next.js server,
  // and Next forwards to the pilot server with the token injected
  // server-side. The pilot token never reaches the browser.
  async rewrites() {
    return [
      {
        source: '/api/pilot/:path*',
        destination: `${PILOT_SERVER}/:path*`,
      },
    ];
  },
};

export default config;