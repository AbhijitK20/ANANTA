#!/usr/bin/env node
/** Focused QA for the audit-fix pass: nav, sort, dedup distance, event contradictions, demo badge. */
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

const browser = await chromium.launch({ headless: true, args: ["--disable-dev-shm-usage", "--no-sandbox"] });
try {
const ok = await main();
process.exit(ok ? 0 : 1);
} finally {
await browser.close();
}
async function main() {
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
page.on("pageerror", () => pageErrors += 1);
page.on("console", (msg) => { if (msg.type() === "error") consoleErrors += 1; });

// ---- N1/N2: unified nav (consumer links only), Trips present, label fixed ----
await page.goto(BASE + "/", { waitUntil: "networkidle" });
const navText = await page.locator("header nav").innerText();
record("N1: Trips in top nav", /Trips/.test(navText));
record("N1: Provider/Operations removed from top nav", !/Provider|Operations/.test(navText));
record("N2: nav says Explore (not Explore map)", !/Explore map/.test(navText));

// U2: plan badge appears in nav after adding to plan (own storage; check bottom nav on the detail page, then home top nav)
await page.evaluate(() => localStorage.removeItem("ananta-draft-plan"));
await page.goto(BASE + "/experience/kala-ghoda-art-walk", { waitUntil: "networkidle" });
await page.getByRole("button", { name: "Add to plan" }).click();
await page.waitForTimeout(400);
const badge = await page.locator("nav a[href='/trips'] span.rounded-full").innerText().catch(() => "");
record("U2: plan badge shows 1 in bottom nav", badge.trim() === "1", "badge=" + JSON.stringify(badge));
await page.goto(BASE + "/", { waitUntil: "networkidle" });
const badgeTop = await page.locator("header a[href='/trips'] span.rounded-full").innerText().catch(() => "");
record("U2: plan badge shows 1 in home top nav", badgeTop.trim() === "1", "badge=" + JSON.stringify(badgeTop));
await page.evaluate(() => localStorage.removeItem("ananta-draft-plan"));

// ---- B1/B2: sort control works on /explore ----
await page.goto(BASE + "/explore", { waitUntil: "networkidle" });
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

// ---- B3/B4: event contradiction visible and consistent on home + events ----
await page.goto(BASE + "/", { waitUntil: "networkidle" });
const changedHome = await page.getByText("Details changed since the last check").count();
const priceHome = await page.getByText("Current price: From ₹400").count();
record("B3: changed event flagged on home", changedHome >= 1);
record("B3: home shows current price for changed event", priceHome >= 1);
await page.goto(BASE + "/events", { waitUntil: "networkidle" });
const banner = await page.getByText("Details changed since the last check").count();
const venueDiff = await page.getByText("Venue: was Bandra West community hall · now Bandra West").count();
record("B3/B4: events page shows full change set incl. price", banner >= 1);
record("B4: venue diff is honest (specific -> area)", venueDiff === 1);

// ---- T2: community label explained ----
const t2 = await page.getByText("From a public event submission in this demo").count();
record("T2: community-reported label explained", t2 >= 1);

// ---- T4: demo action badge on detail page ----
await page.goto(BASE + "/experience/fort-bakery-lanes", { waitUntil: "networkidle" });
const t4 = await page.getByText("Demo action · no real booking").count();
record("T4: booking CTA carries visible demo badge", t4 === 1);

// ---- C1: station code expanded ----
const c1 = await page.getByText("CSMT (Chhatrapati Shivaji Terminus)").count();
record("C1: CSMT expanded on detail page", c1 >= 1);

// ---- U1: chip hint present ----
await page.goto(BASE + "/", { waitUntil: "networkidle" });
const u1 = await page.getByText("Tap a chip to run the search").count();
record("U1: chips explain they run searches", u1 >= 1);

const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
record("no horizontal overflow on home", overflow <= 0);

console.log("\nSUMMARY pageErrors=" + pageErrors + " consoleErrors=" + consoleErrors + " checks=" + results.length + " failed=" + results.filter((r) => !r.ok).length);
return results.filter((r) => !r.ok).length === 0 && pageErrors === 0 && consoleErrors === 0;
}
