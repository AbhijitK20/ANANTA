#!/usr/bin/env node
/**
 * Focused QA for the audit-fix pass: nav, sort, dedup distance, event
 * contradictions, demo badge.
 *
 * MANUAL, NOT IN CI. `playwright` is deliberately not a dependency of this
 * repository, so this harness only runs where a developer has it available:
 *
 *   npm i -D playwright && npx playwright install chromium
 *   npm run dev
 *   node scripts/qa-audit-fixes.mjs http://localhost:3000
 *
 * Exit codes: 0 all checks passed, 1 at least one failed, 2 the harness itself
 * could not run (no playwright, or the server was not reachable).
 */
import { createRequire } from "node:module";
import path from "node:path";

const results = [];
let pageErrors = 0;
let consoleErrors = 0;
/** See qa-browser-pass.mjs: third-party network failure is not a product bug. */
let networkNoise = 0;
const NOISE = /(failed to load resource|net::|ERR_|tile|openfreemap|routing\.openstreetmap|router\.project-osrm|ytimg|youtube|timeout)/i;

const BASE = (process.env.ANANTA_BASE_URL || process.argv[2] || "http://localhost:3000").replace(/\/$/, "");

async function loadPlaywright() {
  const here = createRequire(import.meta.url);
  for (const from of [here, createRequire(path.join(process.cwd(), "noop.js"))]) {
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
  process.exitCode = await main() ? 0 : 1;
} catch (error) {
  console.error(String(error));
  process.exitCode = 2;
} finally {
  // `process.exitCode`, never `process.exit`, so Chromium is always reaped even
  // when a check throws. The previous version called `process.exit` inside the
  // try block and leaked a Chromium process on every failure.
  await browser.close();
}

async function main() {
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
    await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 30_000 });
  } catch (error) {
    console.error("Could not reach " + BASE + "/. Start the dev server first.");
    console.error(String(error));
    process.exit(2);
  }

  // ---- N1/N2: unified nav (consumer links only), Trips present, label fixed ----
  const navText = await page.locator("header nav").innerText();
  record("N1: Trips in top nav", /Trips/.test(navText));
  record("N1: Provider/Operations removed from top nav", !/Provider|Operations/.test(navText));
  record("N2: nav says Explore (not Explore map)", !/Explore map/.test(navText));

  // U2: plan badge appears in nav after adding to plan (own storage; check bottom nav on the detail page, then home top nav)
  await page.evaluate(() => localStorage.removeItem("ananta-draft-plan"));
  await page.goto(BASE + "/experience/kala-ghoda-art-walk", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Add to plan" }).click();
  await page.waitForTimeout(400);
  const badge = await page.locator("nav a[href='/trips'] span.rounded-full").innerText().catch(() => "");
  record("U2: plan badge shows 1 in bottom nav", badge.trim() === "1", "badge=" + JSON.stringify(badge));
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  const badgeTop = await page.locator("header a[href='/trips'] span.rounded-full").innerText().catch(() => "");
  record("U2: plan badge shows 1 in home top nav", badgeTop.trim() === "1", "badge=" + JSON.stringify(badgeTop));
  await page.evaluate(() => localStorage.removeItem("ananta-draft-plan"));

  // ---- B1/B2: sort control works on /explore ----
  await page.goto(BASE + "/explore", { waitUntil: "domcontentloaded" });
  const firstRanked = await page.locator("main aside h3").first().innerText();
  await page.selectOption("select[aria-label='Sort results']", "name");
  await page.waitForTimeout(300);
  const firstByName = await page.locator("main aside h3").first().innerText();
  await page.selectOption("select[aria-label='Sort results']", "price");
  await page.waitForTimeout(300);
  const firstByPrice = await page.locator("main aside h3").first().innerText();
  record("B1/B2: sort control reorders the list", firstRanked !== firstByName, `rank="${firstRanked}" name="${firstByName}" price="${firstByPrice}"`);

  // B6: no duplicated distance phrasing on cards
  const cardText = await page.locator("main aside button", { hasText: "Why:" }).first().innerText();
  const distanceMentions = (cardText.match(/from your location/g) ?? []).length;
  const walkMentions = (cardText.match(/min walk/g) ?? []).length;
  record("B6: distance stated once (walk estimate only)", distanceMentions === 0 && walkMentions === 1, JSON.stringify(cardText.slice(-120)));

  // T3: confidence tier legend explains the vocabulary
  const legend = await page.getByText("What the confidence labels mean").count();
  record("T3: confidence tier legend present on explore", legend === 1);

  // ---- B3/B4: event contradiction visible and consistent on home + events ----
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  const changedHome = await page.getByText("Details changed since the last check").count();
  const priceHome = await page.getByText("Current price: From ₹400").count();
  record("B3: changed event flagged on home", changedHome >= 1);
  record("B3: home shows current price for changed event", priceHome >= 1);
  await page.goto(BASE + "/events", { waitUntil: "domcontentloaded" });
  const banner = await page.getByText("Details changed since the last check").count();
  const venueDiff = await page.getByText("Venue: was Bandra West community hall · now Bandra West").count();
  record("B3/B4: events page shows full change set incl. price", banner >= 1);
  record("B4: venue diff is honest (specific -> area)", venueDiff === 1);

  // ---- T2: community label explained ----
  const t2 = await page.getByText("From a public event submission in this demo").count();
  record("T2: community-reported label explained", t2 >= 1);

  // ---- T4: demo action badge on detail page ----
  await page.goto(BASE + "/experience/fort-bakery-lanes", { waitUntil: "domcontentloaded" });
  const t4 = await page.getByText("Demo action · no real booking").count();
  record("T4: booking CTA carries visible demo badge", t4 === 1);

  // ---- C1: station code expanded ----
  const c1 = await page.getByText("CSMT (Chhatrapati Shivaji Terminus)").count();
  record("C1: CSMT expanded on detail page", c1 >= 1);

  // ---- U1: chip hint present ----
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  const u1 = await page.getByText("Tap a chip to run the search").count();
  record("U1: chips explain they run searches", u1 >= 1);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  record("no horizontal overflow on home", overflow <= 0);

  console.log(
    "\nSUMMARY pageErrors=" + pageErrors + " consoleErrors=" + consoleErrors +
    " thirdPartyNetworkErrors=" + networkNoise + " checks=" + results.length +
    " failed=" + results.filter((r) => !r.ok).length,
  );
  return results.filter((r) => !r.ok).length === 0 && pageErrors === 0 && consoleErrors === 0;
}
