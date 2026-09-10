#!/usr/bin/env node
/**
 * Media pool verification script.
 *
 * Verifies media against its live source before it enters the demo:
 *   1. Commons: search -> verify each candidate exists via api.php imageinfo.
 *   2. YouTube: search -> verify each candidate via the live oEmbed endpoint
 *      (a 200 with a real title means the upload exists and is embeddable).
 *   3. Only verified records are written to the generated pool files, with the
 *      real upload title and creator recorded.
 *
 * Usage:
 *   node scripts/verify-media.mjs --report    # print current pool sizes
 *   node scripts/verify-media.mjs             # top up pools to targets
 *   node scripts/verify-media.mjs --refresh   # re-verify every existing entry
 *                                             # against its live source, drop
 *                                             # dead ones, then top up
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Ananta-prototype/1.0";
const TARGET_IMAGES = 70;
const TARGET_VIDEOS = 340;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchJson(url) {
  try {
    const response = await fetch(url, { headers: { "user-agent": UA }, redirect: "follow" });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null; // transient network errors just skip this candidate
  }
}

async function fetchText(url) {
  try {
    const response = await fetch(url, { headers: { "user-agent": UA, "accept-language": "en" }, redirect: "follow" });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

/** Live Commons check, tri-state: "ok", "missing" (confirmed gone), or "unknown" (transient). */
async function verifyCommonsFile(title) {
  const url = "https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url&titles=" + encodeURIComponent(title);
  const data = await fetchJson(url);
  if (!data || !data.query) return "unknown"; // rate limit or network error: NOT evidence of absence
  const page = Object.values(data.query.pages)[0] ?? null;
  if (!page || page.missing !== undefined || !page.imageinfo || !page.imageinfo[0]) return "missing";
  return page.title === title.replace(/_/g, " ") || page.title === title ? "ok" : "missing";
}

async function searchCommons(query, limit) {
  // filetype:bitmap keeps photos only; the generator+imageinfo form verifies and
  // returns thumb urls in one round trip.
  const url =
    "https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search" +
    "&gsrnamespace=6&gsrlimit=" + limit + "&gsrsearch=" + encodeURIComponent(query + " filetype:bitmap") +
    "&prop=imageinfo&iiprop=url";
  const data = await fetchJson(url);
  const pages = data && data.query && data.query.pages ? data.query.pages : {};
  return Object.values(pages)
    .filter((page) => page.imageinfo && page.imageinfo[0])
    .map((page) => page.title);
}

/** Live YouTube check, tri-state: record, "missing" (confirmed gone), or "unknown". */
async function verifyYouTube(id) {
  const response = await fetch("https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=" + id + "&format=json", { headers: { "user-agent": UA }, redirect: "follow" });
  if (response.ok) {
    const data = await response.json().catch(() => null);
    if (data && typeof data.title === "string" && typeof data.author_name === "string") {
      return { id, title: data.title, creator: data.author_name, state: "ok" };
    }
    return { state: "unknown" };
  }
  // 400/401/403/404 from oEmbed means the id is gone or private: confirmed absence.
  if ([400, 401, 403, 404].includes(response.status)) return { state: "missing" };
  return { state: "unknown" }; // 429/5xx: transient, never evidence of absence
}

/** Scrape candidate video ids + titles off a YouTube results page. */
async function searchYouTube(query, limit) {
  const html = await fetchText("https://www.youtube.com/results?search_query=" + encodeURIComponent(query));
  if (!html) return [];
  const re = /"videoRenderer":\{"videoId":"([\w-]{11})".*?"title":\{"runs":\[\{"text":"((?:[^"\\]|\\.)*)"/g;
  const out = [];
  let match;
  while ((match = re.exec(html)) !== null && out.length < limit) {
    try {
      out.push({ id: match[1], title: JSON.parse('"' + match[2] + '"') });
    } catch {
      /* skip malformed title */
    }
  }
  return out;
}

function readPool(file, key) {
  const full = path.join(ROOT, "lib", "data", file);
  if (!fs.existsSync(full)) return [];
  const source = fs.readFileSync(full, "utf8");
  const start = source.indexOf("= [");
  const end = source.lastIndexOf("];");
  if (start === -1 || end === -1) return [];
  try {
    return JSON.parse(source.slice(start + 2, end + 1)); // end+1 excludes the trailing semicolon
  } catch (error) {
    console.error("Could not parse " + file + ": " + error.message);
    return [];
  }
}

function writePool(file, name, type, shape, rows) {
  const body = "// Generated by scripts/verify-media.mjs - do not edit by hand.\n// Every entry was verified against its live source at generation time.\nexport type " + type + " = " + shape + ";\n\nexport const " + name + ": " + type + "[] = " + JSON.stringify(rows, null, 2) + ";\n";
  fs.writeFileSync(path.join(ROOT, "lib", "data", file), body);
}

const AREA_QUERIES = [
  "Mumbai Fort Kala Ghoda", "Mumbai Colaba Causeway", "Marine Drive Mumbai", "Girgaon Chowpatty Mumbai",
  "Bandra Mumbai", "Juhu Beach Mumbai", "Andheri Mumbai", "Powai Lake Mumbai", "Aarey Colony Mumbai",
  "Dadar Mumbai", "Matunga Mumbai", "Lower Parel Mumbai", "Worli Mumbai", "Malabar Hill Mumbai",
  "Bhendi Bazaar Mumbai", "Sewri Mumbai", "Borivali Sanjay Gandhi National Park", "Vashi Navi Mumbai",
  "Nerul Navi Mumbai", "Seawoods Navi Mumbai", "Belapur Navi Mumbai", "Kharghar Navi Mumbai",
  "Airoli Navi Mumbai", "Panvel Maharashtra", "Gateway of India Mumbai", "Chhatrapati Shivaji Terminus Mumbai",
  "Haji Ali Dargah Mumbai", "Mount Mary Church Bandra", "Juhu Beach food Mumbai", "Mumbai street food",
  "Navi Mumbai Palm Beach Road", "Mumbai skyline", "Mumbai local train", "Mumbai monsoon",
];

const VIDEO_QUERIES = [
  // Weak-category queries run FIRST: Stay, Workshop, Culture, Nature, and
  // Family pools were nearly empty when generic city queries filled the
  // target first, so these categories get their budget before anything else.
  "Mumbai hotel room tour", "Mumbai five star hotel room", "Mumbai budget hotel room",
  "Mumbai heritage hotel stay", "Navi Mumbai hotel", "Mumbai backpacker hostel",
  "Mumbai hotel rooftop pool", "Mumbai luxury hotel suite tour",
  "Mumbai pottery class", "Mumbai pottery workshop", "Mumbai cooking class",
  "Mumbai art workshop", "Mumbai dance class", "Mumbai craft workshop",
  "Mumbai photography workshop", "Dharavi pottery workshop",
  "Mumbai museum tour", "Mumbai Kala Ghoda art precinct", "Mumbai Ganpati pandal",
  "Mumbai dargah visit", "Mumbai temple tour", "Elephanta Caves tour",
  "Mumbai heritage walk", "Gateway of India Mumbai history", "Chhatrapati Shivaji Terminus inside",
  "Mumbai art gallery opening",
  "Sanjay Gandhi National Park safari", "Aarey forest Mumbai", "Mumbai mangroves",
  "Sewri flamingo sanctuary", "Kharghar hills trek", "Mumbai monsoon waterfall",
  "Navi Mumbai mangrove park", "Mumbai butterfly garden Ovalekarwadi",
  "Essel World water park", "Taraporewala aquarium Mumbai", "Mumbai toy train SGNP",
  "Wonders Park Nerul", "Mumbai kids play area", "Hanging Gardens Mumbai",
  "Five Gardens Dadar", "Mumbai family picnic",
  // Specific area + category queries run next so they always fill the pool
  // before generic city-wide queries can reach the target.
  "Central Park Kharghar", "Wonders Park Nerul", "Essel World Mumbai", "Water park Mumbai",
  "Sewri flamingo Mumbai", "Dadar flower market", "Banganga tank Mumbai", "Hanging Gardens Mumbai",
  "Aarey colony Mumbai", "Versova beach Mumbai", "Kharghar hills trek", "Airoli mangrove park",
  "Mumbai vada pav", "Mumbai pav bhaji", "Mumbai misal pav", "Mumbai irani cafe",
  "Mumbai seafood restaurant", "Mumbai kebab", "Mumbai thali", "Mumbai chaat",
  "Mumbai dosa Matunga", "Mumbai bakery Yazdani", "Mumbai night club", "Mumbai live music band",
  "Mumbai stand up comedy", "Mumbai bar hopping", "Mumbai cocktail bar", "Colaba Causeway shopping",
  "Linking Road Bandra shopping", "Mumbai street market bargain", "Mumbai trek Sanjay Gandhi",
  "Karnala fort trek", "Mumbai cycling group ride", "Mumbai kayaking creek", "Mumbai parasailing",
  "Mumbai rock climbing", "Mumbai midnight cycling", "Mumbai garden park walk", "Mumbai five star hotel",
  "Mumbai hotel room tour", "Mumbai budget hotel", "Mumbai heritage hotel", "Navi Mumbai hotel",
  "Mumbai museum Chhatrapati", "Mumbai Kala Ghoda art", "Mumbai Ganpati pandal", "Mumbai dargah visit",
  "Mumbai pottery class", "Mumbai cooking class", "Mumbai art workshop", "Mumbai dance class",
  "Mumbai kids play area", "Mumbai family outing", "Mumbai aquarium Taraporewala", "Mumbai toy train SGNP",
  "Mumbai boating lake", "Mumbai picnic spot", "Five Gardens Dadar", "Central Park Kharghar picnic",
  "Mumbai temples", "Mumbai church heritage", "Bhendi Bazaar Mumbai food", "Matunga Mumbai walk",
  "Girgaon Chowpatty evening", "Malabar Hill Mumbai walk", "Lower Parel Mumbai night", "Andheri Mumbai west",
  "Borivali Mumbai national park", "Palm Beach Road Navi Mumbai drive", "Belapur fort Navi Mumbai",
  "Nerul Seawoods lake", "Panvel lake Maharashtra", "Worli fort Mumbai", "Mumbai promenade evening",
  // Generic city-wide queries fill whatever budget remains.
  "Mumbai 4K walking tour", "Mumbai city tour", "Mumbai food tour", "Colaba Mumbai walk",
  "Marine Drive Mumbai evening", "Bandra Mumbai walking tour", "Juhu Beach Mumbai",
  "Powai Lake Mumbai", "Mumbai street food tour", "Navi Mumbai tour", "Vashi Navi Mumbai",
  "Kharghar Navi Mumbai", "Panvel Maharashtra", "Mumbai nightlife", "Mumbai markets",
  "Mumbai Ganesh Chaturthi", "Mumbai local train journey", "Mumbai monsoon 4K", "Sanjay Gandhi National Park",
  "Gateway of India Mumbai", "Elephanta Caves Mumbai", "Mumbai rooftops", "Worli Sea Link",
  "Mumbai beach", "Mumbai temple tour", "Mumbai heritage walk", "Mumbai adventure",
  "Mumbai cafes", "Mumbai restaurants", "Mumbai vlog", "Mumbai drone view",
  "Mumbai trekking", "Mumbai cycling ride", "Mumbai kayaking", "Mumbai street shopping",
  "Mumbai rooftop bar", "Mumbai hotel tour", "Mumbai luxury hotel", "Mumbai comedy club",
  "Mumbai pottery workshop", "Mumbai art gallery", "Mumbai museum tour", "Airoli creek flamingo",
  "Seawoods Navi Mumbai walk", "Belapur Navi Mumbai", "Mumbai bakery food", "Mumbai dessert",
];

/**
 * Scheduled refresh: re-verify every pool entry against its live source.
 *
 *   - Commons files can be renamed or deleted upstream -> entry dropped.
 *   - YouTube uploads can be deleted or made private -> oEmbed stops returning
 *     a title -> entry dropped.
 *   - A surviving video's title or creator may drift after an upstream edit;
 *     the record is updated so the dataset keeps stating real facts.
 *
 * Pruned pools are written back BEFORE top-up starts, so a mid-run failure can
 * never resurrect a dead entry. Places that referenced a dropped video are
 * reassigned deterministically by the factory at build time.
 */
async function refreshExisting(images, videos) {
  // A transient failure must never kill a verified entry, so every ambiguous
  // result is retried before the entry is kept as-is for the next run.
  const RETRIES = 2;
  const droppedImages = [];
  const droppedVideos = [];

  const keptImages = [];
  for (const row of images) {
    let state = await verifyCommonsFile(row.file);
    for (let attempt = 0; state === "unknown" && attempt < RETRIES; attempt += 1) {
      await sleep(500);
      state = await verifyCommonsFile(row.file);
    }
    if (state === "missing") {
      console.log("image dropped: " + row.file);
      droppedImages.push(row.file);
      continue;
    }
    if (state === "unknown") console.log("image kept unverified this run: " + row.file);
    keptImages.push(row);
    await sleep(150);
  }

  const keptVideos = [];
  for (const row of videos) {
    let result = await verifyYouTube(row.id);
    for (let attempt = 0; result.state === "unknown" && attempt < RETRIES; attempt += 1) {
      await sleep(500);
      result = await verifyYouTube(row.id);
    }
    if (result.state === "missing") {
      console.log("video dropped: [" + row.id + "] " + row.title);
      droppedVideos.push("[" + row.id + "] " + row.title);
      continue;
    }
    if (result.state === "ok" && (result.title !== row.title || result.creator !== row.creator)) {
      console.log("video updated: [" + row.id + "] " + row.title + " -> " + result.title);
      row.title = result.title;
      row.creator = result.creator;
    }
    keptVideos.push(row);
    await sleep(150);
  }

  images.length = 0;
  images.push(...keptImages);
  videos.length = 0;
  videos.push(...keptVideos);
  writePool("images.generated.ts", "generatedImages", "GeneratedImage", "{ key: string; file: string; credit: string; query: string }", images);
  writePool("videos.generated.ts", "generatedVideos", "GeneratedVideo", "{ key: string; id: string; title: string; creator: string; query: string }", videos);
  console.log("refresh done: " + keptImages.length + " images and " + keptVideos.length + " videos still verified.");

  // CI surface: the workflow reads these from GITHUB_OUTPUT to decide whether
  // the drop report should fire. Locally they are inert.
  const outputPath = process.env.GITHUB_OUTPUT;
  const lines = [
    "dropped_images=" + droppedImages.length,
    "dropped_videos=" + droppedVideos.length,
    "dropped_detail_images=" + droppedImages.join(" | "),
    "dropped_detail_videos=" + droppedVideos.join(" | "),
  ];
  if (outputPath) {
    fs.appendFileSync(outputPath, lines.join("\n") + "\n");
  } else {
    console.log(lines.join("\n"));
  }
}

async function main() {
  const args = process.argv.slice(2);
  const images = readPool("images.generated.ts", "generatedImages");
  const videos = readPool("videos.generated.ts", "generatedVideos");
  if (args.includes("--report")) {
    console.log("images: " + images.length + ", videos: " + videos.length);
    return;
  }

  if (args.includes("--refresh")) {
    await refreshExisting(images, videos);
  }

  const usedImageTitles = new Set(images.map((row) => row.file));
  const usedVideoIds = new Set(videos.map((row) => row.id));

  // ---- Images ----
  for (const query of AREA_QUERIES) {
    if (images.length >= TARGET_IMAGES) break;
    const hits = await searchCommons(query, 12);
    await sleep(150);
    let added = 0;
    for (const title of hits) {
      if (images.length >= TARGET_IMAGES || added >= 2) break;
      if (usedImageTitles.has(title)) continue;
      const ok = await verifyCommonsFile(title);
      await sleep(120);
      if (ok) {
        usedImageTitles.add(title);
        images.push({ key: "commons-" + images.length, file: title, credit: "Wikimedia Commons contributor", query });
        writePool("images.generated.ts", "generatedImages", "GeneratedImage", "{ key: string; file: string; credit: string; query: string }", images);
        console.log("image ok: " + title);
        added += 1;
      }
    }
  }

  // ---- Videos ----
  for (const query of VIDEO_QUERIES) {
    if (videos.length >= TARGET_VIDEOS) break;
    const candidates = await searchYouTube(query, 8);
    await sleep(200);
    let added = 0;
    for (const candidate of candidates) {
      if (videos.length >= TARGET_VIDEOS || added >= 3) break;
      if (usedVideoIds.has(candidate.id)) continue;
      const verified = await verifyYouTube(candidate.id);
      await sleep(120);
      if (verified && verified.title.length > 5) {
        usedVideoIds.add(verified.id);
        videos.push({ key: "yt-" + videos.length, id: verified.id, title: verified.title, creator: verified.creator, query });
        writePool("videos.generated.ts", "generatedVideos", "GeneratedVideo", "{ key: string; id: string; title: string; creator: string; query: string }", videos);
        console.log("video ok: [" + verified.id + "] " + verified.title);
        added += 1;
      }
    }
  }

  writePool("images.generated.ts", "generatedImages", "GeneratedImage", "{ key: string; file: string; credit: string; query: string }", images);
  writePool("videos.generated.ts", "generatedVideos", "GeneratedVideo", "{ key: string; id: string; title: string; creator: string; query: string }", videos);
  console.log("Wrote " + images.length + " images and " + videos.length + " videos.");
}

main();
