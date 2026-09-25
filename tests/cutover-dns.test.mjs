/** 中文：DNS 切换安全契约测试 / DNS cutover safety contract tests. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { cutover, getRecord, HOST, LEGACY_TARGET, selectRecord, setProxy, ZONE_ID } from "../scripts/cutover-dns.mjs";

/** 中文：可重用的已验证记录 / Reusable verified record. */
const record = {
  id: "a".repeat(32),
  name: HOST,
  type: "CNAME",
  content: LEGACY_TARGET,
  proxiable: true,
  proxied: false,
};

/** 中文：Cloudflare JSON 响应 / Cloudflare JSON response. */
const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json" },
});

test("accepts exactly one legacy CNAME and trailing-dot target", () => {
  const value = { ...record, content: `${LEGACY_TARGET}.` };
  assert.deepEqual(selectRecord({ success: true, result: [value], result_info: { total_count: 1 } }), value);
  assert.throws(() => selectRecord({ success: true, result: [value, value], result_info: { total_count: 2 } }), /exactly one/);
  assert.throws(() => selectRecord({ success: false, result: [value] }), /failed/);
  assert.throws(() => selectRecord({ success: true, result: [{ ...value, content: "attacker.example" }], result_info: { total_count: 1 } }), /expected legacy/);
});

test("queries exact host and fails closed on missing DNS permission", async () => {
  let requested;
  const fetchImpl = async (url) => {
    requested = new URL(url);
    return jsonResponse({ success: false, errors: [{ code: 10000 }] }, 403);
  };
  await assert.rejects(getRecord("token", fetchImpl), /HTTP 403/);
  assert.equal(requested.pathname, `/client/v4/zones/${ZONE_ID}/dns_records`);
  assert.equal(requested.searchParams.get("name.exact"), HOST);
  assert.equal(requested.searchParams.get("type"), "CNAME");
  assert.equal(requested.searchParams.get("match"), "all");
});

test("PATCH changes only proxied and rejects identity drift", async () => {
  const fetchImpl = async (url, options) => {
    assert.equal(url, `https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records/${record.id}`);
    assert.equal(options.method, "PATCH");
    assert.deepEqual(JSON.parse(options.body), { proxied: true });
    return jsonResponse({ success: true, result: { ...record, proxied: true } });
  };
  await setProxy("token", record, true, fetchImpl);
  await assert.rejects(
    setProxy("token", record, true, async () => jsonResponse({ success: true, result: { ...record, content: "wrong.example", proxied: true } })),
    /did not preserve/,
  );
});

test("activation requires preview health before any DNS request", async () => {
  const calls = [];
  await assert.rejects(
    cutover({
      action: "activate",
      token: "token",
      previewUrl: "https://atelier-moesegfault.moesegfault.workers.dev/",
      fetchImpl: async (url) => {
        calls.push(new URL(url).pathname);
        return new Response("Unavailable", { status: 503 });
      },
    }),
    /preview health check failed/,
  );
  assert.deepEqual(calls, ["/zh/"]);
});

test("activation patches DNS after preview checks and verifies canonical Worker", async () => {
  const calls = [];
  let proxied = false;
  const fetchImpl = async (url, options = {}) => {
    const parsed = new URL(url);
    calls.push(`${options.method ?? "GET"} ${parsed.hostname}${parsed.pathname}`);
    if (parsed.hostname === "api.cloudflare.com") {
      if (options.method === "PATCH") {
        assert.deepEqual(JSON.parse(options.body), { proxied: true });
        proxied = true;
        return jsonResponse({ success: true, result: { ...record, proxied } });
      }
      return jsonResponse({ success: true, result: [{ ...record, proxied }], result_info: { total_count: 1 } });
    }
    if (parsed.pathname === "/api/health") return jsonResponse({ ok: true, service: "atelier-worker" });
    return new Response(`<link rel="canonical" href="https://${HOST}/zh/"><main>Atelier</main>`, {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  };
  await cutover({
    action: "activate",
    token: "token",
    previewUrl: "https://atelier-moesegfault.moesegfault.workers.dev/",
    fetchImpl,
    sleep: async () => {},
  });
  assert.equal(proxied, true);
  assert.deepEqual(calls.slice(0, 3), [
    "GET atelier-moesegfault.moesegfault.workers.dev/zh/",
    "GET atelier-moesegfault.moesegfault.workers.dev/api/health",
    "GET api.cloudflare.com/client/v4/zones/6edff81c6ed02f412e70868076411a5e/dns_records",
  ]);
  assert(calls.includes(`GET ${HOST}/api/health`));
});

test("rollback only disables proxy and requires canonical page without Worker API", async () => {
  let proxied = true;
  const fetchImpl = async (url, options = {}) => {
    const parsed = new URL(url);
    if (parsed.hostname === "api.cloudflare.com") {
      if (options.method === "PATCH") {
        assert.deepEqual(JSON.parse(options.body), { proxied: false });
        proxied = false;
        return jsonResponse({ success: true, result: { ...record, proxied } });
      }
      return jsonResponse({ success: true, result: [{ ...record, proxied }], result_info: { total_count: 1 } });
    }
    if (parsed.pathname === "/api/health") return new Response("Not found", { status: 404 });
    return new Response(`<link rel="canonical" href="https://${HOST}/zh/"><main>Atelier</main>`, {
      headers: { "content-type": "text/html" },
    });
  };
  await cutover({ action: "rollback", token: "token", fetchImpl, sleep: async () => {} });
  assert.equal(proxied, false);
});
