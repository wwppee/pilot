# v0.4.10 — Search crash hotfix + npm publish pipeline

**v0.4.10 is a small-but-critical release.** The biggest change is
fixing a regression that white-screened `/packages` whenever you
searched. The second change is hardening the `release.sh` npm
publish pipeline so it can no longer ship a bad tarball or
duplicate version.

## What's in v0.4.10

### Fix: `/packages` search crash

The `/packages` page's search box white-screened the entire page
because `api.packSearch`'s type and the server's actual response
were out of sync.

**Before** (server returns bare array, client expected wrapper):
```ts
// server (correct, has always returned bare array):
app.get("/packs/search", async (req) => {
  return service.searchPacks(q);   // Pack[]
});

// client type (wrong):
packSearch: (q) => pilot<{
  query: string;
  results: Pack[];
}>(...)

// calling code (crashed):
searchList.results.map(...)   // results is undefined
```

**After** (types match server):
```ts
// client type (correct):
packSearch: (q) => pilot<Pack[]>(...)

// calling code (works):
searchList.map(...)
```

**Files changed**:
- `web/src/lib/pilot.ts` — `packSearch` type → `Pack[]`
- `web/src/app/packages/page.tsx` — `searchList.results.length/map` → `searchList.length/map`
- `web/tests/pilot.test.ts` — regression test pinning the response shape

The regression test fetches `/packs/search?q=subagent` against a
mock that returns `[Pack]`, then asserts:
- `Array.isArray(results)` is `true`
- `(results as { results? }).results` is `undefined` (pin the shape)
- `results[0].name` matches

This means if anyone ever tries to add a `.results` wrapper back
to the server response, they'll have to update the type **and**
the test together. The mismatch that caused this bug can't
silently come back.

### Improve: `release.sh` npm publish pipeline

The `NPM_TOKEN is set → npm publish` step used to be a bare
`npm publish --access public` with no validation. It could:

- Publish a **bad tarball** (e.g. `dist/` was empty because the
  build silently failed earlier)
- **Re-publish an already-published version** and fail with 409
- Leave **no audit trail** of what was actually sent

v0.4.10 adds three pre-flight checks:

```bash
# 1. dist/ must exist with the entry point built
[[ -d dist ]] && [[ -f dist/cli.js ]] || error

# 2. The version must not already be on npm
ALREADY=$(npm view "pilot@$PKG_VERSION" version 2>/dev/null)
[[ -n "$ALREADY" ]] && skip-with-warn

# 3. Dry-run preview before actual publish
npm publish --access public --provenance --dry-run
npm publish --access public --provenance
```

Plus `--provenance` is now always set. In CI this makes npm link
the tarball to the GitHub Actions build that produced it; locally
it's harmless.

The dry-run mode (`./scripts/release.sh --dry-run patch`) now
shows what would have run for the publish step instead of
silently skipping, so you can validate the pipeline before
committing to a real release.

## Files changed

```
scripts/release.sh
web/src/app/packages/page.tsx
web/src/lib/pilot.ts
web/tests/pilot.test.ts
```

## Verification

- ✅ `web tsc --noEmit` — 0 errors
- ✅ `web build` — clean
- ✅ `web vitest` — 50/50 pass (+1 regression test for packSearch)
- ✅ `core vitest` — 270/270 pass
- ✅ `npm pack --dry-run` — 171 files, 128.2 kB tarball
- ✅ `release.sh --dry-run patch` — full pipeline prints clean

## Why this matters

The `/packages` crash was particularly nasty because:

1. **The page itself still loaded** — only the search box was
   broken, so it looked "almost fine" on first visit
2. **The error didn't appear in CI** — no test was asserting the
   response shape, so the type mismatch slipped past typecheck
   (`Promise<Pack[]>` and `Promise<{results: Pack[]}>` both
   accept a bare array as a return value, since TS structural
   typing is permissive with missing properties)
3. **TypeScript strict mode didn't catch it** — `exactOptionalPropertyTypes`
   and `noUncheckedIndexedAccess` don't help here because the
   access pattern is `searchList.results.length` — `results`
   is `undefined` on a bare array, and accessing `.length` on
   `undefined` throws at runtime

The fix is small (type + 2 reference changes + 1 test). The
hardening is what prevents this category of bug from
silently re-appearing.

## Upgrade notes

No breaking changes. Just `npm install -g pilot@latest` (or
`pilot dashboard --prod` after pulling this version) and the
search box will work again.