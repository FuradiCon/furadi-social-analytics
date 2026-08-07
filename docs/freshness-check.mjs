import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";

const root = path.dirname(fileURLToPath(import.meta.url));
const source = JSON.parse(fs.readFileSync(path.join(root, "data.json"), "utf8"));
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, "http://localhost").pathname;
  const file = pathname === "/" ? "index.html" : pathname.slice(1);
  fs.readFile(path.join(root, file), (error, body) => {
    if (error) return res.writeHead(404).end("Not found");
    res.writeHead(200).end(body);
  });
});

await new Promise(resolve => server.listen(0, resolve));
const url = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch();

function fixture({ lastBuiltAt, generatedAt, windowDays, dataThrough } = {}) {
  const payload = structuredClone(source);
  payload.lastBuiltAt = lastBuiltAt;
  payload.generatedAt = generatedAt;
  const first = payload.channels[0];
  first.data = [
    { d: "2026-08-03", views: 4, uniques: 2, costUsd: 0 },
    { d: "2026-08-05", views: 8, uniques: 3, costUsd: 0 },
  ];
  if (windowDays === undefined) delete first.windowDays;
  else first.windowDays = windowDays;
  if (dataThrough === undefined) delete first.dataThrough;
  else first.dataThrough = dataThrough;
  return payload;
}

async function load(payload) {
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on("request", request => {
    if (request.url().endsWith("/data.json")) {
      request.respond({ contentType: "application/json", body: JSON.stringify(payload) });
    } else if (!request.url().startsWith(url)) {
      request.respond({ status: 200, body: "" });
    } else {
      request.continue();
    }
  });
  await page.goto(url, { waitUntil: "commit" });
  await page.waitForSelector("#freshnessStatus", { timeout: 5_000 });
  return page;
}

try {
  let page = await load(fixture({ lastBuiltAt: new Date(Date.now() - 20_000).toISOString(), windowDays: 1, dataThrough: "2026-08-05" }));
  let status = await page.$eval("#freshnessStatus", el => ({ text: el.textContent, exact: el.title, describedBy: el.getAttribute("aria-describedby"), stale: el.classList.contains("is-stale") }));
  assert.match(status.text, /^Updated just now · Data through Aug 5 · 1 complete day$/);
  assert.ok(status.exact, "fresh status exposes an exact build timestamp");
  assert.equal(status.describedBy, "freshnessExact");
  assert.match(await page.$eval("#freshnessExact", el => el.textContent), /^Exact build timestamp: 20/);
  assert.equal(status.stale, false);
  await page.close();

  page = await load(fixture({ lastBuiltAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString() }));
  status = await page.$eval("#freshnessStatus", el => ({ text: el.textContent, stale: el.classList.contains("is-stale") }));
  assert.match(status.text, /^Stale · Updated 3 hours ago · Data through Aug 5 · 2 complete days$/);
  assert.equal(status.stale, true);
  await page.close();

  page = await load(fixture({ generatedAt: new Date(Date.now() - 42 * 60 * 1000).toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC") }));
  status = await page.$eval("#freshnessStatus", el => el.textContent);
  assert.match(status, /^Updated 42 minutes ago · Data through Aug 5 · 2 complete days$/);
  await page.close();

  page = await load(fixture());
  status = await page.$eval("#freshnessStatus", el => el.textContent);
  assert.equal(status, "Update time unavailable · Data through Aug 5 · 2 complete days");
  await page.click('.channel-tab-btn[data-idx="1"]');
  status = await page.$eval("#freshnessStatus", el => el.textContent);
  assert.match(status, /Data through Aug 3 · 27 complete days$/);
  await page.click('.channel-tab-btn[data-idx="2"]');
  status = await page.$eval("#freshnessStatus", el => el.textContent);
  assert.equal(status, "Update time unavailable · Data through unavailable · 0 complete days");
  await page.close();
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}

console.log("freshness browser fixture passed");
