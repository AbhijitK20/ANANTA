import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

import {
  CURATED_CATEGORY_COUNT,
  DATASET_SIZE,
  HAND_WRITTEN,
  OSM_MATCHED,
} from "@/components/ananta/records";

/**
 * No hard-coded dataset number in the view layer.
 *
 * `DESIGN-CONTRACT.md` lines 17 to 19 ban fake metrics, and the cheapest fake
 * metric in the world is a real number typed into a component instead of
 * imported. `components/ananta/records.ts` is the only place a count may come
 * from.
 *
 * A bare number is not the defect. `700` is a price, `2026` is a year and
 * `1249` is a phone number. The defect is a dataset count sitting in a sentence
 * that will not move when the data moves, so this test flags a literal that is
 * both a known count value and next to a word that describes a count. Prices,
 * years and phone numbers pass.
 *
 * It reports. Every file it names belongs to another session.
 */

const ROOT = process.cwd();
const SELF = resolve(ROOT, "lib/ui-guard/hardcoded-numbers.test.ts");
const SOURCE_OF_TRUTH = [
  "components/ananta/records.ts",
  "lib/data/ananta/records.ts",
  "lib/data/ananta/curated",
  "lib/data/dataset",
  "lib/data/factory",
  "lib/data",
  "lib/seed.ts",
  "lib/engine",
  "lib/eval",
  "lib/ui-guard",
];
const VIEW_DIRS = ["app", "components"].map((d) => resolve(ROOT, d));
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "coverage"]);

/**
 * The counts the view layer is forbidden to type: the four live stats read from
 * the data, plus the figures earlier revisions of this repo shipped. A pasted
 * old number is the exact bug, so it is listed rather than pattern matched.
 */
const STAT_VALUES: readonly number[] = [
  DATASET_SIZE,
  HAND_WRITTEN,
  OSM_MATCHED,
  CURATED_CATEGORY_COUNT,
  1107,
  1104,
  1084,
  1064,
  391,
];

/** A noun that makes the number next to it a claim about the catalogue. */
const COUNT_WORD =
  /\b(places?|records?|spots?|results?|entries|things|options?|stops?|listings?|categories|category|hand[- ]written|curated|matched|listed|catalogue|catalog|of them|of these|total)\b/i;

const grouped = (value: number): string => String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

const rel = (file: string): string => relative(ROOT, file).split(sep).join("/");

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir).sort()) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

function stripComments(text: string): string {
  const out = text.split("");
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
      if (i < text.length) out[i] = out[i + 1] = " ";
      i += 2;
      continue;
    }
    i += 1;
  }
  return out.join("");
}

const lineAt = (text: string, index: number): number => text.slice(0, index).split("\n").length;

/** Every static part of every literal, joined, for whole-corpus pattern checks. */
const literalBodies = (text: string): string[] => copyLiterals(text).map((s) => s.text);

/**
 * Only the static parts of string literals, because that is where a claim to a
 * traveller lands.
 *
 * A `${...}` hole is code, not copy. `${place.availability.soldOutAt.slice(0, 10)}`
 * contains a number and a noun, and reading it as a sentence flagged a date
 * format as a hard-coded dataset count. Offsets are kept so a hit reports a
 * real line number.
 */
function copyLiterals(text: string): { index: number; text: string }[] {
  const code = stripComments(text);
  const spans: { index: number; text: string }[] = [];
  const push = (index: number, body: string) => {
    if (body.length) spans.push({ index, text: body });
  };
  let i = 0;
  while (i < code.length) {
    const c = code[i];
    if (c === '"' || c === "'") {
      const start = i + 1;
      let j = start;
      while (j < code.length && code[j] !== c) {
        if (code[j] === "\\") j += 1;
        j += 1;
      }
      push(start, code.slice(start, j));
      i = j + 1;
      continue;
    }
    if (c === "`") {
      let segment = i + 1;
      let j = i + 1;
      while (j < code.length && code[j] !== "`") {
        if (code[j] === "\\") {
          j += 2;
          continue;
        }
        if (code[j] === "$" && code[j + 1] === "{") {
          push(segment, code.slice(segment, j));
          let depth = 1;
          j += 2;
          while (j < code.length && depth > 0) {
            if (code[j] === "{") depth += 1;
            else if (code[j] === "}") depth -= 1;
            j += 1;
          }
          segment = j;
          continue;
        }
        j += 1;
      }
      push(segment, code.slice(segment, j));
      i = j + 1;
      continue;
    }
    i += 1;
  }
  return spans;
}

function isSourceOfTruth(file: string): boolean {
  const at = rel(file);
  return SOURCE_OF_TRUTH.some(
    (allowed) => at === allowed || at.startsWith(`${allowed}/`) || at.startsWith(allowed),
  );
}

/** The stat values as they may appear typed: `1090` and `1,090`. */
function typedStatValues(): string[] {
  return STAT_VALUES.flatMap((v) => [String(v), grouped(v)]);
}

/** A typed count: a known value with a count word in the same literal. */
function typedCounts(span: string): string[] {
  if (!COUNT_WORD.test(span)) return [];
  return typedStatValues().filter((value) =>
    new RegExp(`(?<![\\d,.])${value.replace(",", ",")}(?![\\d,.])`).test(span),
  );
}

type Hit = { at: string; value: string };

function scan(file: string): Hit[] {
  if (isSourceOfTruth(file) || /\.test\.tsx?$/.test(file)) return [];
  const raw = readFileSync(file, "utf8");
  const code = stripComments(raw);
  const out: Hit[] = [];
  for (const span of copyLiterals(raw)) {
    for (const value of typedCounts(span.text)) {
      out.push({ at: `${rel(file)}:${lineAt(code, span.index)}`, value });
    }
  }
  return out;
}

describe("no hard-coded dataset number", () => {
  const files = VIEW_DIRS.flatMap((d) => walk(d)).filter((f) => f !== SELF);
  const hits = files.flatMap(scan);

  it("is not passing on an empty tree", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it("reads the live counts from the data rather than hard-coding them too", () => {
    expect(STAT_VALUES).toContain(DATASET_SIZE);
    expect(DATASET_SIZE).toBeGreaterThan(1000);
    expect(HAND_WRITTEN).toBeGreaterThan(0);
  });

  it("exempts records.ts, the only permitted source of a count", () => {
    expect(isSourceOfTruth(resolve(ROOT, "components/ananta/records.ts"))).toBe(true);
    expect(isSourceOfTruth(resolve(ROOT, "lib/data/ananta/records.ts"))).toBe(true);
    expect(isSourceOfTruth(resolve(ROOT, "app/page.tsx"))).toBe(false);
  });

  it("finds no dataset count typed into a view layer string", () => {
    expect(hits).toEqual([]);
  });
});

describe("the hard-coded number guard can actually fail", () => {
  it("catches the dataset size typed into a sentence", () => {
    expect(typedCounts(`${grouped(DATASET_SIZE)} local places`)).toContain(grouped(DATASET_SIZE));
    expect(typedCounts(`${DATASET_SIZE} local places`)).toContain(String(DATASET_SIZE));
  });

  it("catches a count of hand-written records", () => {
    expect(typedCounts(`${HAND_WRITTEN} have hand-written facts`)).toContain(String(HAND_WRITTEN));
  });

  it("catches a stale figure from an earlier revision", () => {
    expect(typedCounts("1107 local places")).toContain("1107");
    expect(typedCounts("391 spots in range")).toContain("391");
  });

  it("does not flag a price, a year or a phone number", () => {
    expect(typedCounts("Costs about 700 for 4 people")).toEqual([]);
    expect(typedCounts("Updated 2026-09-08")).toEqual([]);
    expect(typedCounts("Call 1249 for the table")).toEqual([]);
  });

  it("does not flag a count word with no known value in it", () => {
    expect(typedCounts("12 places, sorted by distance")).toEqual([]);
  });

  it("does not flag a number that came from a variable", () => {
    expect(typedCounts("${DATASET_SIZE} local places")).toEqual([]);
  });

  it("does not read a template interpolation as copy", () => {
    const fixture = "const when = ` as of ${place.availability.soldOutAt.slice(0, 10)}`;";
    expect(typedCounts(literalBodies(fixture).join(" "))).toEqual([]);
  });

  it("still reads the static text around an interpolation", () => {
    const fixture = `const line = \`${grouped(DATASET_SIZE)} local places, updated \${when}\`;`;
    expect(typedCounts(literalBodies(fixture).join(" "))).toContain(grouped(DATASET_SIZE));
  });
});
