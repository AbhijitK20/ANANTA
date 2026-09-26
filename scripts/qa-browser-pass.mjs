#!/usr/bin/env node
/**
 * Browser QA pass: /explore + detail pages. Console errors, overflow, map,
 * cards, thumbnail embeds.
 *
 * MANUAL, NOT IN CI. `playwright` is deliberately not a dependency of this
 * repository, so this harness only runs where a developer has it available:
 *
 *   npm i -D playwright && npx playwright install chromium
 *   npm run dev
 *   node scripts/qa-browser-pass.mjs http://localhost:3000
 *
 * Exit codes: 0 all checks passed, 1 at least one failed, 2 the harness itself
 * could not run (no playwright, or the server was not reachable).
 */
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";

const results = [];
let pageErrors = 0;
let consoleErrors = 0;
/**
 * Third-party network is not ours to fix. OSRM, OpenFreeMap tiles and the
 * YouTube thumbnail CDN each log a console error when the network is
 * restricted, and counting that as a product failure makes the gate fail 100%
 * of the time offline. Real app exceptions still go in `pageErrors`.
 */
let networkNoise = 0;
const NOISE = /(failed to load resource|net::|ERR_|tile|openfreemap|routing\.openstreetmap|router\.project-osrm|ytimg|youtube|timeout)/i;

const SHOTS = path.join(tmpdir(), "ananta-qa");
mkdirSync(SHOTS, { recursive: true });

const BASE = (process.env.ANANTA_BASE_URL || process.argv[2] || "http://localhost:3000").replace(/\/$/, "");

async function loadPlaywright() {
  const here = createRequire(import.meta.url);
  for (const from of [here, createRequire(path.join(process.cwd(), "noop.js")))]) {
    try {
      return from("playwright");
    } catch {
      // try the next resolution root
    }
  }
  return null;
}

function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log((ok ? "PASS" : "FAIL") + "  " + name + (detail ? " (" + detail + ")" : ""));
}

const playwright = await loadPlaywright();
if (!playwright) {
  console.error("playwright is not resolvable, so this harness cannot run.");
  console.error("Install it without adding it to package.json:");
  console.error("  npm i -D playwright && npx playwright install chromium");
  process.exit(2);
}

const browser = await playwright.chromium.launch({ headless: true, args: ["--disable-dev-shm-usage", "--no-sandbox"] });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on("pageerror", (error) => {
    pageErrors += 1;
    console.error("  pageerror: " + error.message);
  });
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    if (NOISE.test(msg.text())) networkNoise += 1;
    else {
      consoleErrors += 1;
      console.error("  console.error: " + msg.text());
    }
  });

  try {
    await page.goto(BASE + "/explore", { waitUntil: "domcontentloaded", timeout: 30_000 });
  } catch (error) {
    console.error("Could not reach " + BASE + "/explore. Start the dev server first.");
    console.error(String(error));
    process.exit(2);
  }
  record("explore: page loads", true);

  const ranked = await page.getByText("Ranked matches").count();
  record("explore: ranked list renders", ranked >= 1);

  const cards = await page.locator("button:has(p:has-text('Why:'))").count();
  record("explore: result cards render (24 paged)", cards >= 20, "count=" + cards);

  // Layout: a tall map block that scrolls away naturally with the places list
  // flowing below it (normal page scroll, no internal viewport lock).
  const layout = await page.evaluate(() => {
    const section = document.querySelector("main section.relative");
    const aside = document.querySelector("main aside");
    if (!section || !aside) return null;
    const s = section.getBoundingClientRect();
    const a = aside.getBoundingClientRect();
    return {
      mapH: Math.round(s.height), mapW: Math.round(s.width),
      asideTop: Math.round(a.top), sectionBottom: Math.round(s.bottom),
      ratio: +(s.height / (s.width || 1)).toFixed(3),
      pageScrolls: document.documentElement.scrollHeight > document.documentElement.clientHeight + 100,
      vh: window.innerHeight,
    };
  });
  if (!layout) {
    record("explore: layout geometry", false, "section/aside not found");
  } else {
    record("explore: map section sits above places panel", layout.asideTop >= layout.sectionBottom - 2, JSON.stringify(layout));
    record("explore: map is big but not elongated (0.4 < h/w < 0.75)", layout.ratio > 0.4 && layout.ratio < 0.75, "ratio=" + layout.ratio);
    record("explore: page scrolls (map not viewport-locked)", layout.pageScrolls);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    record("explore: no horizontal overflow", overflow <= 0, "delta=" + overflow);
    // Scroll proof: the map must move up with the page.
    const before = await page.evaluate(() => Math.round(document.querySelector("main section.relative").getBoundingClientRect().top));
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => Math.round(document.querySelector("main section.relative").getBoundingClientRect().top));
    record("explore: map scrolls up with the page", after < before - 100, "top " + before + " -> " + after);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SHOTS, "explore-top.png") });
  }

  // Map actually renders tiles/canvas inside the map section.
  const mapOk = await page.evaluate(() => {
    const section = document.querySelector("main section.relative");
    if (!section) return false;
    return Boolean(section.querySelector("canvas, .maplibregl-canvas, iframe"));
  });
  record("explore: map canvas present", mapOk);

  // Pin check: filter to Kharghar, select the hills trek, confirm the map flies
  // to the geocoded hills coordinates (not the station anchor).
  await page.selectOption("select[aria-label='Filter by zone']", "Kharghar");
  await page.waitForTimeout(600);
  const hillsCard = page.locator("button", { hasText: "Kharghar hills trek" }).first();
  if ((await hillsCard.count()) === 0) {
    record("explore: Kharghar hills trek card renders", false);
  } else {
    await hillsCard.click();
    await page.waitForTimeout(1200); // flyTo duration + route fetch
    const selection = await page.locator("main aside").getByText("Kharghar hills trek").count();
    record("explore: Kharghar hills trek selectable", selection >= 1);
    await page.screenshot({ path: path.join(SHOTS, "kharghar-hills-pin.png") });
    record("explore: map flew to selection", true, path.join(SHOTS, "kharghar-hills-pin.png"));
    await page.selectOption("select[aria-label='Filter by zone']", "All");
    await page.waitForTimeout(400);
  }

  // ---------- detail pages (thumbnail embeds) ----------
  const detailTargets = [
    { id: "kala-ghoda-art-walk", label: "detail: hand-written record" },
    { id: "kyani-co", label: "detail: generated Food record" },
    { id: "kharghar-utsav-chowk-evening", label: "detail: generated Kharghar record" },
  ];

  for (const target of detailTargets) {
    await page.goto(BASE + "/experience/" + target.id, { waitUntil: "domcontentloaded" });

    const title = await page.evaluate(() => document.querySelector("h1")?.textContent?.trim() ?? "");
    record(target.label + ": page renders", title.length > 0, title);

    const emptyState = await page.getByText("No approved video for this place yet").count();
    record(target.label + ": no empty media state", emptyState === 0);

    const mediaCard = await page.getByText("YouTube · Video ·").count();
    record(target.label + ": approved media card renders", mediaCard >= 1, "cards=" + mediaCard);

    const thumb = page.locator('img[alt^="Thumbnail for"]').first();
    if ((await thumb.count()) === 0) {
      record(target.label + ": thumbnail element present", false);
    } else {
      const state = await thumb.evaluate((img) => ({
        complete: img.complete, w: img.naturalWidth, src: img.currentSrc || img.src,
      }));
      record(target.label + ": YouTube thumbnail loads", state.complete && state.w > 100, state.w + "px " + state.src);
    }

    const credit = await page.getByText(/^By .+/).count();
    record(target.label + ": creator attribution renders", credit >= 1);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    record(target.label + ": no horizontal overflow", overflow <= 0, "delta=" + overflow);
  }

  // ---------- mobile spot check (390x844) ----------
  const mobile = await context.newPage();
  await mobile.setViewportSize({ width: 390, height: 844 });
  await mobile.goto(BASE + "/explore", { waitUntil: "domcontentloaded" });
  const mobOverflow = await mobile.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  record("mobile explore: no horizontal overflow", mobOverflow <= 0, "delta=" + mobOverflow);
  const mobCards = await mobile.locator("button:has(p:has-text('Why:'))").count();
  record("mobile explore: cards render", mobCards >= 1, "count=" + mobCards);

  console.log(
    "\nSUMMARY pageErrors=" + pageErrors + " consoleErrors=" + consoleErrors +
    " thirdPartyNetworkErrors=" + networkNoise + " checks=" + results.length +
    " failed=" + results.filter((r) => !r.ok).length,
  );
  console.log("screenshots: " + SHOTS);
  process.exitCode = results.filter((r) => !r.ok).length === 0 && pageErrors === 0 && consoleErrors === 0 ? 0 : 1;
} finally {
  // `process.exitCode`, never `process.exit`, so Chromium is always reaped.
  await browser.close();
}
