import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Reduced motion must kill the animation and must not kill the meaning.
 *
 * This is the whole accessible-design argument in one test. Depth and status
 * are redundant encodings: a verified record is still `green`, an unverified
 * one is still dashed and desaturated, a rejection is still `amber`, and a
 * drifted plan is still flagged, once the transform is gone. If a future edit
 * greys out the verified state inside the reduced-motion block, it has destroyed
 * the state rather than the motion, and that is a worse bug than a missing
 * animation.
 */

const ROOT = process.cwd();
const CSS = resolve(ROOT, "app/globals.css");
const TAILWIND = resolve(ROOT, "tailwind.config.ts");
const TOKENS = resolve(ROOT, "components/ananta/tokens.ts");

const read = (file: string): string => readFileSync(file, "utf8");

const DEPTH_CLASSES = [
  "depth-recessed",
  "depth-flush",
  "depth-raised",
  "depth-lifted",
  "depth-floating",
  "depth-foreground",
];

const TILT_CLASSES = Array.from({ length: 7 }, (_, i) => `tilt-by-drift-${i}`);

/** The body of the reduced-motion at-rule, or an empty string if it is gone. */
function reducedMotionBlock(css: string): string {
  const at = css.indexOf("@media (prefers-reduced-motion: reduce)");
  if (at === -1) return "";
  let depth = 0;
  for (let i = at; i < css.length; i += 1) {
    if (css[i] === "{") depth += 1;
    else if (css[i] === "}") {
      depth -= 1;
      if (depth === 0) return css.slice(at, i + 1);
    }
  }
  return css.slice(at);
}

/** The declarations inside the block that mention `selector`. */
function ruleFor(block: string, selector: string): string {
  const re = new RegExp(`(?:^|[,{}\\s])${selector.replace(".", "\\.")}\\s*(?:,[^{]*)?\\{([^}]*)\\}`, "m");
  const m = re.exec(block);
  return m ? m[1] : "";
}

describe("the reduced motion block exists and does real work", () => {
  const css = read(CSS);
  const block = reducedMotionBlock(css);

  it("is present", () => {
    expect(block).not.toBe("");
  });

  it("neutralises animation, transition and smooth scroll for everything", () => {
    expect(block).toMatch(/\*\s*,\s*\*::before\s*,\s*\*::after\s*\{/);
    expect(block).toMatch(/animation-duration:\s*0?\.01ms\s*!important/);
    expect(block).toMatch(/animation-iteration-count:\s*1\s*!important/);
    expect(block).toMatch(/transition-duration:\s*0?\.01ms\s*!important/);
    expect(block).toMatch(/scroll-behavior:\s*auto\s*!important/);
  });

  it("neutralises transform on all six depth classes", () => {
    for (const cls of DEPTH_CLASSES) {
      expect(ruleFor(block, `.${cls}`), cls).toMatch(/transform:\s*none/);
    }
  });

  it("neutralises transform on all seven tilt classes", () => {
    for (const cls of TILT_CLASSES) {
      expect(ruleFor(block, `.${cls}`), cls).toMatch(/transform:\s*none/);
    }
  });

  it("neutralises the hover lift, which is a transform and would otherwise fire", () => {
    expect(ruleFor(block, ".lift")).toMatch(/transform:\s*none/);
  });

  it("still stops the route dot, which is the one animation in the app", () => {
    expect(block).toMatch(/\.travel-dot\s*\{[^}]*display:\s*none/);
    expect(block).toMatch(/\.travel-connector-dot\s*\{[^}]*animation:\s*none/);
  });
});

describe("reduced motion does not destroy the meaning", () => {
  const css = read(CSS);
  const block = reducedMotionBlock(css);

  it("touches no colour anywhere in the block", () => {
    for (const property of ["color", "background", "border-color", "fill", "stroke", "opacity"]) {
      expect(new RegExp(`(?:^|[;{\\s])${property}\\s*:`, "m").test(block), property).toBe(false);
    }
  });

  it("touches no filter, so a recessed card keeps its desaturation", () => {
    expect(/(?:^|[;{\s])filter\s*:/.test(block)).toBe(false);
  });

  it("touches no border, so an unverified card keeps its dashed edge", () => {
    expect(/(?:^|[;{\s])border(?:-\w+)?\s*:/.test(block)).toBe(false);
  });

  it("keeps saturate out of the block and in the depth rule instead", () => {
    expect(block).not.toMatch(/saturate/);
    expect(css).toMatch(/\.depth-recessed\s*\{[^}]*filter:\s*saturate\(0?\.6\)/);
  });

  it("leaves the state colours to the chip classes, not the motion block", () => {
    const chips = read(TOKENS);
    for (const tone of ["text-green", "text-blue", "text-amber", "text-muted", "border-dashed"]) {
      expect(chips, tone).toContain(tone);
    }
    for (const tone of ["text-green", "text-amber"]) {
      expect(block, tone).not.toContain(tone);
    }
  });
});

describe("the depth scale is still readable with motion off", () => {
  const css = read(CSS);

  it("gives every depth step a distinct shadow, so the staircase survives a flat layout", () => {
    const shadows = DEPTH_CLASSES.map((cls) => {
      const m = new RegExp(`\\.${cls}\\s*\\{[^}]*box-shadow:\\s*([^;}]+)`).exec(css);
      expect(m, cls).not.toBeNull();
      return m![1].trim();
    });
    expect(new Set(shadows).size, "two depth steps share a shadow").toBe(shadows.length);
  });

  it("gives recessed an inset shadow, which is what makes it read as carved", () => {
    expect(css).toMatch(/\.depth-recessed\s*\{[^}]*box-shadow:\s*var\(--shadow-inset\)/);
    expect(/--shadow-inset:\s*inset/.test(css)).toBe(true);
  });

  it("keeps the recessed inset distinct from every raised stack", () => {
    const inset = /--shadow-inset:\s*([^;]+);/.exec(css)![1];
    for (const key of ["--shadow-z-flush", "--shadow-z-raised", "--shadow-z-lifted", "--shadow-z-floating"]) {
      const other = new RegExp(`${key}:\\s*([^;]+);`).exec(css)![1];
      expect(other.includes("inset"), key).toBe(false);
    }
    expect(inset.includes("inset")).toBe(true);
  });
});

describe("the motion tokens match the stylesheet", () => {
  it("declares the two interaction durations and the scene duration", () => {
    const css = read(CSS);
    expect(css).toMatch(/--motion-hover:\s*120ms/);
    expect(css).toMatch(/--motion-state:\s*200ms/);
    expect(css).toMatch(/--motion-scene:\s*320ms/);
  });

  it("exports the same three durations from tokens.ts", () => {
    const tokens = read(TOKENS);
    expect(tokens).toMatch(/MOTION\s*=\s*\{\s*hover:\s*120,\s*state:\s*200,\s*scene:\s*320\s*\}/);
  });

  it("exports the same perspective band from tokens.ts", () => {
    expect(read(TOKENS)).toMatch(
      /PERSPECTIVE\s*=\s*\{\s*min:\s*900,\s*default:\s*1200,\s*max:\s*1400\s*\}/,
    );
  });

  it("declares the same durations in tailwind.config.ts", () => {
    expect(read(TAILWIND)).toMatch(/120:\s*"120ms"/);
    expect(read(TAILWIND)).toMatch(/200:\s*"200ms"/);
    expect(read(TAILWIND)).toMatch(/320:\s*"320ms"/);
  });
});
