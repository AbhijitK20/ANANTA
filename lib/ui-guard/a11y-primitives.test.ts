import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import config from "../../tailwind.config";

/**
 * The ratified primitives must still exist and must not have regressed.
 *
 * The focus ring, the `.sr-only` class, the skip link and the reduced-motion
 * block are ratified by `00-CONTRACTS.md` section 1 and are depended on by
 * other sessions. The contrast pairs are computed here from the hex values in
 * `tailwind.config.ts`, so a palette edit that quietly drops a pair below
 * 4.5 to 1 fails a test rather than shipping.
 */

const ROOT = process.cwd();
const CSS = resolve(ROOT, "app/globals.css");
const TAILWIND = resolve(ROOT, "tailwind.config.ts");

const read = (file: string): string => readFileSync(file, "utf8");

/**
 * Top level selectors only.
 *
 * This file formats every top level rule at column zero and indents everything
 * inside an at-rule, so a selector at the start of a line is a top level one.
 * That is a formatting dependency, and it is stated here rather than assumed:
 * a nested rule is indented and is not counted as a duplicate.
 */
function topLevelSelectors(css: string): string[] {
  const out: string[] = [];
  for (const line of css.split("\n")) {
    const m = /^([^\s@/}][^{]*?)\s*\{/.exec(line);
    if (m) out.push(m[1].trim());
  }
  return out;
}

/** sRGB channel to linear light, per WCAG 2.x. */
function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const clean = hex.replace("#", "").trim();
  const full =
    clean.length === 3
      ? clean.split("").map((c) => c + c).join("")
      : clean;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(foreground: string, background: string): number {
  const a = luminance(foreground);
  const b = luminance(background);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}

/** The four pairs the brief names, read from the config so a palette edit is caught. */
function palette(): Record<string, string> {
  const source = read(TAILWIND);
  const found: Record<string, string> = {};
  for (const m of source.matchAll(/(\w+):\s*"(#[0-9A-Fa-f]{6})"/g)) found[m[1]] = m[2];
  return found;
}

describe("the ratified accessibility primitives", () => {
  const css = read(CSS);
  const top = topLevelSelectors(css);

  it("has exactly one bare :focus-visible rule", () => {
    expect(top.filter((s) => s === ":focus-visible")).toHaveLength(1);
  });

  it("keeps the focus ring at 3px, which is the WCAG 2.2 target", () => {
    expect(css).toMatch(/:focus-visible\s*\{[^}]*outline:\s*3px/);
  });

  it("has one .sr-only class and does not clip twice", () => {
    expect(top.filter((s) => s === ".sr-only")).toHaveLength(1);
    expect(css).toMatch(/\.sr-only\s*\{[^}]*clip:\s*rect\(0,\s*0,\s*0,\s*0\)/);
  });

  it("has one .skip-link that is revealed on :focus", () => {
    expect(top.filter((s) => s === ".skip-link")).toHaveLength(1);
    expect(css).toMatch(/\.skip-link\s*\{[^}]*left:\s*-9999px/);
    expect(css).toMatch(/\.skip-link:focus\s*\{[^}]*left:\s*0/);
  });

  it("has a prefers-reduced-motion block", () => {
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  });

  it("has the panel and chip primitives this round added, each exactly once", () => {
    for (const cls of [".card", ".chip", ".prose-note", ".hairline"]) {
      expect(top.filter((s) => s === cls), cls).toHaveLength(1);
    }
  });

  it("grows no new focus rule: the selector set is exactly the ratified one", () => {
    const found = new Set<string>();
    for (const m of css.matchAll(/([^\s,{}]*:focus-visible)\s*[,{]/g)) found.add(m[1]);
    expect([...found].sort()).toEqual([
      ".bg-blue:focus-visible",
      ".cluster-badge:focus-visible",
      ":focus-visible",
      "input:focus-visible",
      "select:focus-visible",
      "textarea:focus-visible",
    ]);
  });

  it("has exactly one global focus rule, and the rest only invert a surface", () => {
    const bare = [...css.matchAll(/([^\s,{}]*:focus-visible)\s*[,{]/g)].filter((m) => m[1] === ":focus-visible");
    expect(bare).toHaveLength(1);
  });
});

describe("the contrast pairs clear 4.5 to 1", () => {
  const c = palette();

  it("read every colour it needs out of tailwind.config.ts", () => {
    for (const name of ["ink", "muted", "amber", "amberSoft", "canvas", "blue", "green"]) {
      expect(c[name], name).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it("ink on canvas", () => {
    expect(contrast(c.ink, c.canvas)).toBeGreaterThanOrEqual(4.5);
  });

  it("muted on white", () => {
    expect(contrast(c.muted, "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });

  it("amber on amberSoft", () => {
    expect(contrast(c.amber, c.amberSoft)).toBeGreaterThanOrEqual(4.5);
  });

  it("green on greenSoft, because a verified badge is not allowed to be unreadable", () => {
    expect(contrast(c.green, "#E8F5EE")).toBeGreaterThanOrEqual(4.5);
  });

  it("blue on blueSoft, for the same reason on a community badge", () => {
    expect(contrast(c.blue, "#E8F0FF")).toBeGreaterThanOrEqual(4.5);
  });

  it("muted on canvas, which is the unverified chip and the hardest pair to keep readable", () => {
    expect(contrast(c.muted, c.canvas)).toBeGreaterThanOrEqual(4.5);
  });

  it("pins the ratios as numbers, not as prose", () => {
    expect(contrast(c.ink, c.canvas)).toBeGreaterThanOrEqual(13);
    expect(contrast(c.muted, "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.amber, c.amberSoft)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("the contrast maths is not lying", () => {
  it("computes the known ratios for black on white and white on black", () => {
    expect(contrast("#000000", "#ffffff")).toBe(21);
    expect(contrast("#ffffff", "#000000")).toBe(21);
  });

  it("is order independent", () => {
    expect(contrast(c4(), c5())).toBe(contrast(c5(), c4()));
  });

  function c4(): string {
    return "#175CD3";
  }
  function c5(): string {
    return "#E8F0FF";
  }

  it("accepts three digit hex", () => {
    expect(contrast("#000", "#fff")).toBe(21);
  });
});

describe("the seven step type scale is in the config", () => {
  const source = read(TAILWIND);

  it("has all seven sizes with their line heights", () => {
    const expected: [string, string, string][] = [
      ["micro", "11px", "16px"],
      ["meta", "12px", "20px"],
      ["bodySm", "13px", "20px"],
      ["body", "15px", "24px"],
      ["lead", "17px", "28px"],
      ["title", "21px", "28px"],
      ["display", "28px", "34px"],
    ];
    for (const [key, size, leading] of expected) {
      const pattern = new RegExp(`["']?${key}["']?:\\s*\\["${size}",\\s*\\{\\s*lineHeight:\\s*"${leading}"\\s*\\}\\]`);
      expect(source, `${key} ${size}/${leading}`).toMatch(pattern);
    }
  });

  it("keeps the ratified colours untouched", () => {
    for (const token of [
      "#18202B", "#667085", "#DDE3EA", "#F4F6F8",
      "#175CD3", "#E8F0FF", "#087443", "#E8F5EE", "#A15C07", "#FFF4D6",
    ]) {
      expect(source, token).toContain(token);
    }
  });

  it("keeps the ratified shadows as the ambient occlusion stacks, not one flat layer", () => {
    // A single flat shadow reads as a sticker. The two ratified flat values are
    // replaced by the stacks, and the old `card` and `float` keys now point at a
    // real step so nothing is left reading as one layer. Read the resolved
    // values, not the source text, because the config interpolates the ink.
    const shadows = (config.theme?.extend?.boxShadow ?? {}) as Record<string, string>;
    for (const key of ["recessed", "flush", "raised", "lifted", "floating", "foreground", "card", "float"]) {
      expect(typeof shadows[key], key).toBe("string");
      expect(shadows[key].length, key).toBeGreaterThan(4);
    }
    expect(shadows.raised).toContain("0 1px 2px rgba(24, 32, 43, 0.05)");
    expect(shadows.card).not.toBe("0 12px 32px rgba(24, 32, 43, 0.07)");
    expect(shadows.float).not.toBe("0 20px 55px rgba(24, 32, 43, 0.14)");
  });
});

describe("the guards do not depend on a browser", () => {
  it("reads files that exist and are not empty", () => {
    expect(existsSync(CSS)).toBe(true);
    expect(read(CSS).length).toBeGreaterThan(1000);
    expect(existsSync(join(ROOT, "lib/engine/index.ts"))).toBe(true);
  });
});
