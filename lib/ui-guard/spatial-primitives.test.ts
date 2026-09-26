import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

import config from "../../tailwind.config";

/**
 * The spatial discipline guard.
 *
 * The design is CSS only. `MASTERPLAN.md` section 9 says zero new dependencies,
 * at all, and the `framer-motion` route on 21st.dev is a 34 to 45 kB gzip
 * library that every 21st-listed motion component requires. Installing it to
 * tilt a card by six degrees breaks a stated non-negotiable to do about thirty
 * lines of CSS.
 *
 * These are the rules that make the layer disciplined rather than decorative.
 * Every one of them is mechanically checkable, which is the point.
 */

const ROOT = process.cwd();
const CSS = resolve(ROOT, "app/globals.css");
const TAILWIND = resolve(ROOT, "tailwind.config.ts");
const PACKAGE = resolve(ROOT, "package.json");
const SELF = resolve(ROOT, "lib/ui-guard/spatial-primitives.test.ts");
const SOURCE_DIRS = ["app", "components"].map((d) => resolve(ROOT, d));
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "coverage"]);

const BANNED_PACKAGES = [
  "framer-motion",
  "motion",
  "three",
  "@react-three/fiber",
  "@react-three/drei",
  "gsap",
  "lenis",
  "@react-spring/web",
  "react-spring",
  "popmotion",
  "animejs",
];

const rel = (file: string): string => relative(ROOT, file).split(sep).join("/");

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir).sort()) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(tsx?|css)$/.test(entry)) out.push(full);
  }
  return out;
}

const read = (file: string): string => readFileSync(file, "utf8");

/** Blanks comments, preserving offsets. */
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

const sources = (): string[] => SOURCE_DIRS.flatMap((d) => walk(d)).filter((f) => f !== SELF);
const sourceFiles = (): string[] => sources().filter((f) => f.endsWith(".tsx") || f.endsWith(".ts"));
const code = (f: string): string => stripComments(read(f));

/** Every import specifier in a file. No TypeScript compiler API. */
function specifiers(text: string): string[] {
  const found: string[] = [];
  const patterns = [
    /\bfrom\s*["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\bimport\s+["']([^"']+)["']/g,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) found.push(m[1]);
  }
  return found;
}

/** A banned package, either as an exact name or as a scope under one. */
function bannedHit(spec: string): string | null {
  for (const banned of BANNED_PACKAGES) {
    if (spec === banned || spec.startsWith(`${banned}/`)) return banned;
  }
  return null;
}

const PERSPECTIVE = /perspective\s*:\s*(\d+(?:\.\d+)?)px/g;
const ROTATE = /rotate([XYZ])\s*\(\s*(-?[\d.]+)deg\s*\)/g;
const FORBIDDEN_TRANSITION_PROPERTY =
  /\b(width|height|top|left|right|bottom|margin|padding|box-shadow|all)\b/;

describe("the spatial layer is CSS only", () => {
  const files = sourceFiles();

  it("is not passing on an empty tree", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it("imports no animation or 3D library anywhere in the view layer", () => {
    const hits: { file: string; spec: string }[] = [];
    for (const file of files) {
      for (const spec of specifiers(code(file))) {
        const banned = bannedHit(spec);
        if (banned) hits.push({ file: rel(file), spec });
      }
    }
    expect(hits).toEqual([]);
  });

  it("has no animation or 3D library in package.json", () => {
    const declared: string[] = [
      ...Object.keys(JSON.parse(read(PACKAGE)).dependencies ?? {}),
      ...Object.keys(JSON.parse(read(PACKAGE)).devDependencies ?? {}),
    ];
    expect(declared.filter((d) => bannedHit(d))).toEqual([]);
  });

  it("keeps the dependency list at the five that were ratified", () => {
    const deps = Object.keys(JSON.parse(read(PACKAGE)).dependencies ?? {}).sort();
    expect(deps).toEqual([
      "@phosphor-icons/react",
      "maplibre-gl",
      "next",
      "react",
      "react-dom",
    ]);
  });
});

describe("perspective and tilt stay inside the researched band", () => {
  it("keeps every perspective value between 900 and 1400", () => {
    const found: { file: string; value: number }[] = [];
    for (const file of sources()) {
      for (const m of code(file).matchAll(PERSPECTIVE)) {
        found.push({ file: rel(file), value: Number(m[1]) });
      }
    }
    expect(found.length, "no perspective anywhere, so the depth scale has no container").toBeGreaterThan(0);
    for (const hit of found) {
      expect(hit.value, `${hit.file} perspective ${hit.value}px`).toBeGreaterThanOrEqual(900);
      expect(hit.value, `${hit.file} perspective ${hit.value}px`).toBeLessThanOrEqual(1400);
    }
  });

  it("uses 1200px as the default perspective", () => {
    expect(read(CSS)).toMatch(/\.stage\s*,?\s*\.stage-3d?\s*\{[^}]*perspective:\s*1200px/);
  });

  it("never rotates by more than 6 degrees on any axis", () => {
    const found: { file: string; axis: string; value: number }[] = [];
    for (const file of sources()) {
      for (const m of code(file).matchAll(ROTATE)) {
        found.push({ file: rel(file), axis: m[1], value: Math.abs(Number(m[2])) });
      }
    }
    expect(found.length, "no rotation anywhere, so the tilt scale is missing").toBeGreaterThan(0);
    for (const hit of found) {
      expect(hit.value, `${hit.file} rotate${hit.axis} ${hit.value}deg`).toBeLessThanOrEqual(6);
    }
  });
});

describe("only transform and opacity transition", () => {
  /** Every `transition` or `transition-*` property value in a file. */
  function transitionValues(file: string): string[] {
    const out: string[] = [];
    for (const m of code(file).matchAll(/(?:^|[;{\s])transition(?:-[a-z]+)?\s*:\s*([^;}]+)/g)) {
      out.push(m[1]);
    }
    for (const m of code(file).matchAll(/transition-([a-z]+)/g)) out.push(`transition-${m[1]}`);
    return out;
  }

  it("never uses transition-all or transition: all", () => {
    const hits: { file: string; value: string }[] = [];
    for (const file of sources()) {
      for (const value of transitionValues(file)) {
        if (/(^|[\s,])all([\s,]|$)/.test(value)) hits.push({ file: rel(file), value });
        if (/transition-all/.test(value)) hits.push({ file: rel(file), value });
      }
    }
    expect(hits).toEqual([]);
  });

  it("never transitions a property that forces layout or paint", () => {
    const hits: { file: string; value: string }[] = [];
    for (const file of sources()) {
      for (const value of transitionValues(file)) {
        if (FORBIDDEN_TRANSITION_PROPERTY.test(value)) hits.push({ file: rel(file), value });
      }
    }
    expect(hits).toEqual([]);
  });

  it("finds at least one transition, so the guard is not passing vacuously", () => {
    const all = sources().flatMap((f) => transitionValues(f));
    expect(all.length).toBeGreaterThan(0);
    expect(all.every((v) => !FORBIDDEN_TRANSITION_PROPERTY.test(v))).toBe(true);
  });
});

describe("depth is never the only channel", () => {
  const css = read(CSS);

  it("desaturates .depth-recessed, so a blind reader gets the same information", () => {
    expect(css).toMatch(/\.depth-recessed\s*\{[^}]*filter:\s*saturate\(\s*0?\.6\s*\)/);
  });

  it("desaturates nothing else, because verified must not look dimmed", () => {
    const rules = [...css.matchAll(/\.(depth-[a-z]+)\s*\{[^}]*\}/g)].map((m) => ({
      name: m[1],
      body: m[0],
    }));
    for (const rule of rules) {
      if (/saturate/.test(rule.body)) expect(rule.name, rule.name).toBe("depth-recessed");
    }
  });

  it("keeps preserve-3d off the cards and on the container only", () => {
    // Comment stripped, because the word appears in the explanatory comment
    // above the rule and a raw scan would read the prose as a selector.
    const clean = stripComments(read(CSS));
    const holders = [...clean.matchAll(/([^{}]*)\{[^}]*preserve-3d[^}]*\}/g)]
      .flatMap((m) => m[1].split(",").map((s) => s.trim()))
      .filter((s) => s.length);
    expect(holders.length).toBeGreaterThan(0);
    for (const holder of holders) {
      expect(holder, `preserve-3d on ${holder}`).toMatch(/^\.stage(-3d)?$/);
    }
  });

  it("has all six depth steps at the translateZ values the contract fixes", () => {
    const expected: [string, string][] = [
      ["depth-recessed", "-10px"],
      ["depth-flush", "0"],
      ["depth-raised", "8px"],
      ["depth-lifted", "18px"],
      ["depth-floating", "32px"],
      ["depth-foreground", "48px"],
    ];
    for (const [cls, z] of expected) {
      expect(css, cls).toMatch(new RegExp(`\\.${cls}\\s*\\{[^}]*translateZ\\(${z}\\)`));
    }
  });

  it("has all seven tilt steps from 0 to 6 degrees", () => {
    for (let deg = 0; deg <= 6; deg += 1) {
      expect(css, `tilt ${deg}`).toMatch(
        new RegExp(`\\.tilt-by-drift-${deg}\\s*\\{[^}]*rotateX\\(${deg}deg\\)`),
      );
    }
  });
});

describe("no ambient looping animation", () => {
  it("has exactly one keyframe block, and it is the route dot", () => {
    const found = [...read(CSS).matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]);
    expect(found).toEqual(["travel-slide"]);
  });

  it("leaves the route dot, because a directional indicator is information", () => {
    expect(read(CSS)).toMatch(/\.travel-connector-dot\s*\{[^}]*animation:\s*travel-slide/);
  });
});

describe("the two shadow sources cannot drift", () => {
  /**
   * The stacks exist twice on purpose: as `--shadow-z-*` custom properties for
   * the `.depth-*` classes, and as `theme.boxShadow` for the `shadow-*`
   * utilities. Both are asserted against the same six literals, so a palette
   * edit that touches one and not the other fails here rather than shipping a
   * card whose Tailwind shadow and CSS shadow disagree by a layer.
   */
  const shadows = (config.theme?.extend?.boxShadow ?? {}) as Record<string, string>;
  const css = read(CSS);

  /** The custom property's declared value, with the ink variable expanded. */
  function cssValue(variable: string): string {
    const m = new RegExp(`${variable}:([^;]+);`).exec(css);
    expect(m, variable).not.toBeNull();
    return normalise(m![1].replace(/var\(--ink-rgb\)/g, "24, 32, 43"));
  }

  it("reads the six stacks out of tailwind.config.ts", () => {
    for (const key of ["recessed", "flush", "raised", "lifted", "floating", "foreground"]) {
      expect(typeof shadows[key], key).toBe("string");
      expect(shadows[key].length, key).toBeGreaterThan(4);
    }
  });

  it("keeps the two sources byte identical after whitespace normalisation", () => {
    const pairs: [string, string][] = [
      ["--shadow-inset", "recessed"],
      ["--shadow-z-flush", "flush"],
      ["--shadow-z-raised", "raised"],
      ["--shadow-z-lifted", "lifted"],
      ["--shadow-z-floating", "floating"],
      ["--shadow-z-foreground", "foreground"],
    ];
    for (const [variable, key] of pairs) {
      expect(normalise(shadows[key]), `${key} differs between tailwind.config.ts and globals.css`).toBe(
        cssValue(variable),
      );
    }
  });

  it("points the old flat card and float utilities at a real stack, not a single layer", () => {
    expect(normalise(shadows.card)).toBe(normalise(shadows.raised));
    expect(normalise(shadows.float)).toBe(normalise(shadows.floating));
  });

  it("uses the ink the palette declares", () => {
    const ink = /ink:\s*"(#[0-9A-Fa-f]{6})"/.exec(read(TAILWIND))![1];
    const rgb = [1, 3, 5].map((i) => parseInt(ink.slice(i, i + 2), 16)).join(", ");
    expect(rgb).toBe("24, 32, 43");
  });

  /** Same shadow, different spelling: `rgba(24, 32, 43, .05)` is `rgba(24, 32, 43, 0.05)`. */
  function normalise(value: string): string {
    return value
      .replace(/\s+/g, " ")
      .replace(/,\s*\.(\d)/g, ", 0.$1")
      .replace(/\(\s*(\d+,\s*\d+,\s*\d+),\s*/g, "($1, ")
      .replace(/\s*\)/g, ")")
      .trim();
  }
});

describe("the spatial guard can actually fail", () => {
  const css = read(CSS);

  it("would catch an animation library import", () => {
    const spec = "framer-motion";
    expect(bannedHit(spec)).toBe(spec);
    expect(bannedHit("@react-three/fiber")).toBe("@react-three/fiber");
    expect(bannedHit("motion/react")).toBe("motion");
  });

  it("would not flag a legitimate specifier that merely contains a word", () => {
    expect(bannedHit("@/components/ananta/tokens")).toBeNull();
    expect(bannedHit("maplibre-gl")).toBeNull();
    expect(bannedHit("@/lib/engine")).toBeNull();
  });

  it("would catch a perspective outside the band", () => {
    const bad = ".stage { perspective: 400px; }";
    const value = Number(PERSPECTIVE.exec(bad)![1]);
    PERSPECTIVE.lastIndex = 0;
    expect(value).toBeLessThan(900);
  });

  it("would catch a rotateX above 6 degrees", () => {
    const bad = ".tilt-by-drift-9 { transform: rotateX(14deg); }";
    const m = ROTATE.exec(bad)!;
    expect(Math.abs(Number(m[2]))).toBeGreaterThan(6);
  });

  it("would catch a transition-all", () => {
    expect(/(^|[\s,])all([\s,]|$)/.test("all 200ms ease-out")).toBe(true);
    expect(/(^|[\s,])all([\s,]|$)/.test("transform 200ms ease-out")).toBe(false);
  });

  it("would catch a transition on box-shadow", () => {
    expect(FORBIDDEN_TRANSITION_PROPERTY.test("box-shadow 200ms ease-out")).toBe(true);
    expect(FORBIDDEN_TRANSITION_PROPERTY.test("transform 200ms ease-out")).toBe(false);
  });

  it("would catch a second keyframe block", () => {
    const extra = `${css}\n@keyframes pulse { from { opacity: 0; } to { opacity: 1; } }`;
    expect([...extra.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1])).toHaveLength(2);
  });

  it("would catch a desaturated raised card, which is a dimmed verified state", () => {
    const bad = ".depth-raised { transform: translateZ(8px); filter: saturate(0.6); }";
    const rules = [...bad.matchAll(/\.(depth-[a-z]+)\s*\{[^}]*\}/g)];
    expect(rules.some((m) => m[1] !== "depth-recessed" && /saturate/.test(m[0]))).toBe(true);
  });

  it("would catch preserve-3d on a card", () => {
    const bad = ".card { transform-style: preserve-3d; }";
    const holders = [...bad.matchAll(/([^{}]*)\{[^}]*preserve-3d[^}]*\}/g)]
      .flatMap((m) => m[1].split(",").map((s) => s.trim()))
      .filter((s) => s.length);
    expect(holders.every((h) => /^\.stage(-3d)?$/.test(h))).toBe(false);
  });

  it("would catch a drift between the two shadow sources", () => {
    const drifted = normaliseFixture("0 1px 2px rgba(24, 32, 43, 0.09)");
    const real = normaliseFixture("0 1px 2px rgba(24, 32, 43, 0.04)");
    expect(drifted).not.toBe(real);
  });

  function normaliseFixture(value: string): string {
    return value.replace(/\s+/g, " ").trim();
  }
});
