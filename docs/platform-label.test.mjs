import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const railSource = fs.readFileSync(path.join(root, "rail.js"), "utf8");
const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
const indexSource = fs.readFileSync(path.join(root, "index.html"), "utf8");
const stylesSource = fs.readFileSync(path.join(root, "styles.css"), "utf8");

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
vm.runInNewContext(`${railSource}\nglobalThis.__platformLabelTest = { platformLabel, railItemHtml };`, context);
const { platformLabel, railItemHtml } = context.__platformLabelTest;

const accounts = [
  { name: "Steadfast Counter", platform: "Steadfast Counter", accountType: "Website", kind: "traffic", data: [] },
  { name: "Furad Ride", platform: "YouTube", accountType: "Channel", data: [] },
  { name: "@_furadi_", platform: "Instagram", accountType: "Profile", data: [] },
];
const expectedLabels = [
  "STEADFAST COUNTER · WEBSITE",
  "YOUTUBE · CHANNEL",
  "INSTAGRAM · PROFILE",
];

assert.deepEqual(accounts.map(platformLabel), expectedLabels);
assert.equal(platformLabel({}), "ACCOUNT");

accounts.forEach((account, index) => {
  assert.match(railItemHtml(account, index), new RegExp(`account-platform-label[^>]*>${expectedLabels[index]}`));
});

assert.match(indexSource, /active-account-platform-label/);
assert.match(appSource, /active-account-platform-label/);
assert.match(appSource, /platformLabel\(ch\)/);
assert.match(appSource, /viewall-channel[\s\S]*account-platform-label/);
assert.match(stylesSource, /\.account-platform-label[\s\S]*color:\s*var\(--text-secondary\)/);
assert.match(stylesSource, /\.account-platform-label[\s\S]*text-transform:\s*uppercase/);

console.log("platform label renderer fixture passed");
