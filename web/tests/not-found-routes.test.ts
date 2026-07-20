/**
 * not-found-routes.test.ts — v0.9.15 regression test for the 8
 * dynamic routes that used to return HTTP 200 with an inline
 * "not found" surface instead of HTTP 404.
 *
 * Before v0.9.15:
 *   - /packages/nonexistent-pkg → 200 (empty state)
 *   - /sessions/nonexistent-sess → 200 (ErrorSurface)
 *   - /capabilities/nonexistent-cap → 200 ("not found" surface)
 *   - /profiles/nonexistent-prof → 200 ("not found" surface)
 *   - /policy/nonexistent-pol/edit → 200 (inline "not found" card)
 *   - /forge/nonexistent-forge → 200 (inline "not found" surface)
 *   - /avatars/nonexistent-cwd → 200 (inline "not found" surface)
 *   - /wrappers/nonexistent-wrap/edit → 200 (inline "not found" card)
 *   - /workflows/nonexistent → 500 (the `layout.ts` SSR crash
 *     that started this whole audit)
 *
 * After v0.9.15:
 *   - Each page calls Next.js notFound() when the resource is
 *     missing, which the framework converts to HTTP 404 +
 *     the app's not-found.tsx render.
 *
 * The test strategy: import each page, mock the api + next/navigation
 * to capture the notFound() call, and assert the right behavior.
 * This locks the routing decision in a unit test so a future
 * refactor that "renders an inline 'not found' surface again"
 * would fail CI rather than silently re-introduce the SEO +
 * refresh-state regression.
 *
 * Note: Next.js 16.2.x has an upstream bug (issue #93008) where
 * notFound() in a page that has a sibling loading.tsx renders
 * the not-found body but returns HTTP 200. That bug is a
 * Next.js responsibility, not a pilot one — the v0.9.15 fix
 * makes the BODY correct (this test confirms that), and the
 * status code would need a Next.js upstream fix to be 404.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockNotFound = vi.fn(() => {
  // notFound() in Next.js throws a special error to short-circuit
  // rendering. We don't want our test runner to actually throw —
  // we just want to know the page called it.
  const err = new Error("NEXT_NOT_FOUND");
  err.name = "NEXT_NOT_FOUND";
  throw err;
});

vi.mock("next/navigation", () => ({
  notFound: () => mockNotFound(),
  redirect: vi.fn(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

// api varies per page; we mock the parent module and let each
// test set the return value it needs.
const mockApi: Record<string, ReturnType<typeof vi.fn>> = {};
vi.mock("@/lib/pilot", () => ({
  api: new Proxy(
    {},
    {
      get: (_target, prop: string) => mockApi[prop] ?? vi.fn(),
    },
  ),
  PilotApiError: class PilotApiError extends Error {
    constructor(
      message: string,
      readonly status: number,
    ) {
      super(message);
      this.name = "PilotApiError";
    }
  },
}));

beforeEach(() => {
  mockNotFound.mockClear();
  for (const k of Object.keys(mockApi)) {
    mockApi[k]!.mockReset();
  }
});

// Minimal shape we need from each page module — the actual
// Next.js page components have richer props (searchParams,
// per-route PageProps types) but we only pass `{ params }`.
type AnyPageModule = { default: (props: { params: Promise<{ [k: string]: string }> }) => Promise<unknown> };
const asPage = (m: Promise<unknown>): Promise<AnyPageModule> => m as Promise<AnyPageModule>;

interface RouteCase {
  name: string;
  pageImport: () => Promise<AnyPageModule>;
  paramName: string;
  paramValue: string;
  /** Name of the api method that should return null / 404 for the missing id. */
  apiMethod: string;
  /** How the api method signals 404 for this page. */
  apiSignal: "null" | "throw-404";
}

const routeCases: RouteCase[] = [
  {
    name: "/capabilities/[id] — getCapability returns null",
    pageImport: () => asPage(import("@/app/capabilities/[id]/page")),
    paramName: "id",
    paramValue: "ghost-cap",
    apiMethod: "getCapability",
    apiSignal: "null",
  },
  {
    name: "/forge/[name] — forgeInspect returns null",
    pageImport: () => asPage(import("@/app/forge/[name]/page")),
    paramName: "name",
    paramValue: "ghost-forge",
    apiMethod: "forgeInspect",
    apiSignal: "null",
  },
  {
    name: "/avatars/[cwd] — avatarDiff returns null",
    pageImport: () => asPage(import("@/app/avatars/[cwd]/page")),
    paramName: "cwd",
    paramValue: "/tmp/ghost-cwd",
    apiMethod: "avatarDiff",
    apiSignal: "null",
  },
  {
    name: "/packages/[name] — packInfo throws 404",
    pageImport: () => asPage(import("@/app/packages/[name]/page")),
    paramName: "name",
    paramValue: "ghost-pkg",
    apiMethod: "packInfo",
    apiSignal: "throw-404",
  },
  {
    name: "/profiles/[name] — profile throws 404 (not found message)",
    pageImport: () => asPage(import("@/app/profiles/[name]/page")),
    paramName: "name",
    paramValue: "ghost-prof",
    apiMethod: "profile",
    apiSignal: "throw-404",
  },
  {
    name: "/policy/[name]/edit — policy throws PilotApiError(404)",
    pageImport: () => asPage(import("@/app/policy/[name]/edit/page")),
    paramName: "name",
    paramValue: "ghost-pol",
    apiMethod: "policy",
    apiSignal: "throw-404",
  },
  {
    name: "/wrappers/[name]/edit — getWrapper throws PilotApiError(404)",
    pageImport: () => asPage(import("@/app/wrappers/[name]/edit/page")),
    paramName: "name",
    paramValue: "ghost-wrap",
    apiMethod: "getWrapper",
    apiSignal: "throw-404",
  },
  {
    name: "/sessions/[id] — sessionTree throws PilotApiError(404)",
    pageImport: () => asPage(import("@/app/sessions/[id]/page")),
    paramName: "id",
    paramValue: "ghost-sess",
    apiMethod: "sessionTree",
    apiSignal: "throw-404",
  },
  {
    name: "/workflows/[id] — workflow returns null (server-side existence check)",
    pageImport: () => asPage(import("@/app/workflows/[id]/page")),
    paramName: "id",
    paramValue: "ghost-wf",
    apiMethod: "workflow",
    apiSignal: "null",
  },
];

describe("v0.9.15 dynamic route 404 regression", () => {
  for (const c of routeCases) {
    it(`${c.name} → calls notFound() (would return HTTP 404)`, async () => {
      // Set up the api mock for this route.
      if (c.apiSignal === "null") {
        mockApi[c.apiMethod] = vi.fn().mockResolvedValue(null);
      } else {
        // throw-404: throw a PilotApiError(404) so the page's
        // catch (e instanceof PilotApiError && e.status === 404)
        // branch fires. We need the class to be importable.
        const { PilotApiError } = await import("@/lib/pilot");
        mockApi[c.apiMethod] = vi
          .fn()
          .mockRejectedValue(new PilotApiError("not found", 404));
      }

      // For pages that need siblings (e.g. /sessions/[id] also
      // calls api.sessions(), api.sessionSnapshot(), api.sessionInfo()),
      // make those also return benign empty values so the page
      // reaches the notFound() call cleanly.
      const siblingSetters: Record<string, unknown> = {
        sessionTree: { tree: null, session: null, snapshot: null, info: null, error: "404" },
        sessions: [],
        sessionSnapshot: null,
        sessionInfo: null,
      };
      for (const [k, v] of Object.entries(siblingSetters)) {
        if (k === c.apiMethod) continue;
        mockApi[k] = vi.fn().mockResolvedValue(v);
      }

      const mod = await c.pageImport();
      const Page = mod.default;
      const params = Promise.resolve({ [c.paramName]: c.paramValue });

      // The page calls notFound() which throws NEXT_NOT_FOUND.
      // We assert the call was made; we don't care about the
      // throw (the test framework catches it).
      let threwNotFound = false;
      try {
        await Page({ params });
      } catch (e) {
        if ((e as Error).name === "NEXT_NOT_FOUND") {
          threwNotFound = true;
        } else {
          // Re-throw unrelated errors so the test fails clearly.
          throw e;
        }
      }

      expect(threwNotFound).toBe(true);
      expect(mockNotFound).toHaveBeenCalledTimes(1);
    });
  }
});
