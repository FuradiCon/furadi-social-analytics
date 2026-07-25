import puppeteer from "puppeteer";
import fs from "node:fs";
import path from "node:path";

const url = process.argv[2] || "http://localhost:3000";
const label = process.argv[3] || "";

const dir = "./temporary screenshots";
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const existing = fs
  .readdirSync(dir)
  .map((f) => f.match(/^screenshot-(\d+)/))
  .filter(Boolean)
  .map((m) => parseInt(m[1], 10));
const n = existing.length ? Math.max(...existing) + 1 : 1;
const fileName = `screenshot-${n}${label ? "-" + label : ""}.png`;
const filePath = path.join(dir, fileName);

const browser = await puppeteer.launch();
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
await page.goto(url, { waitUntil: "networkidle0", timeout: 30000 });
await page.evaluate(() => document.fonts.ready);

// Scroll through the full page first so IntersectionObserver-driven
// reveal/count-up animations trigger before the full-page capture.
// Re-reads scrollHeight each step since font swaps can reflow content.
await page.evaluate(async () => {
  const step = 300;
  let y = 0;
  while (y < document.body.scrollHeight) {
    window.scrollTo(0, y);
    await new Promise((r) => setTimeout(r, 120));
    y += step;
  }
  window.scrollTo(0, document.body.scrollHeight);
  await new Promise((r) => setTimeout(r, 300));
  window.scrollTo(0, 0);
});
await new Promise((r) => setTimeout(r, 800));

await page.screenshot({ path: filePath, fullPage: true });
await browser.close();

console.log(`Saved ${filePath}`);
