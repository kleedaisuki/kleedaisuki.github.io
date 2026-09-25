/** 中文：通知调度契约测试 / Notification dispatch contract tests. */
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { test } from "node:test";
import {
  changedManifests,
  loadNotification,
  postNotification,
  validateAuthoringContent,
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
  assert.throws(() => validateManifest({ ...draft, format: "guess" }), /format/);
  assert.throws(() => validateManifest({ ...draft, format: "atelier-fragment-v1" }), /text_file/);
  assert.throws(() => validateManifest({ ...draft, text_file: "../secret.txt" }), /sibling/);
  assert.throws(() => validateManifest({ ...draft, text_file: "sub/issue.txt" }), /sibling/);
  assert.deepEqual(validateManifest({ ...draft, format: "document" }), { ...draft, format: "document" });
});

test("selects only manifests referencing a changed text sibling", () => {
  assert.deepEqual(
    changedManifests("notifications/atelier-update.txt\0", {
      "atelier-update.txt": ["notifications/atelier-update.json"],
      "atelier-worker-launch.html": ["notifications/atelier-worker-launch.json"],
    }),
    ["notifications/atelier-update.json"],
  );
});

test("preserves the default legacy document contract", async () => {
  const legacy = await loadNotification("notifications/atelier-worker-launch.json");
  assert.equal(legacy.format, undefined);
  assert.equal(legacy.text, undefined);
  assert.match(legacy.html, /<html/);
  assert.match(legacy.html, /\{\{unsubscribe_url\}\}/);
  assert.doesNotThrow(() => validateAuthoringContent({}, legacy.html, undefined));
  assert.throws(() => validateAuthoringContent({}, "<p>without footer</p>", undefined), /must contain/);
  assert.throws(() => validateAuthoringContent({}, legacy.html, "No footer"), /must contain/);
});

test("fragment requires only issue content and a direct text link", () => {
  const fragment = { format: "atelier-fragment-v1" };
  const text = "A specific article summary worth opening today\nhttps://atelier.moesegfault.dev/zh/articrafts/example/";
  assert.doesNotThrow(() => validateAuthoringContent(fragment, "<h1>Example</h1>", text));
  assert.throws(() => validateAuthoringContent(fragment, "<html><h1>Example</h1></html>", text), /document root/);
  assert.throws(() => validateAuthoringContent(fragment, "<script>x</script>", text), /script or form/);
  assert.throws(() => validateAuthoringContent(fragment, "<form>x</form>", text), /script or form/);
  assert.throws(() => validateAuthoringContent(fragment, "<p>{{unsubscribe_url}}</p>", text), /must not contain/);
  assert.throws(() => validateAuthoringContent(fragment, "<h1>Example</h1>", "{{unsubscribe_url}}"), /must not contain/);
  assert.throws(() => validateAuthoringContent(fragment, "<h1>Example</h1>", "A specific article summary without a reading destination"), /HTTPS/);
  assert.throws(
    () => validateAuthoringContent(fragment, "<h1>Example</h1>", "A specific article summary worth opening today https://atelier.moesegfault.dev/"),
    /HTTPS/,
  );
});

test("loads the unsent, bilingual publication draft without shell or footer", async () => {
  const draft = await loadNotification("notifications/atelier-update.json");
  assert.equal(draft.send, false);
  assert.equal(draft.format, "atelier-fragment-v1");
  assert.doesNotMatch(draft.html, /<html|\{\{unsubscribe_url\}\}/i);
  assert.doesNotMatch(draft.text, /\{\{unsubscribe_url\}\}/);
  assert.match(draft.html, /MPI 之前/);
  assert.match(draft.html, /A 420-configuration study/);
  assert.match(draft.text, /Before MPI:/);
  assert.match(draft.text, /420 种配置/);
  assert.match(draft.html, /https:\/\/atelier\.moesegfault\.dev\/zh\/articrafts\/jacobi-svd-locality-kernel-policy\//);
  assert.match(draft.text, /https:\/\/atelier\.moesegfault\.dev\/zh\/articrafts\/jacobi-svd-locality-kernel-policy\//);
  assert.match(draft.subject, /Atelier/);
});

/** 中文：所有仓库通知在部署前均可解析，避免发布后才发现模板错误。 / Validate every authored notification before deployment. */
test("all notification manifests have unique IDs and valid editable HTML", async () => {
  const names = readdirSync(new URL("../notifications/", import.meta.url)).filter((name) => name.endsWith(".json"));
  const ids = new Set();
  for (const name of names) {
    const notification = await loadNotification(`notifications/${name}`);
    assert(!ids.has(notification.id), `duplicate notification ID: ${notification.id}`);
    if (notification.format === "atelier-fragment-v1") {
      assert.doesNotMatch(notification.html, /\{\{unsubscribe_url\}\}/);
      assert(notification.text);
    } else {
      assert.match(notification.html, /\{\{unsubscribe_url\}\}/);
    }
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

test("posts the optional fragment format and authored text without changing send:false", async () => {
  const draft = await loadNotification("notifications/atelier-update.json");
  await postNotification("https://atelier.example.test", "secret", draft, async (_url, options) => {
    const body = JSON.parse(options.body);
    assert.deepEqual(Object.keys(body).sort(), ["format", "html", "id", "send", "subject", "text"]);
    assert.equal(body.format, "atelier-fragment-v1");
    assert.equal(body.send, false);
    assert.equal(body.text, draft.text);
    return { ok: true };
  });
});

test("rejects insecure origins and API conflicts", async () => {
  const payload = { id: "update-1", subject: "Update", html: "<p>Hi</p>", send: true };
  await assert.rejects(postNotification("http://atelier.example.test", "secret", payload), /HTTPS/);
  await assert.rejects(
    postNotification("https://atelier.example.test", "secret", payload, async () => ({ ok: false, status: 409 })),
    /HTTP 409/,
  );
});
