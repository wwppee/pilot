/**
 * Tests for the beginner-friendly guidance components (v0.5.18).
 * v0.5.22: glossary data is now per-locale; tests use the
 * `shortFor` / `definitionFor` helpers instead of reading the
 * raw `entry.short` / `entry.definition` (which no longer exist).
 */

import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Hint } from "../src/components/Hint";
import { GlossaryTerm } from "../src/components/GlossaryTerm";
import glossary, {
  definitionFor,
  shortFor,
  type GlossaryKey,
} from "../src/lib/glossary";
import type { Locale } from "../src/lib/i18n";

const LOCALES: Locale[] = ["en", "zh"];

describe("Hint", () => {
  it("renders collapsed by default with summary visible", () => {
    render(<Hint>Hidden body content here</Hint>);
    expect(screen.getByText(/What is this\?/)).toBeTruthy();
    expect(screen.queryByText(/Hidden body content here/)).toBeNull();
  });

  it("expands on click to show children", () => {
    render(<Hint>Expanded body</Hint>);
    fireEvent.click(screen.getByText(/What is this\?/));
    expect(screen.getByText(/Expanded body/)).toBeTruthy();
  });

  it("respects defaultOpen=true", () => {
    render(
      <Hint defaultOpen summary="open">
        body
      </Hint>,
    );
    expect(screen.getByText(/body/)).toBeTruthy();
  });

  it("uses custom summary when provided", () => {
    render(<Hint summary="What's a session?">body</Hint>);
    expect(screen.getByText(/What's a session\?/)).toBeTruthy();
  });
});

describe("GlossaryTerm", () => {
  it("renders the canonical short text by default", () => {
    render(<GlossaryTerm term="session" locale="en" />);
    expect(screen.getByText(/^session$/)).toBeTruthy();
  });

  it("uses custom children when provided", () => {
    render(
      <GlossaryTerm term="session" locale="en">
        conversation
      </GlossaryTerm>,
    );
    expect(screen.getByText(/conversation/)).toBeTruthy();
  });

  it("exposes the en definition as title + aria-label", () => {
    render(<GlossaryTerm term="session" locale="en" />);
    const el = screen.getByText(/^session$/);
    const def = definitionFor("session", "en");
    expect(el.getAttribute("title")).toBe(def);
    expect(el.getAttribute("aria-label")).toContain(def);
  });

  it("renders the zh short + definition when locale=zh", () => {
    render(
      <GlossaryTerm term="session" locale="zh">
        会话
      </GlossaryTerm>,
    );
    expect(screen.getByText(/^会话$/)).toBeTruthy();
    const def = definitionFor("session", "zh");
    const el = screen.getByText(/^会话$/);
    expect(el.getAttribute("title")).toBe(def);
  });

  it("every glossary key resolves to a non-empty short + definition in both locales", () => {
    for (const key of Object.keys(glossary) as GlossaryKey[]) {
      for (const locale of LOCALES) {
        expect(
          shortFor(key, locale).length,
          `${key}.short(${locale})`,
        ).toBeGreaterThan(0);
        expect(
          definitionFor(key, locale).length,
          `${key}.definition(${locale})`,
        ).toBeGreaterThan(10);
      }
    }
  });
});
