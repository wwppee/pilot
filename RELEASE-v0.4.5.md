# v0.4.5 — Cozy 2.5D Sandbox Skin

**v0.4.5 turns on Layer 2 of Pilot's visual stack** — the cozy 2.5D
isometric skin from `docs/visual-style.md`. Toggle it on `/compose`
to switch the canvas from the modern flat SaaS look (v0.4.4) to a
warm cream-and-sage sandbox where every block looks like a little
cube on sand.

## What's new

### View-mode toggle on `/compose`
- **🌑 Modern** (default) — flat SaaS look, dark theme, dotted grid
- **🌿 Cozy** — cream background, sage/amber palette, isometric grid,
  Outfit + JetBrains Mono fonts, blocks have pseudo-element "depth
  faces" so they look like little cubes
- Toggle button is in the Inspector footer (between Cozy button and
  Export). Clicking swaps instantly with a CSS transition.
- Choice persists in `localStorage["pilot-compose-view-mode"]`

### Warm palette (Cozy only)
Scoped via CSS variables in `globals.css` so the rest of the
dashboard stays dark:

```
--cozy-bg:        #faf6ee  (cream sand)
--cozy-surface:   #fffdf6  (cube face)
--cozy-surface-2: #f4eed8  (lit top face)
--cozy-grid:      #e6dcbe  (isometric grid lines)
--cozy-text:      #2a3a30  (deep forest)
--cozy-text-muted:#7a6a55  (warm dust)
--cozy-accent:    #4f7a64  (sage primary)
--cozy-accent-2:  #d49050  (warm amber)
--cozy-edge:      #d8c8a4  (right-face depth)
--cozy-edge-bottom: #c5b288 (bottom edge)
--cozy-font:      var(--font-outfit)
--cozy-mono:      var(--font-jetbrains-mono)
```

### Block depth faces (the 2.5D trick)
Each Cozy block uses two pseudo-elements to fake a 3D cube without
warping the text inside:

- `::before` — top "lit" face, skewed -30° on the X axis, lighter
  background, gives the cube its top edge
- `::after` — right "depth" face, skewed -30° on the Y axis, darker
  background, gives the cube its right edge
- A multi-layer box-shadow (a 2px hard shadow + a soft warm shadow)
  anchors the cube on the sand

Why pseudo-elements instead of true `transform: rotateX()`?
Rotating a real 3D cube makes the inner text rotate too — which
breaks readability. The pseudo-element trick gives the visual
illusion of depth while keeping text flat and sharp.

### Fonts
- **Outfit** (400/500/600/700) — sans-serif, loaded via
  `next/font/google` for the cozy labels and headings
- **JetBrains Mono** (400/500) — for the small mono bits (block
  sublabels, monospace fields)
- Both scoped via `--font-outfit` and `--font-jetbrains-mono` CSS
  variables; the modern (dark) theme doesn't use them — that's why
  the rest of the dashboard still feels native

### Isometric grid background
Cozy canvas uses two 60° / -60° linear-gradients on a 40px tile to
simulate isometric graph paper. Switch from the flat dotted grid
used in Modern mode. Tiny "🌿 cozy sandbox" hint in the top-left
of the canvas so you know you're in Cozy.

### Block hover / selected / dragging states
Three states with distinct depth cues:
- **Hover**: block lifts 1px up-left, shadow extends
- **Selected**: amber border + 3px amber glow
- **Dragging**: block lifts 2px up-left, stronger shadow

### JS-side architecture
- New `ViewMode = "modern" | "cozy"` exported from `ComposeBoard.tsx`
- `viewMode` state initialized from `localStorage["pilot-compose-view-mode"]`
- Persistence mirrors `ComposeState` pattern (load/save with try/catch)
- `<div className="compose-canvas modern|cozy">` toggles via
  React state — pure CSS-driven, no conditional rendering

### Test infrastructure
- Installed `jsdom` as dev dep
- New `tests/setup.ts` polyfills `window.localStorage` (jsdom doesn't
  provide one out of the box)
- `vitest.config.ts` now sets `environment: "jsdom"` + `setupFiles`
  for the whole web package
- 22/22 web vitest pass (was 17; +5 for the ViewMode persistence)

## Numbers
- **258/258** core tests pass (no change)
- **22/22** web vitest (was 17; +5)
- **23/23** server tests (no change)
- TypeScript strict, **0 errors**
- Web build: 17 routes, /compose still the cozy-enabled one
- New CSS: ~145 lines (cozy overrides) + 14 vars in globals.css

## Visual diff (text sketch)

```
Modern (default):                Cozy (opt-in):
┌─────────────┐                  ┌─────────────┐
│ ░░░░░░░░░░░░ │  dotted grid    │  ╲ ╱╲ ╱╲ ╱ │  isometric
│ ┌─────────┐ │                  │  ╱╲ ╱╲ ╱╲ │  grid
│ │ Session │ │  flat block      │ ┌─────────┐│
│ │ ses-1   │ │  2D              │ ╲│ Session ││  cube with
│ └─────────┘ │                  │ ╲│ ses-1   ││  depth faces
│             │                  │ ╲└─────────┘│
└─────────────┘                  └─────────────┘
  #0b0d10 bg                     #faf6ee bg
  Outfit not loaded              Outfit 600
  sans-serif system              sage + amber
```

## What still doesn't work
- No rotation/zoom of the canvas (planned for v0.4.6)
- Sidebar/inspector stay Modern even in Cozy mode (intentional —
  they're chrome, not sandbox contents)
- Cozy has no `transform: rotate()` controls; blocks still 2D with
  depth faces

## Files added
- `web/tests/setup.ts` — jsdom localStorage polyfill + cleanup
- `web/src/app/compose/ComposeBoard.tsx` (modified) — viewMode state
  + persistence + toggle UI
- `web/src/app/compose/compose.module.css` (modified) — +145 lines
  of `.cozy` overrides
- `web/src/app/globals.css` (modified) — +14 CSS variables for
  warm palette
- `web/src/app/layout.tsx` (modified) — load Outfit + JetBrains Mono
  via `next/font/google`
- `web/vitest.config.ts` (modified) — jsdom env + setupFiles

## Files changed
- `web/src/lib/types.ts` — no new types needed
- `package.json` / `web/package.json` — bump to 0.4.5

## Tagged
```
git tag -a v0.4.5 -m "v0.4.5 — Cozy 2.5D Sandbox Skin"
```