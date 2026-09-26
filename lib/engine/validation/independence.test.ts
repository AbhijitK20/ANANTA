import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Definition of done item 1: the independence guarantee, asserted by reading
 * the import statements out of the file source. It is cheap and it is the whole
 * point, so it is a test rather than a code review comment.
 *
 * A future refactor that extracts a shared helper into `scoring/` and imports it
 * here would make this file pass its own tests while destroying the evidence
 * the project rests on. That is the exact failure this test exists to catch.
 */

const HERE = __dirname;

/** Every stage directory `objectiveNaive` and its helpers are forbidden to reach. */
const FORBIDDEN = [
  "@/lib/engine/scoring",
  "@/lib/engine/packing",
  "@/lib/engine/retrieve",
  "@/lib/engine/feasibility",
  "@/lib/engine/replan",
  "@/lib/engine/eval",
];

const NAIVE_SOURCES = [
  "objective-naive.ts",
  "components-naive.ts",
  "distance-naive.ts",
];

function source(file: string): string {
  return readFileSync(join(HERE, file), "utf8");
}

/** The file with its comments removed, so prose cannot satisfy a code check. */
function code(file: string): string {
  return source(file)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
}

function imports(file: string): string[] {
  const text = source(file);
  const found: string[] = [];
  const pattern = /(?:import|export)[^;'"]*from\s+["']([^"']+)["']/g;
  let match = pattern.exec(text);
  while (match !== null) {
    found.push(match[1]);
    match = pattern.exec(text);
  }
  const sideEffect = /(?:^|\n)\s*import\s+["']([^"']+)["']/g;
  let bare = sideEffect.exec(text);
  while (bare !== null) {
    found.push(bare[1]);
    bare = sideEffect.exec(text);
  }
  return found;
}

describe("the naive objective is independent", () => {
  it("has source files to check", () => {
    expect(NAIVE_SOURCES.length).toBeGreaterThan(0);
    for (const file of NAIVE_SOURCES) {
      expect(source(file).length).toBeGreaterThan(0);
    }
  });

  for (const file of NAIVE_SOURCES) {
    it(`${file} imports no other engine stage`, () => {
      for (const specifier of imports(file)) {
        for (const forbidden of FORBIDDEN) {
          expect(specifier.startsWith(forbidden)).toBe(false);
        }
      }
    });

    it(`${file} imports nothing outside contracts and itself`, () => {
      for (const specifier of imports(file)) {
        const allowed =
          specifier.startsWith("@/lib/engine/contracts") ||
          specifier.startsWith(".") ||
          specifier.startsWith("node:");
        expect(allowed).toBe(true);
      }
    });
  }

  it("does not import a sibling in the validation directory from the naive path", () => {
    // The naive path is the three files above and nothing else. `window.ts` and
    // friends re-use the same types, not the same arithmetic, so a sibling
    // import here would be a route back to shared code.
    for (const file of NAIVE_SOURCES) {
      for (const specifier of imports(file)) {
        if (specifier.startsWith("@/lib/engine/contracts")) continue;
        expect(specifier).toMatch(/^\.\/(distance-naive|components-naive)$/);
      }
    }
  });
});

describe("the repository house style holds in this directory", () => {
  const files = [
    ...NAIVE_SOURCES,
    "drift.ts",
    "window.ts",
    "budget.ts",
    "ladder.ts",
    "validate.ts",
    "index.ts",
  ];


  it("contains no em dash anywhere", () => {
    for (const file of files) {
      expect(source(file).includes("\u2014")).toBe(false);
    }
  });

  it("contains no emoji", () => {
    // Surrogate pairs are the whole of the emoji range, and the two dingbat
    // blocks that also live above U+2000. Written without the `u` flag so the
    // suite type-checks under the repo's es5 target.
    const emoji = /[\uD800-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u27BF]|[\uFE0F]|[\u2B00-\u2BFF]/;
    for (const file of files) {
      expect(emoji.test(source(file)), file).toBe(false);
    }
  });

  it("contains no character outside plain ASCII, so no glyph can hide in a comment", () => {
    for (const file of files) {
      const exotic = source(file).match(/[^\x09\x0A\x20-\x7E]/g);
      expect(exotic, `${file} has ${exotic ? exotic.length : 0} non-ASCII characters`).toBeNull();
    }
  });

  it("contains no city name, because the manifest owns those", () => {
    for (const file of files) {
      const text = source(file);
      expect(text.toLowerCase().indexOf("mumbai")).toBe(-1);
      expect(text.toLowerCase().indexOf("navi ")).toBe(-1);
    }
  });

  it("does not read the host clock or reach for randomness", () => {
    for (const file of NAIVE_SOURCES) {
      const text = source(file);
      expect(text).not.toContain("Date.now()");
      expect(text).not.toContain("Math.random()");
      expect(text).not.toContain("new Date()");
    }
  });
});

describe("DRIFT_TOLERANCE has exactly one definition", () => {
  it("appears as a literal only in drift.ts, comments excluded", () => {
    for (const file of [
      ...NAIVE_SOURCES,
      "window.ts",
      "budget.ts",
      "ladder.ts",
      "validate.ts",
    ]) {
      expect(code(file)).not.toMatch(/1e-6|0\.000001/);
    }
    expect(code("drift.ts")).toContain("1e-6");
  });

  it("is what every other file compares against, by import", () => {
    for (const file of ["validate.ts"]) {
      expect(source(file)).toContain("DRIFT_TOLERANCE");
    }
  });
});
