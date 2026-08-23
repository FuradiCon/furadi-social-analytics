import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import vm from "node:vm";

function createLocalStorageStub(){
  const store = new Map();
  return {
    getItem(key){ return store.has(key) ? store.get(key) : null; },
    setItem(key, value){ store.set(key, String(value)); },
    removeItem(key){ store.delete(key); },
    _store: store,
  };
}

async function loadDashboardContext(){
  const localStorage = createLocalStorageStub();
  const context = {
    Date,
    Intl,
    Math,
    console,
    localStorage,
    clearTimeout(){},
    setTimeout(){ return 0; },
    location: { reload(){} },
    window: { matchMedia(){ return { matches: true }; } },
    document: {
      addEventListener(){},
      createElement(tag){
        return {
          textContent: '',
          get innerHTML(){
            const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };
            return this.textContent.replace(/[&<>]/g, c => map[c]);
          }
        };
      }
    },
  };
  context.globalThis = context;
  vm.createContext(context);

  for(const script of ["rail.js", "app.js"]){
    vm.runInContext(await readFile(new URL(script, import.meta.url), "utf8"), context, { filename: script });
  }
  return { context, localStorage };
}

test("dismissComments persists ids and isCommentDismissed reflects them", async () => {
  const { context, localStorage } = await loadDashboardContext();

  assert.equal(context.isCommentDismissed("abc"), false);

  const changed = context.dismissComments(["abc", "def"]);
  assert.equal(changed, true);
  assert.equal(context.isCommentDismissed("abc"), true);
  assert.equal(context.isCommentDismissed("def"), true);
  assert.equal(context.isCommentDismissed("ghi"), false);

  const persisted = JSON.parse(localStorage.getItem("furadiDismissedComments"));
  assert.deepEqual(persisted.sort(), ["abc", "def"]);

  // Re-dismissing already-dismissed ids is a no-op, not an error.
  const changedAgain = context.dismissComments(["abc"]);
  assert.equal(changedAgain, false);
});

test("a fresh context picks up previously persisted dismissals", async () => {
  const localStorage = createLocalStorageStub();
  localStorage.setItem("furadiDismissedComments", JSON.stringify(["already-dismissed"]));
  const context = {
    Date, Intl, Math, console, localStorage,
    clearTimeout(){}, setTimeout(){ return 0; },
    location: { reload(){} },
    window: { matchMedia(){ return { matches: true }; } },
    document: {
      addEventListener(){},
      createElement(tag){
        return {
          textContent: '',
          get innerHTML(){
            const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };
            return this.textContent.replace(/[&<>]/g, c => map[c]);
          }
        };
      }
    },
  };
  context.globalThis = context;
  vm.createContext(context);
  for(const script of ["rail.js", "app.js"]){
    vm.runInContext(await readFile(new URL(script, import.meta.url), "utf8"), context, { filename: script });
  }

  assert.equal(context.isCommentDismissed("already-dismissed"), true);
  assert.equal(context.isCommentDismissed("never-touched"), false);
});

test("commentsHtml treats a dismissed comment as no longer awaiting", async () => {
  const { context } = await loadDashboardContext();
  const ch = {
    slug: "test-channel",
    comments: [
      { id: "still-open", author: "A", text: "Hi", likes: 1, publishedAt: "2026-08-20T12:00:00Z", awaitingReply: true, videoUrl: "https://example.com/a" },
      { id: "will-dismiss", author: "B", text: "Hey", likes: 2, publishedAt: "2026-08-21T12:00:00Z", awaitingReply: true, videoUrl: "https://example.com/b" },
    ],
  };

  assert.deepEqual(context.channelAwaitingCommentIds(ch).sort(), ["still-open", "will-dismiss"]);
  assert.equal(context.channelHasAwaitingComments(ch), true);

  const beforeHtml = context.commentsHtml(ch);
  assert.match(beforeHtml, /Needs reply/g);
  const beforeFlagCount = (beforeHtml.match(/comment-flag/g) || []).length;
  assert.equal(beforeFlagCount, 2);

  context.dismissComments(["will-dismiss"]);

  assert.equal(context.channelHasAwaitingComments(ch), true); // "still-open" remains
  const afterHtml = context.commentsHtml(ch);
  const afterFlagCount = (afterHtml.match(/comment-flag/g) || []).length;
  assert.equal(afterFlagCount, 1);

  context.dismissComments(["still-open"]);
  assert.equal(context.channelHasAwaitingComments(ch), false);
});
