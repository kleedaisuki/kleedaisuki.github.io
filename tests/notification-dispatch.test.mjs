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
  waitForFragmentSupport,
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

test("waits for the new Worker health capability after a stale edge response", async () => {
  let probes = 0;
  let pauses = 0;
  await waitForFragmentSupport(
    "https://atelier.example.test",
    async (url, options) => {
      probes += 1;
      assert.equal(url.href, "https://atelier.example.test/api/health");
      assert.equal(options.method, "GET");
      assert.equal(options.cache, "no-store");
      assert.equal(options.redirect, "error");
      assert(options.signal instanceof AbortSignal);
      assert.equal(options.headers, undefined);
      return {
        ok: true,
        json: async () => ({
          ok: true,
          service: "atelier-mailroom",
          mail_formats: probes === 1 ? ["document"] : ["document", "atelier-fragment-v1"],
        }),
      };
    },
    async (milliseconds) => {
      assert.equal(milliseconds, 2_000);
      pauses += 1;
    },
    3,
  );
  assert.equal(probes, 2);
  assert.equal(pauses, 1);
});

test("fails closed when the new Worker capability never appears", async () => {
  let probes = 0;
  await assert.rejects(
    waitForFragmentSupport(
      "https://atelier.example.test",
      async () => {
        probes += 1;
        return { ok: true, json: async () => ({ ok: true, mail_formats: ["document"] }) };
      },
      async () => {},
      3,
    ),
    /did not advertise atelier-fragment-v1 after 3 health probes/,
  );
  assert.equal(probes, 3);
});

test("retries only fragment 400 responses and preserves one immutable payload", async () => {
  const draft = await loadNotification("notifications/atelier-update.json");
  const bodies = [];
  let pauses = 0;
  await postNotification(
    "https://atelier.example.test",
    "secret",
    { ...draft, send: true },
    async (_url, options) => {
      bodies.push(options.body);
      return { ok: bodies.length === 2, status: bodies.length === 2 ? 200 : 400 };
    },
    async () => { pauses += 1; },
  );
  assert.equal(bodies.length, 2);
  assert.equal(pauses, 1);
  assert.equal(bodies[0], bodies[1]);
  assert.equal(JSON.parse(bodies[0]).send, true);
});

test("a permanent fragment 400 fails after the bounded retry; legacy 400 never retries", async () => {
  const draft = await loadNotification("notifications/atelier-update.json");
  let calls = 0;
  const reject400 = async () => {
    calls += 1;
    return { ok: false, status: 400 };
  };
  await assert.rejects(postNotification("https://atelier.example.test", "secret", draft, reject400, async () => {}), /HTTP 400/);
  assert.equal(calls, 5);
  calls = 0;
  await assert.rejects(
    postNotification("https://atelier.example.test", "secret", { id: "old", send: true }, reject400, async () => {}),
    /HTTP 400/,
  );
  assert.equal(calls, 1);
});

test("does not retry ambiguous send:true failures", async () => {
  const draft = await loadNotification("notifications/atelier-update.json");
  let calls = 0;
  await assert.rejects(
    postNotification("https://atelier.example.test", "secret", { ...draft, send: true }, async () => {
      calls += 1;
      throw new Error("connection closed after request");
    }),
    /connection closed/,
  );
  assert.equal(calls, 1);
  await assert.rejects(
    postNotification("https://atelier.example.test", "secret", { ...draft, send: true }, async () => {
      calls += 1;
      return { ok: false, status: 500 };
    }),
    /HTTP 500/,
  );
  assert.equal(calls, 2);
});

test("rejects insecure origins and API conflicts", async () => {
  const payload = { id: "update-1", subject: "Update", html: "<p>Hi</p>", send: true };
  await assert.rejects(postNotification("http://atelier.example.test", "secret", payload), /HTTPS/);
  await assert.rejects(
    postNotification("https://atelier.example.test", "secret", payload, async () => ({ ok: false, status: 409 })),
    /HTTP 409/,
  );
});
