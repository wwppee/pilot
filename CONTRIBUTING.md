# Contributing to Pilot

First off: thank you for taking the time. Pilot is small on purpose, and every contribution matters.

## Code of Conduct

This project follows [Contributor Covenant](./CODE_OF_CONDUCT.md). Be kind.

## Quick start

```bash
# 1. Fork & clone
git clone https://github.com/<you>/pilot.git
cd pilot

# 2. Install deps
npm install

# 3. Verify environment
npm run doctor
pilot doctor

# 4. Run in dev mode (no build)
npm run dev -- pack ls

# 5. Run tests
npm test

# 6. Lint + format
npm run lint
npm run format
```

## Project structure

```
src/
├── cli.ts                  # Entry point
├── commands/               # One file per top-level command
│   ├── pack.ts
│   ├── session.ts
│   └── doctor.ts
├── core/                   # Shared infrastructure (no CLI knowledge)
│   ├── pi-cli.ts           # pi process wrapper
│   ├── jsonl-parser.ts     # session file parser
│   ├── npm-registry.ts     # npm search & metadata
│   ├── conflict-detector.ts
│   ├── settings.ts         # ~/.pi/agent/settings.json reader
│   └── types.ts            # Shared types
├── utils/
│   ├── format.ts           # Output formatting (tables, colors)
│   └── logger.ts           # Consistent logging
└── index.ts                # Public API exports (for programmatic use)
test/
├── unit/                   # Module-level tests
└── e2e/                    # CLI-level tests
docs/
└── modules/                # One .md per command
```

## Adding a new command

The single most common contribution: **add a new `pilot <thing>` command**.

1. Create `src/commands/<thing>.ts`
2. Export `manifest` + `run` (see [Architecture docs](./docs/architecture.md))
3. Register in `src/cli.ts`
4. Add tests in `test/unit/<thing>.test.ts`
5. Add docs in `docs/modules/<thing>.md`

```typescript
// src/commands/example.ts
import type { Command } from '../core/types.js';

export const manifest: Command = {
  name: 'example',
  description: 'Does the example thing',
};

export async function run(args: string[], ctx: PilotContext): Promise<number> {
  // ...
  return 0; // exit code
}
```

## Coding standards

- **TypeScript strict mode** — no `any`, no implicit returns
- **Public API needs JSDoc**
- **Tests for new behavior** — aim for ≥80% coverage on changed files
- **Run lint + format before committing**

## Commit messages

[Conventional Commits](https://www.conventionalcommits.org/):

```
feat(pack): add team subcommand
fix(session): handle malformed JSONL
docs: update README with screenshot
```

## Pull Request

- One focused change per PR
- Reference related issues (`Closes #123`)
- Fill out the PR template
- Ensure CI is green

## Releases

Maintainers run `npm run release` (uses [np](https://github.com/sindresorhus/np)).
Every merge to `main` triggers automatic CHANGELOG generation.

## Reporting issues

Use the [bug template](./.github/ISSUE_TEMPLATE/bug.yml) or [feature template](./.github/ISSUE_TEMPLATE/feature.yml).
For security issues, **do not** open a public issue — email the maintainers.