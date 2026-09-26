import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

import { DATASET_SIZE } from "@/components/ananta/records";

/** `1090` renders as `1,090`, and both spellings are copy. */
const grouped = (value: number): string => String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/**
 * The copy guard.
 *
 * `DESIGN-CONTRACT.md` bans em dashes and emoji, and lines 17 to 19 ban fake
 * metrics. The claims below are the ones this codebase actually shipped: a
 * hard-coded clock that ignored the traveller's time, two sentences that
 * asserted a reason the engine had not computed, and a computed value that was
 * built and then thrown away.
 *
 * This test reports. It does not fix. Every file it names belongs to another
 * session, and a guard that edits other people's files is a guard nobody trusts.
 */

const ROOT = process.cwd();
const SELF = resolve(ROOT, "lib/ui-guard/no-legacy-copy.test.ts");
const VIEW_DIRS = ["app", "components"].map((d) => resolve(ROOT, d));
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "coverage"]);

const EM_DASH = String.fromCharCode(0x2014);
/** No `u` flag: tsconfig targets es5, so a surrogate pair is matched directly. */
const EMOJI = /[\u2600-\u27BF\u2B00-\u2BFF\uFE0F]|[\uD83C-\uDBFF][\uDC00-\uDFFF]/;
const CLOCK_TEMPLATE = /\b\d{1,2}:\d{2}\s?(?:AM|PM|am|pm)\b/g;

/** Claims that assert a reason the engine never computed. */

/**
 * Copy-level hits on the tree right now.
 *
 * Empty, and that is the strongest state this list can be in. The three
 * fabricated claims the brief named were already gone when this test first ran:
 * `app/trips/page.tsx:41` and `:43` and `app/provider/page.tsx:52` are comments
 * recording that they were removed, so the guard reads them as prose about the
 * fix rather than as the claim itself.
 *
 * The list is load bearing in both directions. A hit that is not listed fails
 * the build immediately, and a listed hit that has been fixed also fails, so an
 * entry cannot outlive the fix it was written for. Do not add an entry to
 * silence a test. Delete the string.
 */
const KNOWN_HITS: readonly { at: string; rule: string; owner: string }[] = [];

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

const read = (file: string): string => readFileSync(file, "utf8");

/**
 * Blanks comments, preserving offsets. A comment saying "we removed the 2:15 PM
 * clock" must not read as the clock still being there.
 */
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

/**
 * The static parts of every string and template literal, with their offsets in
 * the comment stripped text.
 *
 * A `${...}` hole is code, not copy. `${when.slice(0, 10)}` contains a number
 * and reading it as a sentence flagged a date format as a hard-coded clock.
 * Offsets are kept so a hit can report a real line number, which a joined copy
 * of the literals would destroy.
 */
function literalSpans(text: string): { index: number; text: string }[] {
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

/** Every literal body concatenated, for whole-corpus pattern checks. */
const literalBodies = (text: string): string => literalSpans(text).map((s) => s.text).join("\n");

const lineAt = (text: string, index: number): number => text.slice(0, index).split("\n").length;

type Hit = { at: string; rule: string };

/** Claims that assert a reason the engine never computed. */
const CLAIMS_IN_COPY = [
  "Selected because it matches the current interest",
  "keeps the rest of the plan within the current area",
];
/** A claim that is an expression rather than a sentence, so it is read from code. */
const CLAIMS_IN_CODE = ["Math.max(counts"];

function scan(file: string): Hit[] {
  const raw = read(file);
  const code = stripComments(raw);
  const at = rel(file);
  const out: Hit[] = [];

  for (const span of literalSpans(raw)) {
    if (span.text.includes(EM_DASH)) out.push({ at: `${at}:${lineAt(code, span.index)}`, rule: "em dash in copy" });
    if (EMOJI.test(span.text)) out.push({ at: `${at}:${lineAt(code, span.index)}`, rule: "emoji in copy" });
    for (const claim of CLAIMS_IN_COPY) {
      if (span.text.includes(claim)) {
        out.push({ at: `${at}:${lineAt(code, span.index)}`, rule: "fabricated claim" });
      }
    }
  }

  for (const claim of CLAIMS_IN_CODE) {
    const index = code.indexOf(claim);
    if (index !== -1) out.push({ at: `${at}:${lineAt(code, index)}`, rule: "fabricated claim" });
  }

  if (file === SELF || /\.test\.tsx?$/.test(file)) return out;
  for (const m of code.matchAll(CLOCK_TEMPLATE)) {
    out.push({ at: `${at}:${lineAt(code, m.index)}`, rule: "hard-coded clock" });
  }
  return out;
}

describe("the copy guard", () => {
  const files = VIEW_DIRS.flatMap((d) => walk(d)).filter((f) => f !== SELF);
  const hits = files.flatMap(scan);

  it("is not passing on an empty tree", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it("finds no em dash, emoji, fabricated claim or hard-coded clock in the view layer", () => {
    expect(hits).toEqual([]);
  });

  it("still has exactly the copy hits it declared, so a fixed one cannot be forgotten", () => {
    expect(hits.map((h) => h.at).sort()).toEqual(KNOWN_HITS.map((k) => k.at).sort());
  });
});

describe("the copy guard can actually fail", () => {
  it("catches an em dash inside a string literal", () => {
    const fixture = `export const label = "open ${EM_DASH} closes at ten";`;
    const spans = literalSpans(fixture);
    expect(spans.some((s) => s.text.includes(EM_DASH))).toBe(true);
  });

  it("catches an emoji inside a string literal", () => {
    const fixture = `export const label = "${String.fromCodePoint(0x1f9ea)} fresh";`;
    expect(literalSpans(fixture).some((s) => EMOJI.test(s.text))).toBe(true);
  });

  it("does not read a comment as copy", () => {
    const fixture = [
      "/**",
      " * the old copy said open 2:15 PM regardless of anything.",
      ` * an em dash ${EM_DASH} like this one, in a comment.`,
      " */",
      "export const label = 'all clocks come from ctx.now';",
    ].join("\n");
    expect(literalBodies(fixture)).not.toContain(EM_DASH);
    expect(CLOCK_TEMPLATE.test(stripComments(fixture))).toBe(false);
  });

  it("catches a hard-coded clock in a component", () => {
    expect(CLOCK_TEMPLATE.test(stripComments('export const when = "2:15 PM";'))).toBe(true);
    expect(CLOCK_TEMPLATE.test(stripComments('export const when = "19:15";'))).toBe(false);
  });

  it("catches both fabricated sentences in copy", () => {
    for (const claim of CLAIMS_IN_COPY) {
      const fixture = `const why = "${claim}";`;
      expect(literalSpans(fixture).some((s) => s.text.includes(claim)), claim).toBe(true);
    }
  });

  it("catches the discarded-computation claim in code, not in copy", () => {
    expect(stripComments("const label = Math.max(counts, 3);").includes(CLAIMS_IN_CODE[0])).toBe(true);
  });

  it("keeps a real line number, so the report is actionable", () => {
    const fixture = ["// pad", "// pad", 'const why = "Selected because it matches the current interest";'].join("\n");
    const span = literalSpans(fixture)[0];
    expect(lineAt(stripComments(fixture), span.index)).toBe(3);
  });

  it("does not read a template interpolation as copy", () => {
    const fixture = 'const when = ` as of ${place.availability.soldOutAt.slice(0, 10)}`;';
    expect(CLOCK_TEMPLATE.test(literalBodies(fixture))).toBe(false);
    expect(literalBodies(fixture)).not.toContain("slice");
  });

  it("still reads the static text around an interpolation", () => {
    const fixture = `const line = \`${grouped(DATASET_SIZE)} local places, updated \${when}\`;`;
    expect(literalBodies(fixture)).toContain(`${grouped(DATASET_SIZE)} local places`);
  });
});
