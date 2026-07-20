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

  // v0.9.15.1: Next.js 16's `allowedDevOrigins` gate. The pilot
  // dashboard runs the browser at 127.0.0.1:17371 and the dev
  // server on the same host, but Next.js 16's default security
  // policy treats `127.0.0.1` as a separate origin from `localhost`
  // and blocks the HMR / RSC fetch with:
  //
  //   "Blocked cross-origin request to Next.js dev resource
  //    /_next/webpack-hmr from 127.0.0.1"
  //
  // The visible symptom is: the page renders fine but client-side
  // event handlers don't bind (no JS errors in the console — HMR
  // is just silently blocked). Clicking buttons does nothing
  // because the React tree never finished hydrating.
  //
  // Workaround: explicitly allow the loopback host. Production
  // builds are unaffected (this gate only fires in dev mode).
  allowedDevOrigins: ["127.0.0.1", "localhost", "0.0.0.0"],

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
