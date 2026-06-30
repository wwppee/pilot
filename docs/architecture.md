# Architecture

> Single source of truth for how Pilot's code is organized.

## Layer model

```
┌────────────────────────────────────────────────────────┐
│  src/cli.ts        Commander wiring · entry point      │
├────────────────────────────────────────────────────────┤
│  src/commands/     One file per top-level command      │
│    pack.ts         (manifest + run exports)            │
│    session.ts                                       │
│    doctor.ts                                         │
├────────────────────────────────────────────────────────┤
│  src/core/         Pure logic, no CLI knowledge        │
│    settings.ts     Read ~/.pi/agent/settings.json    │
│    jsonl-parser.ts Stream session JSONL                │
│    sessions.ts     Walk sessions directory             │
│    npm-registry.ts npm search + get                   │
│    pi-cli.ts       Subprocess wrapper for `pi`         │
│    types.ts        Shared types                        │
├────────────────────────────────────────────────────────┤
│  src/utils/        Helpers                             │
│    logger.ts       Colored, TTY-aware output           │
└────────────────────────────────────────────────────────┘
```

## The contract between layers

**`core/` must never import from `commands/` or `cli.ts`.**

This keeps `core/` testable in isolation and reusable from non-CLI entry
points (SDK, future RPC server, pi extension, etc.).

**`commands/` may import from `core/` and `utils/` only.**

Commands are thin: parse args → call core → render.

**`cli.ts` is the only place that knows about commander.**

Adding a new CLI flag? Touch `cli.ts`. Adding new subcommand behavior?
Touch `commands/<name>.ts`. The two stay independent.

## The Command interface

```typescript
// src/core/types.ts
export interface Command {
  name: string;
  description: string;
  subcommands?: string[];
}

// src/commands/pack.ts (example)
export const manifest: Command = { name: 'pack', description: '...' };
export async function run(args: string[], ctx: PilotContext): Promise<number> {
  // dispatch on args[0] to subcommand handlers
}
```

**Why this shape?**

1. **One file = one command.** A contributor can add `pilot foo` by creating
   one file. They don't need to read 5 other files to understand the wiring.
2. **No magic.** The dispatch table is right there in `cli.ts`.
3. **Testable.** `run(args, ctx)` is a pure function — no global state, no
   process.exit, easy to mock ctx.

## Data sources

Pilot reads from exactly two places:

| Source | Reader | Mutation? |
|---|---|---|
| `~/.pi/agent/settings.json` | `core/settings.ts` | ❌ read-only |
| `~/.pi/agent/sessions/**/*.jsonl` | `core/jsonl-parser.ts`, `core/sessions.ts` | ❌ read-only |
| npm registry | `core/npm-registry.ts` | ❌ read-only |

The only mutation is shelling out to `pi install/remove/update` via
`core/pi-cli.ts`. We let pi own its state; we just trigger.

## Future: Pilot as a pi extension

v1.0 plan: ship Pilot also as a pi extension.

```
pi install npm:@pilot/pi-extension
```

This adds `/pilot` slash commands inside pi itself. The extension is a
thin wrapper that spawns `pilot` as a subprocess and pipes output back
into the TUI.

The codebase is already shaped for this — `core/` knows nothing about
the CLI, so reusing it from a pi extension is straightforward.