import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

// Silence "multiple lockfiles" warning — we have a nested lockfile for
// pilot-web and one for the parent CLI. Tell Turbopack the web/ tree
// is its own root so it doesn't get confused.
const here = dirname(fileURLToPath(import.meta.url));

const config: NextConfig = {
  // Don't fail builds on typecheck — it runs separately via `npm run typecheck`.
  typescript: { ignoreBuildErrors: true },

  turbopack: {
    root: here,
  },

  // Browser → Next.js proxy is implemented as a route handler at
  // /app/api/pilot/[...path]/route.ts (v0.4.7+). It reads the
  // pilot token from the file system server-side and forwards the
  // request to the pilot server with the right headers + CSRF.

  // Standalone output: produces a self-contained `web/.next/standalone/`
  // directory with only what's needed to run in production.
  //
  // Usage:
  //   $ cd web && npm run build       # produces .next/standalone/
  //   $ cp -r .next/static .next/standalone/web/.next/static
  //   $ cp -r public .next/standalone/web/public   # if you have static assets
  //   $ PORT=17371 PILOT_SERVER_URL=http://127.0.0.1:17361 \
  //     node .next/standalone/web/server.js
  //
  // The standalone build is ~10x smaller than the full project tree and
  // is what gets shipped in Docker images.
  //
  // Enable with: `NEXT_OUTPUT_STANDALONE=1 npm run build` (env-based so
  // dev builds don't pay the cost).
  ...(process.env.NEXT_OUTPUT_STANDALONE === "1"
    ? { output: "standalone" as const }
    : {}),
};

export default config;
