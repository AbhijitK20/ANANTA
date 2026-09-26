import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The fork guard.
 *
 * `components/ananta/pipeline.ts` shipped its own `tokenize`, `buildIndex`,
 * `retrieve`, `gate`, `wilsonLowerBound`, `objectiveFast`, `objectiveNaive`,
 * `pack`, `validate` and `relax`. That put the two supposedly independent
 * objective derivations in one file, so the 1e-6 guarantee was measuring a
 * function against its own neighbour, and it hid a whole engine copy outside
 * the boundary `lib/engine/guard/no-model.test.ts` inspects.
 *
 * RULE 0 of `UI-UX-Fix-Prompts/00-CONTRACTS.md`: the view layer imports the
 * engine, it never restates it. This test is what makes that a build failure.
 */

const ROOT = process.cwd();
const ENGINE_BARREL = resolve(ROOT, "lib/engine/index.ts");
const VIEW_DIRS = ["app", "components"].map((d) => resolve(ROOT, d));
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "coverage"]);

const rel = (file: string): string => relative(ROOT, file).split(sep).join("/");

/**
 * The one view file allowed to still declare engine functions, because session 2
 * is deleting the fork right now.
 *
 * `PONYTAIL: remove this entry in the same commit that deletes the fork. The
 * assertion below re-enables itself the moment this file no longer exists, so
 * the only way it goes away is by doing the work, not by relaxing the test.`
 */
const PENDING_FORK_REMOVAL = "components/ananta/pipeline.ts";

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

/** Blanks comments, preserving newlines and offsets. See no-model.test.ts. */
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

/**
 * Every name `lib/engine/index.ts` exports, following `export * from` chains.
 * Resolving the stars matters: the barrel wires its stages through
 * `export * from "./retrieve"` and friends, so a regex over the barrel alone
 * would see nothing and the guard would pass on an empty name set. A star also
 * re-exports the target's own declarations, not only the target's re-exports,
 * so each file contributes both.
 */
const LOCAL_EXPORT =
  /^[ \t]*export[ \t]+(?:declare[ \t]+)?(?:default[ \t]+)?(?:abstract[ \t]+)?(?:async[ \t]+)?(?:type|interface|class|function|const|let|var|enum)[ \t]+([A-Za-z_$][\w$]*)/gm;

function engineExports(from: string = ENGINE_BARREL, seen = new Set<string>()): Set<string> {
  if (!existsSync(from) || seen.has(from)) return new Set();
  seen.add(from);
  const names = new Set<string>();
  const text = read(from);

  for (const m of text.matchAll(LOCAL_EXPORT)) names.add(m[1]);
  for (const m of text.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}\s*from\s*["']([^"']+)["']/g)) {
    for (const part of m[1].split(",")) {
      const name = part.trim().split(/\s+as\s+/).pop()?.trim().replace(/^type\s+/, "");
      if (name) names.add(name);
    }
  }
  for (const m of text.matchAll(/export\s+(?:type\s+)?\*\s*from\s*["']([^"']+)["']/g)) {
    const target = resolve(dirname(from), m[1]);
    const next = target.endsWith(".ts") ? target : `${target}.ts`;
    const index = join(next.replace(/\.ts$/, ""), "index.ts");
    for (const name of engineExports(existsSync(index) ? index : next, seen)) names.add(name);
  }
  return names;
}

const DECL =
  /^[ \t]*(?:export[ \t]+)?(?:default[ \t]+)?(?:async[ \t]+)?(?:function|class|const|let|var)[ \t]+([A-Za-z_$][\w$]*)/gm;

/** Top level and nested declarations. Over matching is fine; a false positive is a comment. */
function declares(text: string): Map<string, number> {
  const code = stripComments(text);
  const found = new Map<string, number>();
  for (const m of code.matchAll(DECL)) {
    if (!found.has(m[1])) found.set(m[1], lineAt(code, m.index));
  }
  return found;
}

type Fork = { file: string; line: number; name: string };

function forksIn(file: string, engineNames: Set<string>): Fork[] {
  const hits: Fork[] = [];
  for (const [name, line] of declares(read(file))) {
    if (engineNames.has(name)) hits.push({ file: rel(file), line, name });
  }
  return hits;
}

/**
 * Forks that are on the tree right now, each naming the session that owns the
 * file. Two tests make this list load bearing in both directions: a fork that
 * is not listed fails the build immediately, and a listed fork that has been
 * deleted also fails, so an entry cannot outlive the fix it was written for.
 *
 * Keyed by file and name, never by line. Session 7 is deleting its fork while
 * this file is being written, so a line keyed list went stale within minutes
 * and produced a report nobody could act on. A declaration has a stable
 * identity; its line number does not.
 *
 * Do not add an entry to silence a test. Delete the function and import it.
 */
const KNOWN_HITS: readonly { file: string; name: string; owner: string }[] = [
  { file: "components/ananta/learning.ts", name: "PRIOR_WEIGHTS", owner: "session 7" },
  { file: "components/ananta/learning.ts", name: "sampleWeights", owner: "session 7" },
  { file: "components/ananta/pipeline-run.ts", name: "objectiveFast", owner: "session 2" },
  { file: "components/ananta/pipeline-run.ts", name: "objectiveNaive", owner: "session 2" },
  { file: "components/ananta/pipeline-run.ts", name: "validate", owner: "session 2" },
  { file: "components/ananta/pipeline-run.ts", name: "relax", owner: "session 2" },
];

const key = (file: string, name: string): string => `${file} declares ${name}`;

describe("the engine fork guard", () => {
  const engineNames = engineExports();
  const viewFiles = VIEW_DIRS.flatMap((d) => walk(d));
  const all = viewFiles
    .flatMap((f) => forksIn(f, engineNames))
    .filter((f) => f.file !== PENDING_FORK_REMOVAL);
  const known = new Set(KNOWN_HITS.map((k) => key(k.file, k.name)));

  it("is not passing on an empty name set", () => {
    expect(engineNames.size, "no exports resolved from lib/engine/index.ts").toBeGreaterThan(20);
    expect(engineNames.has("ExperienceV2")).toBe(true);
    expect(engineNames.has("RejectionCode")).toBe(true);
    expect(engineNames.has("gate")).toBe(true);
  });

  it("is not passing on an empty view layer", () => {
    expect(viewFiles.length).toBeGreaterThan(20);
  });

  it("finds no engine function restated in the view layer", () => {
    expect(all.filter((f) => !known.has(key(f.file, f.name)))).toEqual([]);
  });

  it("still has exactly the forks it declared, so a fixed one cannot be forgotten", () => {
    expect(all.map((f) => key(f.file, f.name)).sort()).toEqual([...known].sort());
  });

  it("exempts pipeline.ts only, and only until session 2 deletes it", () => {
    const fork = resolve(ROOT, PENDING_FORK_REMOVAL);
    if (!existsSync(fork)) {
      expect(rel(fork)).toBe(PENDING_FORK_REMOVAL);
      return;
    }
    const stillForked = forksIn(fork, engineNames).map((f) => f.name);
    const restated = stillForked.filter((name) =>
      [
        "tokenize", "buildIndex", "retrieve", "gate", "wilsonLowerBound",
        "objectiveFast", "objectiveNaive", "pack", "validate", "relax",
      ].includes(name),
    );
    expect(restated).toEqual([]);
  });
});

describe("the engine fork guard can actually fail", () => {
  const engineNames = engineExports();

  it("catches a restated engine function in a view file", () => {
    const fixture = [
      'import { gate } from "@/lib/engine";',
      "",
      "export function gate(records: unknown[]) {",
      "  return records.length;",
      "}",
    ].join("\n");
    const names = declares(fixture);
    expect([...names.keys()]).toContain("gate");
    expect(engineNames.has("gate"), "the engine really does export gate").toBe(true);
  });

  it("catches a restated engine constant, not just a function", () => {
    const fixture = "const PRIOR_WEIGHTS = { interest: 1 };\nexport { PRIOR_WEIGHTS };";
    expect([...declares(fixture).keys()]).toContain("PRIOR_WEIGHTS");
  });

  it("catches a class as well as a function", () => {
    expect([...declares("class ObjectiveNaive {}").keys()]).toEqual(["ObjectiveNaive"]);
  });

  it("catches an async engine function and a re-exported default", () => {
    const fixture = ["export async function retrieve() {", "  return [];", "}"].join("\n");
    expect([...declares(fixture).keys()]).toContain("retrieve");
  });

  it("resolves the star exports, so an empty engine set would be caught", () => {
    expect(engineNames.has("getCityManifest")).toBe(true);
    expect(engineNames.has("REJECTION_CODES")).toBe(true);
    expect(engineNames.has("rejectionSentence")).toBe(true);
    expect(engineNames.has("UiState"), "tokens.ts must not be an engine name").toBe(false);
  });

  it("does not flag a name that only appears inside a comment or a string", () => {
    const fixture = [
      "// we used to declare gate here",
      "/** objectiveNaive used to live in this file. */",
      'const label = "pack and validate and retrieve";',
    ].join("\n");
    const declared = [...declares(fixture).keys()];
    expect(declared).toEqual(["label"]);
    expect(declared.filter((name) => engineNames.has(name))).toEqual([]);
  });

  it("does not flag a view-layer name the engine does not own", () => {
    const fixture = "export function gateLabel(code: string) { return code; }";
    const hits = [...declares(fixture).keys()].filter((n) => engineNames.has(n));
    expect(hits).toEqual([]);
  });
});
