import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { depth, depthShadow, KNOWLEDGE_DEPTH, RUNG_DEPTH } from "@/components/ananta/tokens";

/**
 * Depth encodes what we know, never how big a number is.
 *
 * The CHI 2026 D-MO result is that perspective projection makes a mark ambiguous
 * between "small value" and "far away", and size is one of the few channels that
 * actually conveys quantity. So a radar whose magnitude is read off a Z axis is
 * the exact failure the contract refuses, and a weight row that is lifted because
 * its number is high is the same failure in a list.
 *
 * These tests are the mechanical half of that promise. A reviewer can read them
 * instead of re-deriving the argument, and a future session that reaches for a
 * `rotateX` or an inline transform in one of these files fails here.
 */

const ROOT = process.cwd();
const MINE = [
  "components/ananta/stress-radar.tsx",
  "components/ananta/learned-weights.tsx",
  "components/ananta/learning/weight-row.tsx",
  "components/ananta/learning/learned-weights-panel.tsx",
  "components/ananta/learning/stored-state.tsx",
  "components/ananta/learning/ui-state.tsx",
  "components/ananta/learning/provenance-strip.tsx",
  "components/ananta/learning/stress-table.tsx",
  "components/ananta/learning/availability-snapshot.ts",
  "app/profile/page.tsx",
  "app/saved/page.tsx",
];

const read = (file: string): string => readFileSync(resolve(ROOT, file), "utf8");
const rel = (file: string): string => relative(ROOT, file).split(sep).join("/");

/** Blanks comments only, preserving offsets, so prose cannot trip a scan. */
function stripComments(text: string): string {
  let out = text.split("");
  let i = 0;
  let quote: string | null = null;
  while (i < text.length) {
    const c = text[i];
    const next = text[i + 1];
    if (quote) {
      if (c === "\\") i += 1;
      else if (c === quote) quote = null;
      i += 1;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      quote = c;
      i += 1;
      continue;
    }
    if (c === "/" && next === "/") {
      while (i < text.length && text[i] !== "\n") out[i++] = " ";
      continue;
    }
    if (c === "/" && next === "*") {
      out[i] = out[i + 1] = " ";
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) {
        if (text[i] !== "\n") out[i] = " ";
        i += 1;
      }
      out[i] = out[i + 1] = " ";
      i += 2;
      continue;
    }
    i += 1;
  }
  return out.join("");
}

describe("the radar stays flat, and the reason is the research", () => {
  const source = read("components/ananta/stress-radar.tsx");
  const code = stripComments(source);

  it("applies no rotation to the chart or the panel", () => {
    // A 7-axis radar is a planar chart. `rotateX` on it would make a low score
    // look like a distant one, which is the ambiguity the D-MO paper names.
    expect(code, "the radar must not rotate anything").not.toMatch(/rotate[XYZ]\s*\(/);
  });

  it("applies no inline transform, only depth class names", () => {
    expect(code).not.toMatch(/style=\{\{[^}]*transform/);
    expect(code).not.toMatch(/translateZ/);
  });

  it("uses only the six ratified depth steps", () => {
    const allowed = new Set<string>(Object.values(depth));
    // Scanned against the raw source, because the class names live inside
    // template-literal class lists that a string-stripping pass would blank.
    const used = [...read("components/ananta/stress-radar.tsx").matchAll(/\b(depth-[a-z]+)\b/g)].map((m) => m[1]);
    for (const step of used) expect(allowed.has(step), `${step} is not a ratified depth step`).toBe(true);
  });

  it("frames the panel rather than encoding a value in depth", () => {
    // The panel is raised as a whole and the rescue is lifted, which is the one
    // sanctioned use of "this is what to act on".
    const raw = read("components/ananta/stress-radar.tsx");
    expect(raw).toMatch(/\$\{depth\.raised\}\s+\$\{depthShadow\.raised\}/);
    expect(raw).toMatch(/\$\{depth\.lifted\}\s+\$\{depthShadow\.lifted\}/);
  });

  it("states the research reason in a comment, so the next session does not undo it", () => {
    expect(source).toMatch(/depth dimension is .*discouraged|discouraged/);
    expect(source).toMatch(/D-MO/);
  });
});

describe("a weight row is never lifted", () => {
  const source = stripComments(read("components/ananta/learning/weight-row.tsx"));

  it("uses only raised and flush, never lifted, floating, or foreground", () => {
    expect(source, "lifted means act on this, and no weight is a call to action").not.toMatch(
      /depth-lifted|depth-floating|depth-foreground/,
    );
    const raw = read("components/ananta/learning/weight-row.tsx");
    expect(raw).toMatch(/depth\.raised/);
    expect(raw).toMatch(/depth\.flush/);
  });

  it("reserves lifted for the radar's rescue move", () => {
    // Exactly one place in this session's files may use lifted, and it is the
    // rescue. A second one would mean two things are primary. Scanned with
    // comments stripped, because `weight-row.tsx` names `depth-lifted` in prose
    // precisely to say it never uses it.
    const lifted = MINE.filter(
      (file) =>
        stripComments(read(file)).includes("depth.lifted") ||
        stripComments(read(file)).includes("depth-lifted"),
    );
    expect(lifted, "only the radar's rescue move may be lifted").toEqual(["components/ananta/stress-radar.tsx"]);
  });
});

describe("depth on the saved list is status only", () => {
  const raw = read("app/saved/page.tsx");
  const source = stripComments(raw);

  it("keys the depth on whether the hours are known, not on recency or position", () => {
    expect(source).toMatch(/hoursKnown/);
    expect(raw).toMatch(/depth\.recessed/);
    expect(raw).toMatch(/depth\.raised/);
  });

  it("never reaches for a value channel, so recency cannot become depth", () => {
    // No `newest`, `recent`, `order`, or `sort` may feed a depth class.
    expect(source).not.toMatch(/depth-[a-z]+[^"]*"[^"]*\b(newest|recent|order|index|position)\b/);
  });

  it("keeps a recessed card readable without depth, so the channel is redundant", () => {
    const page = read("app/saved/page.tsx");
    // `.depth-recessed` desaturates and goes dashed in globals.css. This record
    // adds the dashed border at the call site so the state survives a reader who
    // cannot perceive depth at all.
    expect(page).toMatch(/border-dashed/);
  });
});

describe("the token tables are used, not retyped", () => {
  it("maps knowledge confidence to depth the way the contract fixes it", () => {
    expect(KNOWLEDGE_DEPTH).toEqual({
      verified: depth.raised,
      community: depth.raised,
      estimate: depth.flush,
      unverified: depth.recessed,
    });
  });

  it("maps the relaxation ladder to a descending staircase, so answer quality is height", () => {
    expect(RUNG_DEPTH).toEqual({
      strict: depth.lifted,
      dropped_minimum: depth.raised,
      greedy_fill: depth.flush,
      single_best: depth.recessed,
    });
  });

  it("has a shadow for every depth step, so nothing is raised with a flat shadow", () => {
    for (const step of Object.values(depth)) {
      const shadow = depthShadow[step.replace("depth-", "") as keyof typeof depthShadow];
      expect(shadow, `${step} has no shadow`).toBeTruthy();
    }
  });
});

describe("no session 8 file reaches for a motion library", () => {
  it("imports no 3D or animation package in any of my files", () => {
    const banned = /framer-motion|@react-three|from ["']three["']|gsap|from ["']motion["']|lenis|spring/;
    for (const file of MINE) {
      expect(read(file), file).not.toMatch(banned);
    }
  });
});
