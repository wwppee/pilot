# Release process (as of v0.4.1)

## Two paths

### A. Automatic (preferred) — release-please

On every push to `main`, the [Release workflow](.github/workflows/release.yml) runs
`googleapis/release-please-action@v4`. It auto-detects conventional commits since
the last release tag and:

1. Opens/updates a `chore(main): release X.Y.Z` PR with version bump + changelog
2. (After PR merge) creates the GitHub release + npm publish (if `NPM_TOKEN` is set)

**Configuration**:
- `release-please-config.json` — declares the `pilot` component explicitly
- Workflow: `permissions: contents: write, pull-requests: write`, runner `ubuntu-22.04`

### B. Manual fallback — `scripts/make-release.sh`

As of v0.4.1 we've been hitting 0-job failures on the Release workflow on this
repo (every push since v0.4.0 — appears to be a GitHub Actions dispatch issue
we can't fix from the repo side). Until that's resolved, cut releases manually:

```bash
# 1. Bump version in package.json + commit on a release branch
# 2. Merge to main
# 3. Run the script (requires GH_TOKEN env var)
GH_TOKEN=ghp_xxx ./scripts/make-release.sh v0.4.2 "v0.4.2 — Forge eval" RELEASE-v0.4.2.md
```

The script will:
- Validate `package.json` version matches the tag
- `git tag -a v0.4.2 && git push origin v0.4.2`
- POST the notes file as a GitHub release

## Why not just always manual?

release-please gives us:
- Auto-changelog from conventional commits
- Auto-bump type (feat→minor, fix→patch)
- Auto-release branch + PR

When it works, it's nicer than hand-rolling. When it doesn't (current state),
the script gets us out of jail.

## Alerting

The [ci-alert workflow](.github/workflows/ci-alert.yml) listens for `Release`
workflow completions and warns when total_count=0 jobs (the failure mode we've
been seeing). If you see that warning, use path B.

## TODO

- [ ] Investigate why release-please-action@v4 is 0-job-failing on this repo
      (the same workflow worked at v0.4.0; the v0.4.0 release PR merge may have
      left the release branch in a state the action can't recover from)
- [ ] Once fixed, deprecate `scripts/make-release.sh` or keep as belt-and-suspenders
- [ ] Add `NPM_TOKEN` to repo secrets so `npm publish` runs from CI (currently
      the package name `pilot` conflicts with an existing npm package; if we
      rename to `@wwppee/pilot` this becomes viable)
