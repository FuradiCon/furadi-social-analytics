import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(root, "app.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const helpers = source.slice(
  source.indexOf("/* ---------- All-accounts attention summary ---------- */"),
  source.indexOf("/* ---------- All accounts at once ---------- */")
);

function htmlEscaper() {
  let value = "";
  return {
    set textContent(next) { value = String(next); },
    get innerHTML() {
      return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    },
  };
}

const context = { document: { createElement: htmlEscaper } };
vm.runInNewContext(`
  function fmtInt(value){ return Number(value || 0).toLocaleString('en-US'); }
  function escapeHtml(value){ const el = document.createElement('div'); el.textContent = value == null ? '' : value; return el.innerHTML; }
  function isIG(account){ return String(account.platform || '').toLowerCase() === 'instagram'; }
  function isTraffic(account){ return account.kind === 'traffic'; }
  function platformLabel(account){ return [account.platform, account.accountType].filter(Boolean).join(' · ').toUpperCase() || 'ACCOUNT'; }
  ${helpers}
  globalThis.__attentionSummary = { buildAttentionRows, attentionSummaryHtml };
`, context);

const { buildAttentionRows, attentionSummaryHtml } = context.__attentionSummary;
const plain = value => JSON.parse(JSON.stringify(value));
const rows = buildAttentionRows([
  {
    name: "Steadfast Counter",
    kind: "traffic",
    platform: "Steadfast Counter",
    accountType: "Website",
    data: [{ views: 12 }, { views: 30 }],
  },
  {
    name: "Furad Ride",
    platform: "YouTube",
    accountType: "Channel",
    hasNewComments: true,
    data: [
      { views: 20, min: 60, likes: 2, comments: 1, shares: 0, subG: 3, subL: 1 },
      { views: 40, min: 60, likes: 3, comments: 1, shares: 0, subG: 2, subL: 0 },
    ],
    prior: { views: 100, min: 150, netSub: 1 },
  },
  {
    name: "<Furadi>",
    platform: "Instagram",
    accountType: "Profile",
    totals: { posts: 2, likes: 100, comments: 20 },
    priorTotals: { posts: 1, likes: 60, comments: 20 },
  },
]);

assert.deepEqual(rows.map(row => row.name), ["Furad Ride", "<Furadi>", "Steadfast Counter"]);
assert.deepEqual(plain(rows[0].reasons), ["Needs reply: new comments", "Views down 40%"]);
assert.deepEqual(plain(rows[0].activity), { label: "Views", value: "60" });
assert.deepEqual(plain(rows[0].watchTime), { label: "Watch time", value: "2h 0m" });
assert.deepEqual(plain(rows[0].engagement), { label: "Engagement", value: "7" });
assert.deepEqual(plain(rows[0].audienceChange), { label: "Subscriber change", value: "+4" });
assert.deepEqual(plain(rows[1].activity), { label: "Posts", value: "2" });
assert.equal(rows[1].watchTime.value, "—");
assert.deepEqual(plain(rows[1].engagement), { label: "Engagement", value: "120" });
assert.equal(rows[1].audienceChange.value, "—");
assert.equal(rows[1].trend.label, "Engagement up 50%");
assert.deepEqual(plain(rows[2].activity), { label: "Page views", value: "42" });
assert.equal(rows[2].watchTime.value, "—");
assert.equal(rows[2].engagement.value, "—");
assert.equal(rows[2].audienceChange.value, "—");

const reasonOrderedRows = buildAttentionRows([
  {
    name: "Local decline",
    platform: "YouTube",
    accountType: "Channel",
    data: [{ views: 50, min: 0, likes: 0, comments: 0, shares: 0, subG: 0, subL: 0 }],
    prior: { views: 100 },
  },
  {
    name: "Positive metadata",
    platform: "YouTube",
    accountType: "Channel",
    attentionReasons: ["Best period in 28 days"],
    data: [{ views: 10, min: 0, likes: 0, comments: 0, shares: 0, subG: 0, subL: 0 }],
  },
  {
    name: "Generated decline",
    platform: "YouTube",
    accountType: "Channel",
    attentionReasons: ["Views down 12%"],
    data: [{ views: 10, min: 0, likes: 0, comments: 0, shares: 0, subG: 0, subL: 0 }],
  },
  {
    name: "Generated reply",
    platform: "YouTube",
    accountType: "Channel",
    attentionReasons: ["Needs reply: new comments"],
    data: [{ views: 10, min: 0, likes: 0, comments: 0, shares: 0, subG: 0, subL: 0 }],
  },
]);

assert.deepEqual(reasonOrderedRows.map(row => row.name), [
  "Generated reply",
  "Generated decline",
  "Local decline",
  "Positive metadata",
]);
assert.equal(reasonOrderedRows[0].attentionPriority, 0);
assert.equal(reasonOrderedRows[1].attentionPriority, 1);

const fallbackTrendRows = buildAttentionRows([
  {
    name: "Neutral comparison",
    platform: "YouTube",
    accountType: "Channel",
    data: [{ views: 100, min: 0, likes: 0, comments: 0, shares: 0, subG: 0, subL: 0 }],
    prior: { views: 100 },
  },
  {
    name: "Positive 20",
    platform: "YouTube",
    accountType: "Channel",
    data: [{ views: 120, min: 0, likes: 0, comments: 0, shares: 0, subG: 0, subL: 0 }],
    prior: { views: 100 },
  },
  {
    name: "Positive 50",
    platform: "YouTube",
    accountType: "Channel",
    data: [{ views: 150, min: 0, likes: 0, comments: 0, shares: 0, subG: 0, subL: 0 }],
    prior: { views: 100 },
  },
  {
    name: "No comparison",
    platform: "YouTube",
    accountType: "Channel",
    data: [{ views: 75, min: 0, likes: 0, comments: 0, shares: 0, subG: 0, subL: 0 }],
  },
]);

assert.deepEqual(fallbackTrendRows.map(row => row.name), [
  "Positive 50",
  "Positive 20",
  "Neutral comparison",
  "No comparison",
]);

const availabilityRows = buildAttentionRows([
  {
    name: "Legitimate zeros",
    platform: "YouTube",
    accountType: "Channel",
    data: [{ views: 0, min: 0, likes: 0, comments: 0, shares: 0, subG: 0, subL: 0 }],
  },
  {
    name: "Incomplete YouTube",
    platform: "YouTube",
    accountType: "Channel",
    data: [
      { views: 0, min: 0, likes: 0, comments: 0, shares: 0, subG: 0, subL: 0 },
      { views: 5, min: 5, likes: 2, comments: 1, subG: 1 },
    ],
  },
  {
    name: "Incomplete Instagram",
    platform: "Instagram",
    accountType: "Profile",
    totals: { posts: 1, likes: 4 },
  },
]);

const zeroRow = availabilityRows.find(row => row.name === "Legitimate zeros");
assert.deepEqual(plain(zeroRow.activity), { label: "Views", value: "0" });
assert.deepEqual(plain(zeroRow.watchTime), { label: "Watch time", value: "0h 0m" });
assert.deepEqual(plain(zeroRow.engagement), { label: "Engagement", value: "0" });
assert.deepEqual(plain(zeroRow.audienceChange), { label: "Subscriber change", value: "+0" });
const incompleteYoutube = availabilityRows.find(row => row.name === "Incomplete YouTube");
assert.equal(incompleteYoutube.activity.value, "5");
assert.equal(incompleteYoutube.engagement.value, "—");
assert.equal(incompleteYoutube.audienceChange.value, "—");
const incompleteInstagram = availabilityRows.find(row => row.name === "Incomplete Instagram");
assert.equal(incompleteInstagram.engagement.value, "—");

const html = attentionSummaryHtml(rows);
assert.match(html, /<table/);
assert.match(html, /scope="col"/);
assert.match(html, /data-account-index="1"/);
assert.match(html, /Open Furad Ride account/);
assert.match(html, /&lt;Furadi&gt;/);
assert.match(html, />—</);
assert.match(html, /data-label="Attention"/);

const mobileStyles = styles.slice(styles.indexOf("@media (max-width: 760px){"));
assert.match(mobileStyles, /\.attention-summary-table\{ min-width: 0; width: 100%; \}/);
assert.doesNotMatch(mobileStyles, /\.attention-summary-table[^}]*position: sticky/);

console.log("attention summary fixture passed");
