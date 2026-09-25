/** 中文：通知调度契约测试 / Notification dispatch contract tests. */
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { test } from "node:test";
import {
  changedManifests,
  loadNotification,
  postNotification,
  validateManifest,
} from "../scripts/dispatch-notifications.mjs";

test("selects changed manifests only, de-duplicated and sorted", () => {
  assert.deepEqual(
    changedManifests(
      "notifications/z.json\0notifications/a.json\0notifications/z.json\0notifications/a.html\0src/else.json\0",
      { "a.html": ["notifications/a.json", "notifications/b.json"] },
    ),
    ["notifications/a.json", "notifications/b.json", "notifications/z.json"],
  );
});

test("requires explicit send boolean and safe sibling HTML path", () => {
  const draft = { id: "update-1", subject: "Update", html_file: "update.html", send: false };
  assert.deepEqual(validateManifest(draft), draft);
  assert.throws(() => validateManifest({ ...draft, send: "false" }), /boolean/);
  assert.throws(() => validateManifest({ ...draft, html_file: "../secret.html" }), /sibling/);
  assert.throws(() => validateManifest({ ...draft, id: "x/y" }), /slug/);
  assert.throws(() => validateManifest({ ...draft, subject: "a".repeat(161) }), /160/);
});

test("loads an editable HTML draft without implicitly enabling send", async () => {
  const draft = await loadNotification("notifications/atelier-update.json");
  assert.equal(draft.send, false);
  assert.match(draft.html, /<html/);
  assert.match(draft.html, /\{\{unsubscribe_url\}\}/);
  assert.match(draft.subject, /Atelier/);
});

/** 中文：所有仓库通知在部署前均可解析，避免发布后才发现模板错误。 / Validate every authored notification before deployment. */
test("all notification manifests have unique IDs and valid editable HTML", async () => {
  const names = readdirSync(new URL("../notifications/", import.meta.url)).filter((name) => name.endsWith(".json"));
  const ids = new Set();
  for (const name of names) {
    const notification = await loadNotification(`notifications/${name}`);
    assert(!ids.has(notification.id), `duplicate notification ID: ${notification.id}`);
    assert.match(notification.html, /\{\{unsubscribe_url\}\}/);
    ids.add(notification.id);
  }
  assert(names.length > 0);
});

test("posts the exact JSON contract with bearer auth and no redirect", async () => {
  const payload = { id: "update-1", subject: "Update", html: "<p>Hi</p>", send: false };
  let called = false;
  await postNotification("https://atelier.example.test", "secret", payload, async (url, options) => {
    called = true;
    assert.equal(url.href, "https://atelier.example.test/api/admin/notify");
    assert.equal(options.headers.authorization, "Bearer secret");
    assert.equal(options.redirect, "error");
    assert.deepEqual(JSON.parse(options.body), payload);
    return { ok: true };
  });
  assert.equal(called, true);
});

test("rejects insecure origins and API conflicts", async () => {
  const payload = { id: "update-1", subject: "Update", html: "<p>Hi</p>", send: true };
  await assert.rejects(postNotification("http://atelier.example.test", "secret", payload), /HTTPS/);
  await assert.rejects(
    postNotification("https://atelier.example.test", "secret", payload, async () => ({ ok: false, status: 409 })),
    /HTTP 409/,
  );
});
