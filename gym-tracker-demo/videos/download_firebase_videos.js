#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("node:fs");
const path = require("node:path");
const { pipeline } = require("node:stream/promises");
const { Readable } = require("node:stream");

const BASE_URL = "https://firebasestorage.googleapis.com/v0/b/fitness-ios-prod.appspot.com/o/";
const DEFAULT_PREFIX = "vid_hd/";

function getArg(name, fallback) {
  const idx = process.argv.indexOf(name);
  if (idx === -1 || !process.argv[idx + 1]) {
    return fallback;
  }
  return process.argv[idx + 1];
}

function toFileUrl(objectName) {
  const encoded = encodeURIComponent(objectName);
  return `${BASE_URL}${encoded}?alt=media`;
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status} ${res.statusText} - ${text}`);
  }
  return res.json();
}

async function downloadFile(url, targetPath) {
  const res = await fetch(url);
  if (!res.ok || !res.body) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status} ${res.statusText} - ${text}`);
  }
  await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(targetPath));
}

async function main() {
  const outDir = getArg("--out", path.resolve(process.cwd(), "downloads"));
  const prefix = getArg("--prefix", DEFAULT_PREFIX);
  const maxPages = Number(getArg("--max-pages", "0")) || 0;
  const concurrency = Number(getArg("--concurrency", "3")) || 3;

  fs.mkdirSync(outDir, { recursive: true });

  let pageToken = "";
  let pageCount = 0;
  let total = 0;

  while (true) {
    const url = new URL(BASE_URL);
    url.searchParams.set("prefix", prefix);
    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }

    const data = await fetchJson(url.toString());
    const items = Array.isArray(data.items) ? data.items : [];
    if (items.length === 0) {
      break;
    }

    const queue = [...items];
    const workers = Array.from({ length: concurrency }, async () => {
      while (queue.length) {
        const item = queue.shift();
        if (!item || !item.name) {
          continue;
        }
        const fileName = path.basename(item.name);
        const targetPath = path.join(outDir, fileName);
        if (fs.existsSync(targetPath)) {
          console.log(`SKIP ${fileName}`);
          total += 1;
          continue;
        }
        const fileUrl = toFileUrl(item.name);
        console.log(`DOWN ${fileName}`);
        await downloadFile(fileUrl, targetPath);
        total += 1;
      }
    });
    await Promise.all(workers);

    pageToken = data.nextPageToken || "";
    pageCount += 1;

    if (!pageToken) {
      break;
    }
    if (maxPages && pageCount >= maxPages) {
      break;
    }
  }

  console.log(`OK total=${total} pages=${pageCount}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
