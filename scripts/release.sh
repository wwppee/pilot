#!/usr/bin/env bash
# release.sh — one-shot release workflow.
#
# The first-class "make a release" script. Bundles the manual fallback
# (release-please has been broken since v0.4.0) into a single
# deterministic command so I don't forget steps.
#
# Usage:
#   ./scripts/release.sh <version>   # e.g. 0.4.6
#   ./scripts/release.sh patch       # bump patch
#   ./scripts/release.sh minor       # bump minor
#   ./scripts/release.sh major       # bump major
#   ./scripts/release.sh --dry-run 0.4.6   # show what would happen
#
# Does, in order:
#   1. Pre-flight: clean tree, on main, GH_TOKEN set
#   2. Sanity test (offline, 2s): npm run test:offline
#   3. TypeScript: tsc --noEmit
#   4. Format: prettier --write (so commits are clean)
#   5. Bump version in core + web package.json
#   6. Build: tsc + web next build
#   7. Commit version bump
#   8. Push main
#   9. Create annotated tag
#   10. Push tag
#   11. Create GitHub release from RELEASE-<version>.md
#   12. (Optional) npm publish — only if NPM_TOKEN is set
#
# Dry-run prints every step but does nothing destructive.

set -euo pipefail

# ─── Args ────────────────────────────────────────────────────
DRY_RUN=false
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
  shift
fi

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 [--dry-run] <version|patch|minor|major>" >&2
  echo "  e.g. $0 0.4.6" >&2
  echo "  e.g. $0 patch" >&2
  exit 1
fi

VERSION_ARG="$1"

# Resolve version
case "$VERSION_ARG" in
  patch|minor|major)
    CURRENT=$(node -p "require('./package.json').version")
    IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT"
    case "$VERSION_ARG" in
      patch) NEW_VERSION="$MAJOR.$MINOR.$((PATCH + 1))" ;;
      minor) NEW_VERSION="$MAJOR.$((MINOR + 1)).0" ;;
      major) NEW_VERSION="$((MAJOR + 1)).0.0" ;;
    esac
    ;;
  *)
    NEW_VERSION="$VERSION_ARG"
    ;;
esac

# Strip leading v if present
NEW_VERSION="${NEW_VERSION#v}"
TAG="v$NEW_VERSION"
NOTES_FILE="RELEASE-$TAG.md"

# ─── Helpers ────────────────────────────────────────────────
step() {
  printf "\033[1;36m▶ %s\033[0m\n" "$1"
}

ok() {
  printf "\033[1;32m  ✓ %s\033[0m\n" "$1"
}

warn() {
  printf "\033[1;33m  ! %s\033[0m\n" "$1"
}

err() {
  printf "\033[1;31m  ✗ %s\033[0m\n" "$1"
}

run() {
  if $DRY_RUN; then
    printf "\033[2m  dry-run: %s\033[0m\n" "$*"
  else
    "$@"
  fi
}

# ─── Pre-flight ──────────────────────────────────────────────
step "Pre-flight checks"

if [[ -z "${GH_TOKEN:-}" && -z "${GITHUB_TOKEN:-}" ]]; then
  err "GH_TOKEN (or GITHUB_TOKEN) env var is required"
  exit 1
fi

if ! git diff --quiet 2>/dev/null; then
  err "Working tree has uncommitted changes. Commit or stash first."
  exit 1
fi

BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [[ "$BRANCH" != "main" ]]; then
  err "Must be on main (currently on $BRANCH)"
  exit 1
fi

ok "tree clean, on main, GH_TOKEN set"

if [[ ! -f "$NOTES_FILE" ]]; then
  warn "Notes file $NOTES_FILE doesn't exist — you'll need to write it before pushing the release"
  warn "  (tag + push will still happen; GitHub release creation will be skipped)"
  SKIP_GH_RELEASE=true
else
  SKIP_GH_RELEASE=false
fi

echo
echo "  → New version: $NEW_VERSION (tag: $TAG)"
echo "  → Notes file:  $NOTES_FILE"
echo "  → Dry run:     $DRY_RUN"
echo

# ─── Tests ──────────────────────────────────────────────────
step "Running tests (offline, ~2s)"
run npm run test:offline --silent

# ─── TypeScript ─────────────────────────────────────────────
step "TypeScript check"
run npx tsc --noEmit

# ─── Format ─────────────────────────────────────────────────
step "Formatting"
run npm run format
(cd web && run npx prettier --write .)

# ─── Bump version ───────────────────────────────────────────
step "Bumping version in package.json + web/package.json"
run npm version "$NEW_VERSION" --no-git-tag-version
(cd web && run npm version "$NEW_VERSION" --no-git-tag-version)

# ─── Build ──────────────────────────────────────────────────
step "Build core"
run npm run build

step "Build web"
(cd web && run npm run build)

# ─── Commit bump ────────────────────────────────────────────
step "Commit version bump"
run git add -A
run git -c user.name="Pilot Bot" -c user.email="pilot-bot@local" commit \
  -m "chore(release): v$NEW_VERSION"

# ─── Push main ──────────────────────────────────────────────
step "Push main"
run git push

# ─── Tag + push tag ────────────────────────────────────────
step "Tag $TAG and push"
run git tag -a "$TAG" -m "$TAG — release"
run git push origin "$TAG"

# ─── GitHub release ─────────────────────────────────────────
if $SKIP_GH_RELEASE; then
  warn "Skipping GitHub release (no $NOTES_FILE)"
else
  step "Create GitHub release"
  REPO=$(node -p "const url=require('./package.json').repository?.url||''; url.replace(/^git\+/,'').replace(/\.git\$/,'')")
  NAME=$(node -p "require('./package.json').version")
  if $DRY_RUN; then
    echo "  dry-run: gh release create $TAG --repo $REPO --title \"$NAME — release\" --notes-file $NOTES_FILE"
  else
    if command -v gh >/dev/null 2>&1; then
      gh release create "$TAG" \
        --repo "$REPO" \
        --title "$NAME — release" \
        --notes-file "$NOTES_FILE"
    else
      warn "gh CLI not found; falling back to curl + GH_TOKEN"
      PAYLOAD=$(mktemp)
      node -e "
        const fs = require('fs');
        const p = {
          tag_name: '$TAG',
          name: '$NAME — release',
          body: fs.readFileSync('$NOTES_FILE', 'utf8'),
          draft: false,
          prerelease: false,
        };
        fs.writeFileSync('$PAYLOAD', JSON.stringify(p));
      "
      HTTP_CODE=$(curl -s -o /tmp/release-resp.json -w '%{http_code}' \
        -X POST \
        -H "Authorization: token $GH_TOKEN" \
        -H "Content-Type: application/json" \
        -d "@$PAYLOAD" \
        "https://api.github.com/repos/$REPO/releases")
      if [[ "$HTTP_CODE" =~ ^2 ]]; then
        URL=$(node -e 'console.log(JSON.parse(require("fs").readFileSync("/tmp/release-resp.json","utf8")).html_url||"")')
        printf "  ✓ %s\n" "$URL"
      else
        err "GitHub release failed (HTTP $HTTP_CODE):"
        cat /tmp/release-resp.json | head -10
      fi
      rm -f "$PAYLOAD" /tmp/release-resp.json
    fi
  fi
fi

# ─── npm publish (optional) ─────────────────────────────────
if [[ -n "${NPM_TOKEN:-}" ]]; then
  step "npm publish (NPM_TOKEN set)"
  run npm publish --access public
else
  echo
  warn "NPM_TOKEN not set — skipping npm publish"
  warn "  to publish later: cd /path/to/pilot && npm publish"
fi

echo
ok "Release $TAG complete."
echo "  GitHub:  https://github.com/wwppee/pilot/releases/tag/$TAG"
echo "  Next:    verify the CI matrix is green on the tag"