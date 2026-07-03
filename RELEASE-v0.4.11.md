# v0.4.11 — WebUI i18n (EN / 中文)

**v0.4.11 brings the Pilot Web UI to both English and Chinese.** The
default is auto-detected from `Accept-Language` — a Chinese-locale
system gets Chinese out of the box, an English-locale system gets
English. The user can override at any time with the `EN | 中` toggle
in the header; the choice persists in `localStorage["pilot-locale"]`
and survives reloads.

## What's new

### Auto-detect Chinese as default

```http
GET /
Accept-Language: zh-CN,zh;q=0.9,en;q=0.8
```

→ Server reads the header in `RootLayout`, picks the first supported
locale (`zh`), pre-renders the layout + nav + footer + page hero in
Chinese. The `<html lang="zh">` attribute is set so screen readers
and browser font fallback use the right locale.

Mac / Linux users with `LANG=zh_CN.UTF-8`, Windows users with
Chinese system locale, and any browser with Chinese in its
language preferences get Chinese by default.

### `EN | 中` toggle in header

A small pill button group in the header, sitting right next to the
server-status indicator:

```
                              [EN] [中]   🟢 pilot server · v0.4.11
```

- `aria-pressed` on the active option
- `lang="en"` / `lang="zh"` attribute per option (helps screen
  reader voice selection)
- Click switches immediately, persists to localStorage, syncs
  `<html lang>`

### Custom-built lightweight i18n

Not `next-intl`. Pilot already has 18 routes, ~4 commits/month, and
isn't a content-heavy SaaS — adding `next-intl` would drag in
middleware, message loaders, and a build-time ICU compiler for what
is genuinely a 120-key dictionary. So I built the smallest thing
that works:

- `web/src/lib/i18n/` — pure-TypeScript dict + helpers
  - `dict.en.ts` (90+ keys)
  - `dict.zh.ts` (90+ keys)
  - `index.ts` — `format()`, `translate()`, `negotiateLocale()`,
    `readStoredLocale()`, `writeStoredLocale()`
- `web/src/components/I18n.tsx` — `<I18nProvider>` (client island)
  + `<T k="key" />` (drop-in replacement) + `useT()` hook
- `web/src/components/LanguageSwitcher.tsx` — header toggle

### Locale negotiation

`Accept-Language` is parsed with q-value support and falls back
gracefully:

```ts
negotiateLocale("zh-CN,zh;q=0.9,en;q=0.8,en-US;q=0.7")  // → "zh"
negotiateLocale("fr-FR,de;q=0.8")                       // → "en" (unsupported)
negotiateLocale("")                                     // → "en" (fallback)
negotiateLocale("zh-TW")                                // → "zh" (region-agnostic)
```

Resolution order at runtime:

1. `localStorage["pilot-locale"]` — user explicitly toggled
2. `Accept-Language` header — system / browser default
3. `"en"` — last-resort fallback

### Translation coverage

| Surface | Translated |
|---|---|
| Skip link, nav, server status, footer, brand | ✅ |
| Language switcher labels | ✅ |
| Every page hero (h1 + subtitle) — 10 routes | ✅ |
| Common buttons (Save / Cancel / Back / Search / Create / Delete / etc.) | ✅ |
| Table headers (Model / Source / Safety / Status / etc.) | ✅ |
| `PolicyForm` client form buttons + ARIA labels | ✅ |
| API data (model names, pack names, tool names) | ❌ real data, never translated |

The `PolicyForm` client component (a "use client" island) uses the
same `useT()` hook — translation is consistent across server and
client components.

### Visual polish

The toggle uses the existing `--accent` color for the active option
so it slots in without adding new theme tokens. Inactive options are
`--text-muted`; hover shows them at full `--text`. The toggle
respects `:focus-visible` — the same focus ring as every other
interactive element.

### a11y for the switcher itself

- `role="group"` + `aria-label="Language"` on the container
- `aria-pressed={active}` on each button (toggle pattern)
- `lang="en"` / `lang="zh"` attribute per option so screen readers
  pick the right voice without having to parse the visible label
- Keyboard: Tab through, Enter activates (default `<button>`)

## Files

New:
```
web/src/components/I18n.tsx              (158 lines — provider + <T> + useT)
web/src/components/LanguageSwitcher.tsx  (50 lines)
web/src/lib/i18n/types.ts                (Dict type — 90+ keys)
web/src/lib/i18n/dict.en.ts              (English dictionary)
web/src/lib/i18n/dict.zh.ts              (Chinese dictionary)
web/src/lib/i18n/index.ts                (format, translate, negotiateLocale, etc.)
web/tests/i18n.test.ts                   (20 tests — dict completeness, locale negotiation, localStorage)
```

Modified:
```
web/src/app/layout.tsx                   (Accept-Language → I18nProvider → <T> nav + footer)
web/src/app/page.tsx                     (Dashboard)
web/src/app/packages/page.tsx            (Package Center)
web/src/app/sessions/page.tsx            (Sessions)
web/src/app/usage/page.tsx               (Token usage & cost)
web/src/app/tools/page.tsx               (Tool inventory)
web/src/app/context/page.tsx             (Project context)
web/src/app/policy/page.tsx              (Tool Policies)
web/src/app/policy/[name]/edit/PolicyForm.tsx  (client form buttons)
web/src/app/compose/page.tsx             (Compose hero)
web/src/app/profiles/page.tsx            (Profiles)
web/src/app/capabilities/page.tsx        (Capabilities)
```

## Verification

- ✅ `web tsc --noEmit` — 0 errors
- ✅ `web build` — clean
- ✅ `web vitest` — 70/70 pass (was 50; +20 new i18n tests)
- ✅ `core vitest` — 270/270 pass
- ✅ Manual sanity (zh-CN system default → 概览 / 包 / 会话 / 用量 / 工具 / 上下文 / 策略 / 编排 / 配置 / 能力)

## Adding a new translation later

The pattern is intentionally low-friction:

1. Add a key to `web/src/lib/i18n/types.ts` (TypeScript will
   immediately tell you both dicts are out of sync — they have to
   match)
2. Add the English text to `dict.en.ts`
3. Add the Chinese text to `dict.zh.ts`
4. Use `<T k="your.new.key" />` or `t("your.new.key")` somewhere

The dict-completeness test (`tests/i18n.test.ts`) catches you if
you add a key to one dict but not the other.

## Why this matters

The Web UI was the last fully-English-only surface in Pilot — the
README, CLI help, and RELEASE notes had all moved to zh-CN over the
last few versions. v0.4.11 closes that gap. A user on a Chinese
system locale now gets the entire UI in Chinese without touching
anything. A power user on an English system can still flip to
Chinese to read a section more comfortably, or vice versa.

Total i18n cost:

- ~600 lines new (core + dicts + provider + tests)
- ~150 lines modified (12 page files + layout + PolicyForm)
- 1 new dep: none (no `next-intl`, no runtime cost)
- 1 build step: none (dicts are plain TS, type-checked at compile)