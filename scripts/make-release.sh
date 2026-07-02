#!/usr/bin/env bash
# make-release.sh — manual release fallback for when release-please breaks.
#
# Usage:
#   ./scripts/make-release.sh <version> <release-name> <notes-file>
#   ./scripts/make-release.sh v0.4.2 "v0.4.2 — Forge eval" RELEASE-v0.4.2.md
#
# Requires:
#   - GH_TOKEN env var (GitHub PAT with repo scope)
#   - Notes file exists
#   - Current branch = main, working tree clean, version in package.json matches
#
# What it does:
#   1. Validates version is in package.json
#   2. Creates annotated tag locally
#   3. Pushes tag to origin
#   4. Creates GitHub release from the notes file

set -euo pipefail

if [[ $# -lt 3 ]]; then
  echo "Usage: $0 <version> <release-name> <notes-file>" >&2
  echo "  e.g. $0 v0.4.2 'v0.4.2 — Forge eval' RELEASE-v0.4.2.md" >&2
  exit 1
fi

VERSION="$1"
NAME="$2"
NOTES_FILE="$3"

if [[ -z "${GH_TOKEN:-}" ]]; then
  echo "GH_TOKEN env var is required" >&2
  exit 1
fi

if [[ ! -f "$NOTES_FILE" ]]; then
  echo "Notes file not found: $NOTES_FILE" >&2
  exit 1
fi

# Validate version is in package.json
PKG_VERSION=$(node -p "require('./package.json').version")
EXPECTED="${VERSION#v}"
if [[ "$PKG_VERSION" != "$EXPECTED" ]]; then
  echo "Version mismatch: package.json=$PKG_VERSION, tag=$EXPECTED" >&2
  exit 1
fi

REPO=$(node -p "const url=require('./package.json').repository?.url||''; url.replace(/^git\\+/,'').replace(/\\.git$/,'')")
if [[ -z "$REPO" ]]; then
  echo "Could not detect repo from package.json repository.url" >&2
  exit 1
fi

echo "→ Tagging $VERSION (name: $NAME) on $REPO"
git tag -a "$VERSION" -m "$NAME"
git push origin "$VERSION"

echo "→ Creating GitHub release"
# Build JSON payload via node to avoid quoting hell
node -e '
const fs = require("fs");
const payload = {
  tag_name: process.argv[1],
  name: process.argv[2],
  body: fs.readFileSync(process.argv[3], "utf8"),
  draft: false,
  prerelease: false,
};
console.log(JSON.stringify(payload));
' "$VERSION" "$NAME" "$NOTES_FILE" > /tmp/release-payload.json

curl -s -X POST \
  -H "Authorization: token $GH_TOKEN" \
  -H "Content-Type: application/json" \
  -d @/tmp/release-payload.json \
  "https://api.github.com/repos/$REPO/releases" \
  | node -e 'const d=JSON.parse(require("fs").readFileSync(0,"utf8")); console.log(d.html_url || ("err: "+(d.message||JSON.stringify(d))));'

rm -f /tmp/release-payload.json
echo "✓ Done"
