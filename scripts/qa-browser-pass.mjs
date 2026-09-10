#!/usr/bin/env node
/** Browser QA pass: /explore + detail pages — console errors, overflow, map, cards, thumbnail embeds. */
import path from "node:path";

const PW = "/home/abhijitk20/plugins/playwright-cli/node_modules";
const require = (await import("node:module")).createRequire(path.join(PW, "noop.js"));
const { chromium } = require("playwright");

const BASE = "http://localhost:3117";
const results = [];
let pageErrors = 0;
let consoleErrors = 0;

function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log((ok ? "PASS" : "FAIL") + "  " + name + (detail ? " — " + detail : ""));
}

const browser = await chromium.launch({ headless: true, args: ["--disable-dev-shm-usage"] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
page.on("pageerror", () => pageErrors += 1);
page.on("console", (msg) => { if (msg.type() === "error") consoleErrors += 1; });

// ---------- /explore (desktop 1440x900) ----------
await page.goto(BASE + "/explore", { waitUntil: "networkidle" });
record("explore: page loads", true);

const ranked = await page.getByText("Ranked matches").count();
record("explore: ranked list renders", ranked >= 1);

const cards = await page.locator("button:has(p:has-text('Why:'))").count();
record("explore: result cards render (24 paged)", cards >= 20, "count=" + cards);

// Layout: vertical flex column locked to viewport; map section above the aside.
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
    columnH: Math.round(a.bottom - s.top),
    vh: window.innerHeight,
  };
});
if (!layout) {
  record("explore: layout geometry", false, "section/aside not found");
} else {
  record("explore: map section sits above places panel", layout.asideTop >= layout.sectionBottom - 2, JSON.stringify(layout));
  record("explore: map not elongated (h/w ratio sane)", layout.ratio < 1.0, "ratio=" + layout.ratio);
  record("explore: flex column fills viewport", layout.columnH <= layout.vh + 4, "column=" + layout.columnH + "vh=" + layout.vh);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  record("explore: no horizontal overflow", overflow <= 0, "delta=" + overflow);
}

// Map actually renders tiles/canvas inside the map section.
const mapOk = await page.evaluate(() => {
  const section = document.querySelector("main section.relative");
  if (!section) return false;
  return Boolean(section.querySelector("canvas, .maplibregl-canvas, iframe"));
});
record("explore: map canvas present", mapOk);

// ---------- detail pages (thumbnail embeds) ----------
const detailTargets = [
  { id: "kala-ghoda-art-walk", label: "detail: hand-written record" },
  { id: "kyani-co", label: "detail: generated Food record" },
  { id: "kharghar-utsav-chowk-evening", label: "detail: generated Kharghar record" },
];

for (const target of detailTargets) {
  await page.goto(BASE + "/experience/" + target.id, { waitUntil: "networkidle" });

  const title = await page.evaluate(() => document.querySelector("h1")?.textContent?.trim() ?? "");
  record(target.label + ": page renders", title.length > 0, title);

  const emptyState = await page.getByText("No approved video for this place yet").count();
  record(target.label + ": no empty media state", emptyState === 0);

  const mediaCard = await page.getByText("YouTube · Video ·").count();
  record(target.label + ": approved media card renders", mediaCard >= 1, "cards=" + mediaCard);

  const thumb = page.locator('img[alt^="Thumbnail for"]').first();
  const thumbVisible = await thumb.count();
  if (thumbVisible === 0) {
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
await mobile.goto(BASE + "/explore", { waitUntil: "networkidle" });
const mobOverflow = await mobile.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
record("mobile explore: no horizontal overflow", mobOverflow <= 0, "delta=" + mobOverflow);
const mobCards = await mobile.locator("button:has(p:has-text('Why:'))").count();
record("mobile explore: cards render", mobCards >= 1, "count=" + mobCards);

console.log("\nSUMMARY pageErrors=" + pageErrors + " consoleErrors=" + consoleErrors + " checks=" + results.length + " failed=" + results.filter((r) => !r.ok).length);
await browser.close();
process.exit(results.filter((r) => !r.ok).length === 0 && pageErrors === 0 && consoleErrors === 0 ? 0 : 1);
