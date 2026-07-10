/**
 * Tests for the beginner-friendly guidance components (v0.5.18).
 */

import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Hint } from "../src/components/Hint";
import { GlossaryTerm } from "../src/components/GlossaryTerm";
import glossary from "../src/lib/glossary";

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
    render(<GlossaryTerm term="session" />);
    expect(screen.getByText(/^session$/)).toBeTruthy();
  });

  it("uses custom children when provided", () => {
    render(<GlossaryTerm term="session">conversation</GlossaryTerm>);
    expect(screen.getByText(/conversation/)).toBeTruthy();
  });

  it("exposes the definition as title + aria-label", () => {
    render(<GlossaryTerm term="session" />);
    const el = screen.getByText(/^session$/);
    expect(el.getAttribute("title")).toBe(glossary.session.definition);
    expect(el.getAttribute("aria-label")).toContain(
      glossary.session.definition,
    );
  });

  it("every glossary key resolves to an entry with short + definition", () => {
    for (const [key, entry] of Object.entries(glossary)) {
      expect(entry.short.length, `${key}.short`).toBeGreaterThan(0);
      expect(entry.definition.length, `${key}.definition`).toBeGreaterThan(10);
    }
  });
});
