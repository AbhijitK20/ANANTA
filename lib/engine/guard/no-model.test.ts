import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The credibility anchor.
 *
 * `MASTERPLAN.md` section 8, principle 1: no model decides. It proposes; the
 * engine disposes. A claim in a readme is not an invariant. This file is.
 *
 * If this test ever fails, the fix is to delete the model call, not to relax
 * the test.
 */

const ROOT = process.cwd();
const ENGINE = resolve(ROOT, "lib/engine");
const LIB = resolve(ROOT, "lib");

/** This file quotes every banned string as data, so it cannot scan itself. */
const SELF = resolve(ROOT, "lib/engine/guard/no-model.test.ts");

/** The one file allowed to reach for a clock or a dice, for its injected rng. */
const RNG_OWNER = "scoring/thompson.ts";

const BANNED_EXACT = new Set([
  "openai",
  "anthropic",
  "langchain",
  "llamaindex",
  "ollama",
  "ai",
  "mistralai",
  "replicate",
]);

const BANNED_PREFIX = [
  "@anthropic-ai/",
  "@ai-sdk/",
  "@google/generative-ai",
  "@google/genai",
  "@langchain/",
  "@huggingface/inference",
];

const BANNED_SHAPE = /^(ai|llm|model)/i;

/** Catches the family the exact list cannot enumerate, such as vendor-sdk names. */
const BANNED_SHAPE_SUFFIX = /(^|[-/])(ai|sdk|llm|gpt)([-/]|$)/i;

/** Routing only. The engine is otherwise pure and the eval suite has no network. */
const FETCH_ALLOWLIST = ["router.project-osrm.org", "routing.openstreetmap.de"];

type Violation = { file: string; line: number; rule: string; detail: string };

const rel = (file: string): string => relative(ROOT, file).split(sep).join("/");

/** Every `.ts` / `.tsx` under `dir`, recursively. `node:fs` only, no glob dep. */
function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir).sort()) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const lineAt = (text: string, index: number): number => text.slice(0, index).split("\n").length;

/** Import, re-export and require specifiers. No TypeScript compiler API. */
function specifiers(text: string): { spec: string; index: number }[] {
  const found: { spec: string; index: number }[] = [];
  const patterns = [
    /\bfrom\s*["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\bimport\s+["']([^"']+)["']/g,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) found.push({ spec: m[1], index: m.index });
  }
  return found;
}

/**
 * Blanks out comments, and optionally the body of every string literal, while
 * preserving every newline and every character offset, so line numbers in a
 * failure still point at the right source line. String aware, because a URL in
 * a string literal is full of `//`.
 *
 * Blanking string bodies is what lets a test assert `not.toContain("Date.now()")`
 * without that assertion failing the guard it is asserting. Blanking comments
 * is what lets a file explain why it avoids `Math.random()` out loud.
 */
function blank(text: string, blankStrings: boolean): string {
  const out = text.split("");
  let i = 0;
  let quote: string | null = null;
  const space = (k: number) => {
    if (text[k] !== "\n") out[k] = " ";
  };
  while (i < text.length) {
    const c = text[i];
    const next = text[i + 1];
    if (quote) {
      if (c === "\\") {
        space(i);
        space(i + 1);
        i += 2;
        continue;
      }
      if (c === quote) {
        quote = null;
        i += 1;
        continue;
      }
      if (blankStrings) space(i);
      i += 1;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      quote = c;
      i += 1;
      continue;
    }
    if (c === "/" && next === "/") {
      while (i < text.length && text[i] !== "\n") {
        out[i] = " ";
        i += 1;
      }
      continue;
    }
    if (c === "/" && next === "*") {
      out[i] = " ";
      out[i + 1] = " ";
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) {
        space(i);
        i += 1;
      }
      if (i < text.length) {
        out[i] = " ";
        out[i + 1] = " ";
        i += 2;
      }
      continue;
    }
    i += 1;
  }
  return out.join("");
}

const stripComments = (text: string): string => blank(text, false);
const stripCommentsAndStrings = (text: string): string => blank(text, true);

const isBannedModelImport = (spec: string): boolean =>
  BANNED_EXACT.has(spec) ||
  BANNED_PREFIX.some((p) => spec.startsWith(p) || spec === p) ||
  BANNED_SHAPE.test(spec) ||
  BANNED_SHAPE_SUFFIX.test(spec);

/**
 * First argument of a `fetch(` or `https.request(` call site, as a URL when it
 * is a literal and as `null` when it is not resolvable. Fail closed: a computed
 * URL is a violation, because a computed URL cannot be shown to be allowlisted.
 */
function firstCallUrl(text: string, at: number): { url: string | null; end: number } {
  let i = at;
  while (i < text.length && /\s/.test(text[i])) i += 1;
  const quote = text[i];
  if (quote !== '"' && quote !== "'" && quote !== "`") return { url: null, end: i };
  let j = i + 1;
  for (; j < text.length; j += 1) {
    if (text[j] === "\\") {
      j += 1;
      continue;
    }
    if (text[j] === quote) break;
    if (quote === "`" && text[j] === "$" && text[j + 1] === "{") return { url: null, end: j };
  }
  return { url: text.slice(i + 1, j), end: j };
}

const hostOf = (url: string): string | null => {
  const m = /^https?:\/\/([^/?#"'`]+)/.exec(url);
  return m ? m[1].toLowerCase() : null;
};

const CALL = /\b(?:fetch|https\s*\.\s*request)\s*\(/g;

/** Every rule, applied to one file's text. `scope` is the caller's claim about where it lives. */
function analyse(file: string, source: string, scope: "engine" | "lib" = "lib"): Violation[] {
  const out: Violation[] = [];
  const where = rel(file);
  const text = stripComments(source);
  /** Purity is read from code only: a string is a claim about the token, not a use. */
  const code = stripCommentsAndStrings(source);
  const inEngine = scope === "engine";
  const rngOwner = rel(file).endsWith(RNG_OWNER);

  for (const { spec, index } of specifiers(text)) {
    if (!isBannedModelImport(spec)) continue;
out.push({
      file: where,
      line: lineAt(text, index),
      rule: "no model sdk",
      detail:
        `imports "${spec}". MASTERPLAN.md section 8 principle 1: no model decides, ` +
        `it proposes and the engine disposes. Delete the call and put the decision in the objective.`,
    });
  }

  if (inEngine && !rngOwner) {
    let m: RegExpExecArray | null;
    CALL.lastIndex = 0;
    while ((m = CALL.exec(text)) !== null) {
      const { url, end } = firstCallUrl(text, m.index + m[0].length);
      const host = url === null ? null : hostOf(url);
      if (host && FETCH_ALLOWLIST.includes(host)) continue;
      out.push({
        file: where,
        line: lineAt(text, m.index),
        rule: "no unfenced network",
        detail:
          host === null
            ? `network call to a computed url, which cannot be shown to be on the allowlist ` +
              `(${FETCH_ALLOWLIST.join(", ")}). MASTERPLAN.md section 8 principle 5: the eval suite passes with no network.`
            : `network call to "${host}", which is not routing. The engine may reach only ` +
              `${FETCH_ALLOWLIST.join(" and ")}.`,
      });
      CALL.lastIndex = Math.max(CALL.lastIndex, end);
    }

    const impure: { re: RegExp; what: string }[] = [
      { re: /\bDate\s*\.\s*now\b/g, what: "Date.now()" },
      { re: /\bnew\s+Date\s*\(\s*\)/g, what: "new Date() with no argument" },
      { re: /\bMath\s*\.\s*random\b/g, what: "Math.random()" },
      { re: /\bcrypto\s*\.\s*getRandomValues\b/g, what: "crypto.getRandomValues()" },
    ];
    for (const { re, what } of impure) {
      const hit = re.exec(code);
      if (!hit) continue;
      out.push({
        file: where,
        line: lineAt(text, hit.index),
        rule: "impure clock or dice",
        detail:
          `${what} in the engine. The objective must be a pure function of (stops, ctx, weights); ` +
          `read ctx.now and take the rng as an argument. See lib/engine/objective-spec.md section 2.`,
      });
    }
  }

  return out;
}

const read = (file: string): string => readFileSync(file, "utf8");

/**
 * Violations that are on the tree right now, each naming the session that owns
 * the file. An unlisted violation fails the build, and so does a listed one
 * that has been fixed, so an entry cannot outlive the fix it was written for.
 * Do not add an entry to silence a test: remove the call.
 */
const KNOWN_HITS: readonly string[] = [];

describe("the no-model guard", () => {
  const engineFiles = walk(ENGINE).filter((f) => f !== SELF);
  const libFiles = walk(LIB).filter((f) => f !== SELF);
  const violations = engineFiles.flatMap((f) => analyse(f, read(f), "engine"));
  const known = new Set(KNOWN_HITS);

  it("is not passing on an empty tree", () => {
    expect(engineFiles.length, "lib/engine has no TypeScript in it").toBeGreaterThan(0);
    expect(libFiles.length, "lib has no TypeScript in it").toBeGreaterThan(20);
    expect(existsSync(join(ENGINE, "contracts"))).toBe(true);
    expect(walk(join(ENGINE, "contracts")).length).toBeGreaterThan(0);
  });

  it("exempts exactly one file, itself, so the exemption cannot quietly widen", () => {
    expect(SELF.endsWith(join("lib", "engine", "guard", "no-model.test.ts"))).toBe(true);
    expect(RNG_OWNER).toBe("scoring/thompson.ts");
  });

  it("finds no model sdk anywhere in lib/", () => {
    const hits = libFiles.flatMap((f) =>
      analyse(f, read(f), "lib").filter((v) => v.rule === "no model sdk"),
    );
    expect(hits).toEqual([]);
  });

  it("finds no model sdk, no unroutable network and no impure clock in lib/engine/", () => {
    expect(violations.filter((v) => !known.has(`${v.file}:${v.line}`))).toEqual([]);
  });

  it("still has exactly the engine violations it declared, so a stale entry is visible", () => {
    expect(violations.map((v) => `${v.file}:${v.line}`).sort()).toEqual([...KNOWN_HITS].sort());
  });
});

describe("the no-model guard can actually fail", () => {
  it("catches a model sdk import", () => {
    const fixture = 'import OpenAI from "openai";\nconst c = new OpenAI({ apiKey: "k" });\n';
    const hits = analyse(resolve(ROOT, "fixture-a.ts"), fixture, "engine");
    expect(hits).toHaveLength(1);
    expect(hits[0].rule).toBe("no model sdk");
    expect(hits[0].line).toBe(1);
    expect(hits[0].detail).toContain("openai");
  });

  it("catches every scoped sdk family, not just one spelling", () => {
    const families = [
      "@anthropic-ai/sdk",
      "anthropic",
      "@google/generative-ai",
      "@google/genai",
      "langchain",
      "@langchain/core/runnables",
      "llamaindex",
      "ollama",
      "ai",
      "@ai-sdk/openai",
      "cohere-ai",
      "groq-sdk",
      "mistralai",
      "replicate",
      "@huggingface/inference",
      "llm-router",
      "modelRegistry",
    ];
    const missed = families.filter(
      (pkg) => analyse(resolve(ROOT, "fixture-b.ts"), `import x from "${pkg}";`, "engine").length === 0,
    );
    expect(missed).toEqual([]);
  });

  it("catches a network call that is not routing", () => {
    const fixture = 'const r = await fetch("https://api.openai.com/v1/chat");\n';
    const hits = analyse(resolve(ROOT, "fixture-c.ts"), fixture, "engine");
    expect(hits.map((h) => h.rule)).toEqual(["no unfenced network"]);
    expect(hits[0].detail).toContain("api.openai.com");
  });

  it("catches a relative fetch, because the engine must be pure", () => {
    const fixture = 'const r = await fetch("/api/route");\n';
    const hits = analyse(resolve(ROOT, "fixture-d.ts"), fixture, "engine");
    expect(hits.map((h) => h.rule)).toEqual(["no unfenced network"]);
  });

  it("catches a computed fetch url rather than waving it through", () => {
    const fixture = "const r = await fetch(`${base}/route`);\n";
    const hits = analyse(resolve(ROOT, "fixture-e.ts"), fixture, "engine");
    expect(hits.map((h) => h.rule)).toEqual(["no unfenced network"]);
  });

  it("catches every impure clock and dice call", () => {
    const impure = [
      "const t = Date.now();",
      "const d = new Date();",
      "const x = Math.random();",
      "const b = new Uint8Array(4); crypto.getRandomValues(b);",
    ];
    for (const line of impure) {
      const hits = analyse(resolve(ROOT, "fixture-f.ts"), line, "engine");
      expect(hits.map((h) => h.rule), line).toEqual(["impure clock or dice"]);
    }
  });

  it("does not flag a routed call or a date built from an injected now", () => {
    const clean = [
      'const r = await fetch("https://router.project-osrm.org/route/v1/driving/13,19;13,19?overview=false");',
      'const r = await fetch("https://routing.openstreetmap.de/route/v1/driving/13,19;13,19");',
      "const d = new Date(ctx.now);",
      "const hour = new Date(ctx.now).getHours();",
    ];
    for (const line of clean) {
      expect(analyse(resolve(ROOT, "fixture-g.ts"), line, "engine"), line).toEqual([]);
    }
  });

  it("honours the injected rng exemption in exactly one file", () => {
    const line = "const draw = () => rng() ?? Math.random();";
    const owner = resolve(ROOT, "lib/engine/scoring/thompson.ts");
    expect(analyse(owner, line, "engine")).toEqual([]);
    expect(analyse(resolve(ROOT, "lib/engine/scoring/components.ts"), line, "engine").map((h) => h.rule)).toEqual([
      "impure clock or dice",
    ]);
  });

  it("reads a comment saying why the engine avoids something as a comment, not as code", () => {
    const prose = [
      "/**",
      " * Math.random() would make the eval report irreproducible.",
      " */",
      "export const draw = (rng: () => number) => rng();",
    ].join("\n");
    expect(analyse(resolve(ROOT, "lib/engine/packing/lahc.ts"), prose, "engine")).toEqual([]);
  });

  it("still catches live impurity written just after a comment", () => {
    const mixed = ["// deterministic please", "const t = Date.now();"].join("\n");
    const hits = analyse(resolve(ROOT, "lib/engine/packing/two-opt.ts"), mixed, "engine");
    expect(hits.map((h) => h.rule)).toEqual(["impure clock or dice"]);
    expect(hits[0].line).toBe(2);
  });

  it("does not mistake a protocol slashes in a url for a comment", () => {
    const line = 'const r = await fetch("https://router.project-osrm.org/route/v1/driving/13,19;13,19");';
    expect(analyse(resolve(ROOT, "lib/engine/retrieve/isochrone.ts"), line, "engine")).toEqual([]);
  });

  it("lets another session's own purity test exist, since asserting a token is not using it", () => {
    const peer = [
      'it("does not read the host clock", () => {',
      '  expect(text).not.toContain("Date.now()");',
      '  expect(text).not.toContain("Math.random()");',
      '  expect(text).not.toContain("new Date()");',
      "});",
    ].join("\n");
    expect(analyse(resolve(ROOT, "lib/engine/validation/independence.test.ts"), peer, "engine")).toEqual([]);
  });

  it("still catches a model import and a model fetch inside a test file", () => {
    const peer = [
      'import OpenAI from "openai";',
      'it("smoke", async () => {',
      '  const r = await fetch("https://api.openai.com/v1/models");',
      '  expect(r.status).toBe(200);',
      "});",
    ].join("\n");
    const hits = analyse(resolve(ROOT, "lib/engine/validation/independence.test.ts"), peer, "engine");
    expect(hits.map((h) => h.rule).sort()).toEqual(["no model sdk", "no unfenced network"]);
  });
});
