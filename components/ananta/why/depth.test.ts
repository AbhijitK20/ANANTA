import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { KNOWLEDGE_DEPTH, depth } from "@/components/ananta/tokens";
import { DEFAULT_ROW_CONFIDENCE, confidenceFor, rowDepth, rowRecessed } from "./depth";

/**
 * The spatial grammar, asserted rather than asserted-in-a-comment.
 *
 * The contract's whole thesis is that depth encodes what we know and never how
 * large a number is. That is easy to state and easy to erode, because a
 * `translateZ` on a big score looks like a feature and nothing fails. So the two
 * rules that matter are checked here, and the control rule is checked against
 * the real source files rather than against my memory of them.
 */

const ROW = (contribution: number) => ({ id: "interest" as const, contribution });

describe("contribution is never encoded as depth", () => {
  it("gives the same depth to a big and a small contribution of equal confidence", () => {
    // The regression this forbids: the 0.9 row standing proud and the 0.1 row
    // sitting back, which would make the reader unable to tell a small value from
    // a far one. Magnitude is bar length and the printed number instead.
    expect(rowDepth(ROW(0.9), "estimate")).toBe(rowDepth(ROW(0.1), "estimate"));
    expect(rowDepth(ROW(0.9), "verified")).toBe(rowDepth(ROW(0.1), "verified"));
    expect(rowDepth(ROW(4), "estimate")).toBe(rowDepth(ROW(0.001), "estimate"));
  });

  it("uses only the six depth steps, never a magnitude derived one", () => {
    const legal = new Set<string>(Object.values(depth));
    for (const confidence of ["verified", "community", "estimate", "unverified"] as const) {
      for (const contribution of [-2, -0.1, 0, 0.1, 2]) {
        expect(legal.has(rowDepth(ROW(contribution), confidence))).toBe(true);
      }
    }
  });
});

describe("status is the only depth, and a penalty is not uncertainty", () => {
  it("moves the row with confidence, not with the number", () => {
    expect(rowDepth(ROW(0.5), "verified")).toBe(depth.raised);
    expect(rowDepth(ROW(0.5), "community")).toBe(depth.raised);
    expect(rowDepth(ROW(0.5), "estimate")).toBe(depth.flush);
    expect(rowDepth(ROW(0.5), "unverified")).toBe(depth.recessed);
  });

  it("flushes a negative contribution even when its fact is unverified", () => {
    // The distinction the prompt asks to be tested: a penalty is a real computed
    // result, and recessing it would claim "we do not know", which is wrong.
    expect(rowDepth(ROW(-0.4), "verified")).toBe(depth.flush);
    expect(rowDepth(ROW(-0.4), "unverified")).toBe(depth.flush);
    expect(rowDepth(ROW(-0.4), "unverified")).not.toBe(depth.recessed);
  });

  it("recesses only a non negative row whose fact is unverified", () => {
    expect(rowRecessed(ROW(0.4), "unverified")).toBe(true);
    expect(rowRecessed(ROW(-0.4), "unverified")).toBe(false);
    expect(rowRecessed(ROW(0.4), "verified")).toBe(false);
    expect(rowRecessed(ROW(0.4), "estimate")).toBe(false);
  });

  it("defaults to estimate, never to verified", () => {
    expect(DEFAULT_ROW_CONFIDENCE).toBe("estimate");
    expect(rowDepth(ROW(0.4))).toBe(depth.flush);
    expect(confidenceFor(ROW(0.4), undefined)).toBe("estimate");
    expect(confidenceFor(ROW(0.4), {})).toBe("estimate");
    expect(confidenceFor(ROW(0.4), { interest: "unverified" })).toBe("unverified");
  });

  it("agrees with the shared knowledge table rather than restating it", () => {
    expect(rowDepth(ROW(0.4), "unverified")).toBe(KNOWLEDGE_DEPTH.unverified);
    expect(rowDepth(ROW(0.4), "verified")).toBe(KNOWLEDGE_DEPTH.verified);
  });
});

const read = (path: string): string => readFileSync(join(process.cwd(), path), "utf8");

/**
 * Comments are prose about the rule, not the rule, and several of them name the
 * classes they are arguing against. A grep that cannot tell a comment from code
 * fails on its own documentation, so strip them first. This is the same reason
 * session 1's spatial guard strips comments before it greps.
 */
const readCode = (path: string): string =>
  read(path)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");

const CONTROLS = ["components/plan-button.tsx", "components/save-button.tsx", "components/share-button.tsx"];
const BADGE = "components/plan-badge.tsx";

describe("no control changes depth on hover", () => {
  it("uses no lift class at all, because .lift:hover overrides the resting depth", () => {
    for (const file of [...CONTROLS, BADGE]) {
      const code = read(file);
      // `.lift:hover { transform: translateZ(26px) }` would replace the state
      // depth outright, so a control carrying both is a control that teleports.
      expect({ file, lift: /(^|[\s"'`])lift([\s"'`]|$)/.test(code) }).toEqual({ file, lift: false });
    }
  });

  it("never pairs a depth class with a hover variant", () => {
    for (const file of [...CONTROLS, BADGE]) {
      const code = read(file);
      const hoverDepth = /hover:[^"'`]*depth-/.test(code);
      expect({ file, hoverDepth }).toEqual({ file, hoverDepth: false });
    }
  });

  it("computes depth from state, so the class is chosen by a ternary and not by a pseudo class", () => {
    for (const file of ["components/plan-button.tsx", "components/save-button.tsx"]) {
      const code = read(file);
      expect({ file, byState: /\$\{\s*\w+\s*\?\s*depth\.raised\s*:\s*depth\.flush\s*\}/.test(code) }).toEqual({
        file,
        byState: true,
      });
    }
  });

  it("gives the state toggles both steps and the stateless control only flush", () => {
    expect(read("components/plan-button.tsx")).toContain("depth.raised");
    expect(read("components/save-button.tsx")).toContain("depth.raised");
    // Share has no pressed state, so it has no state to encode.
    const share = read("components/share-button.tsx");
    expect(share).toContain("depth.flush");
    expect(share).not.toContain("depth.raised");
  });

  it("leaves the fixed bottom nav out of the 3D layer entirely", () => {
    const badge = readCode(BADGE);
    expect(/depth-/.test(badge)).toBe(false);
    expect(/translateZ/.test(badge)).toBe(false);
    expect(/rotateX/.test(badge)).toBe(false);
    // The accessible name still has to carry the word, since there is no depth
    // left to carry it.
    expect(read(BADGE)).toContain("in your plan");
  });

  it("writes no inline transform anywhere, so the reduced-motion block owns them all", () => {
    for (const file of [...CONTROLS, BADGE, "components/ananta/why-this.tsx", "components/ananta/why-not-that.tsx"]) {
      const code = readCode(file);
      expect({ file, inlineTransform: /style=\{\{[^}]*transform/.test(code) }).toEqual({
        file,
        inlineTransform: false,
      });
    }
  });

  it("keeps the only inline style in the panel the bar width, which is the quantity channel", () => {
    // Counted as `style={{` occurrences rather than by matching to the closing
    // braces, because a bar width holds a template literal whose own braces end
    // the naive match early.
    const code = readCode("components/ananta/why-this.tsx");
    const openers = [...code.matchAll(/style=\{\{/g)].length;
    expect(openers).toBeGreaterThan(0);
    const properties = [...code.matchAll(/style=\{\{\s*([a-zA-Z]+)\s*:/g)].map((m) => m[1]);
    expect(properties).toHaveLength(openers);
    for (const property of properties) expect(property).toBe("width");
  });
});

describe("the panel depth is open state, not hover", () => {
  it("uses a different depth step for open and closed", () => {
    const code = read("components/ananta/why-not-that.tsx");
    expect(code).toContain('const OPEN_PANEL = "depth-flush"');
    expect(code).toContain('const CLOSED_PANEL = "depth-recessed"');
    expect(code).toContain("open ? OPEN_PANEL : CLOSED_PANEL");
  });

  it("gives each rejection row the depth of the fact that caused it", () => {
    const code = read("components/ananta/why-not-that.tsx");
    expect(code).toContain("KNOWLEDGE_DEPTH[item.causedByConfidence]");
  });
});
