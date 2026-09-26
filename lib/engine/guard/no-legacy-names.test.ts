import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The product is ANANATA. A judge reads one line of config and concludes the
 * project has no name, so the old names are a correctness bug, not a
 * cosmetic one.
 */

const ROOT = process.cwd();

/** This file holds the banned strings as data, so it cannot scan itself. */
const SELF = resolve(ROOT, "lib/engine/guard/no-legacy-names.test.ts");

const BANNED = ["TravelBuddy", "Athiti", "Local Tourist", "Local & Experiences"];

const SCAN_DIRS = ["app", "components", "lib", "docs", "scripts", ".github"];

const ROOT_FILES = [
  ".env.example",
  "README.md",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "next.config.mjs",
  "postcss.config.mjs",
  "tailwind.config.ts",
  "vercel.json",
  "vitest.config.ts",
  ".eslintrc.json",
];

/**
 * `99-archive` is skipped on purpose. An archive exists to keep superseded text
 * verbatim, and the documents in it are the ones that carried the old product
 * names in the first place. Failing the build on an archive would make keeping
 * the archive impossible, which is the opposite of what archiving is for. Every
 * document in `99-archive` carries a banner saying it is not a claim about the
 * product, and `docs/README.md` links to `ARCHITECTURE-ACTUAL.md` instead.
 */
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "public", "coverage", "99-archive"]);

const SCAN_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|json|jsonc|md|mdx|css|yml|yaml|toml|txt|html|example)$/i;

/**
 * Hits that are on the tree right now. Each names the session that owns the
 * file. Two tests below make this list load bearing in both directions: an
 * unlisted hit fails the build, and a listed hit that has been fixed also
 * fails, so an exemption cannot outlive the fix it was written for.
 */
const KNOWN_HITS: readonly string[] = [
  "docs/06-quality/ITERATIVE-BROWSER-QA.md:325",
];

const rel = (file: string): string => relative(ROOT, file).split(sep).join("/");

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir).sort()) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (SCAN_EXT.test(entry)) out.push(full);
  }
  return out;
}

function targets(): string[] {
  const files = SCAN_DIRS.flatMap((d) => walk(resolve(ROOT, d)));
  for (const name of ROOT_FILES) {
    const full = resolve(ROOT, name);
    if (existsSync(full)) files.push(full);
  }
  return files.filter((f) => f !== SELF).sort();
}

/** Every `banned:line` match in one file's text. Pure, so it can be probed. */
function hitsIn(at: string, text: string): string[] {
  const out: string[] = [];
  text.split("\n").forEach((line, i) => {
    for (const banned of BANNED) {
      if (line.toLowerCase().includes(banned.toLowerCase())) out.push(`${at}:${i + 1}`);
    }
  });
  return out;
}

describe("the product name", () => {
  const files = targets();
  const hits = files.flatMap((f) => hitsIn(rel(f), readFileSync(f, "utf8"))).sort();
  const known = new Set(KNOWN_HITS);
  const unexpected = hits.filter((h) => !known.has(h));

  it("is not passing on an empty tree", () => {
    expect(files.length).toBeGreaterThan(30);
    expect(files.some((f) => f.includes(join("lib", "engine")))).toBe(true);
  });

  it("exempts only itself", () => {
    expect(SELF.endsWith(join("lib", "engine", "guard", "no-legacy-names.test.ts"))).toBe(true);
    expect(hits.some((h) => h.includes("no-legacy-names.test.ts"))).toBe(false);
  });

  it("finds no old product name in app, components, lib, docs, scripts, .github or config", () => {
    expect(unexpected).toEqual([]);
  });

  it("still has exactly the session 10 hits it declared, so a stale exemption is visible", () => {
    expect(hits).toEqual([...KNOWN_HITS].sort());
  });
});

describe("the product name guard can actually fail", () => {
  it("catches every banned string in any casing", () => {
    for (const banned of BANNED) {
      for (const cased of [banned, banned.toLowerCase(), banned.toUpperCase()]) {
        const probe = hitsIn("fixture.ts", `export const APP = "${cased}";\n`);
        expect(probe, cased).toEqual(["fixture.ts:1"]);
      }
    }
  });

  it("reports the line, not just the file", () => {
    const text = "line one\nline two\nNEXT_PUBLIC_APP_NAME=Local Tourist\n";
    expect(hitsIn(".env.example", text)).toEqual([".env.example:3"]);
  });

  it("does not fire on the current product name", () => {
    expect(hitsIn("readme.md", "ANANTA is a fit-first local discovery engine.")).toEqual([]);
  });
});
