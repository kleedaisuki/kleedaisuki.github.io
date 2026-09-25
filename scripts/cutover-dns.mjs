/**
 * 中文：只切换现有 CNAME 的 Cloudflare 代理状态；绝不创建或删除 DNS 记录。
 * English: Switch only an existing CNAME's Cloudflare proxy state; never create or delete DNS records.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

/** 中文：已核实的 Cloudflare zone 与站点 DNS 身份 / Verified zone and site DNS identity. */
export const ZONE_ID = "6edff81c6ed02f412e70868076411a5e";
export const HOST = "atelier.moesegfault.dev";
export const LEGACY_TARGET = "kleedaisuki.github.io";
export const PREVIEW_HOST = "atelier-moesegfault.moesegfault.workers.dev";
const API = `https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records`;
const PAGE = `https://${HOST}/zh/`;
const HEALTH = `https://${HOST}/api/health`;

/**
 * 中文：严格验证单一、可代理的旧站点 CNAME，不接受权限失败或模糊匹配。
 * English: Require exactly one proxiable legacy CNAME; reject permission failures and ambiguity.
 * @param {unknown} payload Cloudflare list response.
 * @returns {{id: string, name: string, type: string, content: string, proxied: boolean, proxiable: boolean}}
 */
export function selectRecord(payload) {
  if (!payload || typeof payload !== "object" || payload.success !== true || !Array.isArray(payload.result)) {
    throw new Error("Cloudflare DNS list failed or returned an invalid response");
  }
  if (payload.result_info?.total_count !== 1 || payload.result.length !== 1) {
    throw new Error("Expected exactly one matching CNAME record");
  }
  const record = payload.result[0];
  if (
    !record ||
    !/^[0-9a-f]{32}$/i.test(record.id) ||
    record.name?.toLowerCase().replace(/\.$/, "") !== HOST ||
    record.type !== "CNAME" ||
    record.content?.toLowerCase().replace(/\.$/, "") !== LEGACY_TARGET ||
    record.proxiable !== true ||
    typeof record.proxied !== "boolean"
  ) {
    throw new Error("DNS record is not the expected legacy CNAME");
  }
  return record;
}

/**
 * 中文：解析 Cloudflare API；不打印包含凭据的请求或完整响应。
 * English: Parse the Cloudflare API without logging credentials or whole responses.
 * @param {Response} response Fetch response.
 * @returns {Promise<unknown>} JSON response.
 */
async function cloudflareJson(response) {
  if (!response.ok) throw new Error(`Cloudflare DNS API returned HTTP ${response.status}; check DNS Read/Write token scope`);
  const payload = await response.json();
  if (payload?.success !== true) throw new Error("Cloudflare DNS API reported failure; check DNS Read/Write token scope");
  return payload;
}

/**
 * 中文：查询精确主机的 CNAME，结果必须独一。
 * English: Query the exact hostname's CNAME and require a unique result.
 * @param {string} token Scoped Cloudflare API token.
 * @param {typeof fetch} fetchImpl Injectable fetch for tests.
 */
export async function getRecord(token, fetchImpl = fetch) {
  const url = new URL(API);
  url.searchParams.set("name.exact", HOST);
  url.searchParams.set("type", "CNAME");
  url.searchParams.set("match", "all");
  url.searchParams.set("per_page", "100");
  const response = await fetchImpl(url, {
    headers: { authorization: `Bearer ${token}` },
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  return selectRecord(await cloudflareJson(response));
}

/**
 * 中文：仅 PATCH `proxied` 字段，并复查响应身份和状态。
 * English: PATCH only `proxied`, then verify the response identity and state.
 * @param {string} token Scoped Cloudflare API token.
 * @param {ReturnType<typeof selectRecord>} record Validated record.
 * @param {boolean} proxied Desired proxy state.
 * @param {typeof fetch} fetchImpl Injectable fetch for tests.
 */
export async function setProxy(token, record, proxied, fetchImpl = fetch) {
  const response = await fetchImpl(`${API}/${record.id}`, {
    method: "PATCH",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ proxied }),
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  const payload = await cloudflareJson(response);
  const updated = payload.result;
  if (
    updated?.id !== record.id ||
    updated?.name?.toLowerCase().replace(/\.$/, "") !== HOST ||
    updated?.type !== "CNAME" ||
    updated?.content?.toLowerCase().replace(/\.$/, "") !== LEGACY_TARGET ||
    updated?.proxied !== proxied
  ) {
    throw new Error("Cloudflare DNS PATCH response did not preserve the expected record");
  }
}

/**
 * 中文：检查静态页面仍是可抓取 HTML，且规范链接未漂移。
 * English: Check the page remains crawlable HTML with the expected canonical URL.
 * @param {string} url Page URL.
 * @param {typeof fetch} fetchImpl Injectable fetch for tests.
 * @returns {Promise<boolean>} True when healthy.
 */
export async function pageHealthy(url, fetchImpl = fetch) {
  const response = await fetchImpl(url, { redirect: "error", signal: AbortSignal.timeout(15000), headers: { "cache-control": "no-cache" } });
  if (!response.ok || !response.headers.get("content-type")?.includes("text/html")) return false;
  const body = await response.text();
  return body.includes(`<link rel="canonical" href="${PAGE}">`) && body.includes("Atelier");
}

/**
 * 中文：只有真实 Rust Worker 的健康响应才算成功。
 * English: Only the Rust Worker's exact health response counts as healthy.
 * @param {string} url Health URL.
 * @param {typeof fetch} fetchImpl Injectable fetch for tests.
 * @returns {Promise<boolean>} True when Worker is active.
 */
export async function workerHealthy(url, fetchImpl = fetch) {
  const response = await fetchImpl(url, { redirect: "error", signal: AbortSignal.timeout(15000), headers: { "cache-control": "no-cache" } });
  if (!response.ok) return false;
  const payload = await response.json().catch(() => null);
  return payload?.ok === true && payload?.service === "atelier-worker";
}

/**
 * 中文：切换流量并重试规范域名检查；失败时不隐式改回 DNS，需人工确认状态。
 * English: Switch traffic and retry canonical checks; a failed check does not silently mutate DNS back.
 * @param {{action: 'activate'|'rollback', token: string, previewUrl?: string, fetchImpl?: typeof fetch, sleep?: (ms: number) => Promise<void>}} options Cutover options.
 */
export async function cutover({ action, token, previewUrl, fetchImpl = fetch, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) }) {
  if (action !== "activate" && action !== "rollback") throw new Error("Action must be activate or rollback");
  if (!token) throw new Error("CLOUDFLARE_API_TOKEN is missing");
  if (action === "activate") {
    const preview = new URL(previewUrl ?? "");
    if (preview.protocol !== "https:" || preview.hostname !== PREVIEW_HOST || preview.username || preview.password || preview.pathname !== "/" || preview.search || preview.hash) {
      throw new Error("ATELIER_WORKER_URL must be the verified HTTPS Worker preview origin");
    }
    if (!(await pageHealthy(new URL("/zh/", preview).href, fetchImpl)) || !(await workerHealthy(new URL("/api/health", preview).href, fetchImpl))) {
      throw new Error("Worker preview health check failed; DNS was not changed");
    }
  }
  const record = await getRecord(token, fetchImpl);
  const desired = action === "activate";
  if (record.proxied !== desired) {
    await setProxy(token, record, desired, fetchImpl);
    process.stdout.write(`DNS proxy set to ${desired} for ${HOST}.\n`);
  } else {
    process.stdout.write(`DNS proxy already ${desired} for ${HOST}; verifying.\n`);
  }
  const confirmed = await getRecord(token, fetchImpl);
  if (confirmed.id !== record.id || confirmed.proxied !== desired) throw new Error("DNS state did not match requested cutover");
  for (let attempt = 0; attempt < 36; attempt += 1) {
    try {
      const page = await pageHealthy(PAGE, fetchImpl);
      const worker = await workerHealthy(HEALTH, fetchImpl);
      if (page && worker === desired) {
        process.stdout.write(`Canonical site verified after ${action}.\n`);
        return;
      }
    } catch {
      // 中文：DNS 与边缘配置传播期间允许短暂失败；达到上限仍然失败。
      // English: Brief failures are expected during DNS/edge propagation, but never ignored past the limit.
    }
    if (attempt < 35) await sleep(10000);
  }
  throw new Error(`Canonical health did not converge after ${action}; inspect DNS and use manual rollback if needed`);
}

/** 中文：仅供人工触发的 GitHub Actions 使用 / Entry point for manually triggered GitHub Actions only. */
async function main() {
  await cutover({
    action: process.env.CUTOVER_ACTION,
    token: process.env.CLOUDFLARE_API_TOKEN,
    previewUrl: process.env.ATELIER_WORKER_URL,
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
