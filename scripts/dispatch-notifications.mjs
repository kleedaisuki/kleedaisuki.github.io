/**
 * 中文：仅发布本次 main 推送改动过的通知清单，不将令牌或 HTML 写入日志。
 * English: Dispatch only notification manifests changed by this main push; never log token or HTML.
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** 中文：通知目录与部署脚本同仓库 / Notification root in this repository. */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPattern = /^notifications\/[A-Za-z0-9][A-Za-z0-9._-]*\.json$/;
const htmlPattern = /^notifications\/[A-Za-z0-9][A-Za-z0-9._-]*\.html$/;
const textPattern = /^notifications\/[A-Za-z0-9][A-Za-z0-9._-]*\.txt$/;
const siblingTextPattern = /^[A-Za-z0-9][A-Za-z0-9._-]*\.txt$/;

/**
 * 中文：验证单条通知的声明和 HTML 路径，拒绝目录穿越。
 * English: Validate one notification declaration and its HTML path; reject path traversal.
 * @param {unknown} value Parsed manifest value.
 * @returns {{id: string, subject: string, html_file: string, send: boolean, format?: string, text_file?: string}}
 */
export function validateManifest(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Notification manifest must be an object");
  }
  const { id, subject, html_file: htmlFile, send, format, text_file: textFile } = value;
  if (typeof id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(id)) {
    throw new Error("Notification id must be a stable 1–128 character slug");
  }
  if (typeof subject !== "string" || subject.trim().length < 1 || subject.length > 160) {
    throw new Error("Notification subject must contain 1–160 characters");
  }
  if (typeof htmlFile !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]*\.html$/.test(htmlFile)) {
    throw new Error("html_file must be a sibling .html filename");
  }
  if (typeof send !== "boolean") {
    throw new Error("Notification send must be a boolean");
  }
  if (format !== undefined && format !== "document" && format !== "atelier-fragment-v1") {
    throw new Error("Unknown notification format");
  }
  if (textFile !== undefined && (typeof textFile !== "string" || !siblingTextPattern.test(textFile))) {
    throw new Error("text_file must be a sibling .txt filename");
  }
  if (format === "atelier-fragment-v1" && textFile === undefined) {
    throw new Error("atelier-fragment-v1 requires text_file");
  }
  return {
    id,
    subject,
    html_file: htmlFile,
    send,
    ...(format === undefined ? {} : { format }),
    ...(textFile === undefined ? {} : { text_file: textFile }),
  };
}

/**
 * 中文：检查显式格式的作者输入；旧文档保持原有占位符契约。
 * English: Check explicit authoring formats while preserving the legacy document placeholder contract.
 * @param {{format?: string}} manifest Validated manifest.
 * @param {string} html Authored HTML.
 * @param {string | undefined} authoredText Optional authored text.
 */
export function validateAuthoringContent(manifest, html, authoredText) {
  if (!html.trim()) throw new Error("Notification HTML must not be empty");
  if (manifest.format !== "atelier-fragment-v1") {
    if (!html.includes("{{unsubscribe_url}}")) throw new Error("Notification HTML must contain {{unsubscribe_url}}");
    if (authoredText !== undefined && (!authoredText.trim() || !authoredText.includes("{{unsubscribe_url}}"))) {
      throw new Error("Legacy notification text must contain {{unsubscribe_url}}");
    }
    return;
  }
  if (/(?:<!doctype\b|<\/?(?:html|head|body)\b)/i.test(html)) {
    throw new Error("Atelier fragment must not contain a document root");
  }
  if (/<\s*\/?\s*(?:script|form)\b/i.test(html)) {
    throw new Error("Atelier fragment must not contain script or form elements");
  }
  if (html.includes("{{unsubscribe_url}}") || authoredText?.includes("{{unsubscribe_url}}")) {
    throw new Error("Atelier authored content must not contain {{unsubscribe_url}}");
  }
  if (authoredText === undefined || [...authoredText.trim()].length < 40 || Buffer.byteLength(authoredText) > 16_384) {
    throw new Error("Atelier fragment requires bounded, nonempty text");
  }
  const hasContentUrl = authoredText.split(/\s+/).some((part) => {
    try {
      const url = new URL(part.replace(/^[<(]+|[>),.，。]+$/g, ""));
      return url.protocol === "https:" && url.hostname && !url.username && !url.password && url.pathname !== "/";
    } catch {
      return false;
    }
  });
  if (!hasContentUrl) {
    throw new Error("Atelier text must include a direct HTTPS content URL");
  }
}

/**
 * 中文：从 Git 路径列表挑选清单，删除项不触发发送。
 * English: Select manifests from changed Git paths; deletions never trigger sends.
 * @param {string} changedPaths NUL-separated paths from git diff.
 * @param {Record<string, string[]>} manifestsByAsset Paths of manifests referencing each HTML or text filename.
 * @returns {string[]} Relative manifest paths.
 */
export function changedManifests(changedPaths, manifestsByAsset = {}) {
  const selected = new Set();
  for (const entry of changedPaths.split("\0")) {
    if (manifestPattern.test(entry)) selected.add(entry);
    if (htmlPattern.test(entry) || textPattern.test(entry)) {
      for (const manifest of manifestsByAsset[path.basename(entry)] ?? []) selected.add(manifest);
    }
  }
  return [...selected].sort();
}

/**
 * 中文：索引 HTML 和文本素材到引用它们的清单；单改文本也要更新草稿。
 * English: Index HTML and text assets to referencing manifests so text-only edits update drafts.
 * @returns {Record<string, string[]>} Asset filename to manifest paths.
 */
function manifestAssetIndex() {
  const index = {};
  for (const name of readdirSync(path.join(repoRoot, "notifications"))) {
    const relativePath = `notifications/${name}`;
    if (!manifestPattern.test(relativePath)) continue;
    const manifest = validateManifest(JSON.parse(readFileSync(path.join(repoRoot, relativePath), "utf8")));
    (index[manifest.html_file] ??= []).push(relativePath);
    if (manifest.text_file) (index[manifest.text_file] ??= []).push(relativePath);
  }
  return index;
}

/**
 * 中文：使用提交范围确定已更改清单，失败时宁可中止也不误发全量通知。
 * English: Derive changed manifests from commit range; fail closed instead of sending all.
 * @param {string} base Previous main commit SHA.
 * @param {string} head Current commit SHA.
 * @returns {string[]} Changed manifest paths.
 */
export function changedManifestsBetween(base, head) {
  if (!/^[0-9a-f]{40}$/.test(base) || !/^[0-9a-f]{40}$/.test(head)) {
    throw new Error("Expected full Git commit SHAs for notification diff");
  }
  const output = execFileSync("git", ["diff", "--name-only", "-z", "--diff-filter=ACMRT", base, head, "--", "notifications"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  return changedManifests(output, manifestAssetIndex());
}

/**
 * 中文：读取清单及其同目录内容；显式格式交由 Worker 构建共享外壳。
 * English: Load sibling assets; the Worker builds the shared shell for explicit fragments.
 * @param {string} relativePath Manifest path under notifications/.
 * @returns {Promise<{id: string, subject: string, html: string, send: boolean, format?: string, text?: string}>}
 */
export async function loadNotification(relativePath) {
  if (!manifestPattern.test(relativePath)) throw new Error("Invalid manifest path");
  const manifest = validateManifest(JSON.parse(await readFile(path.join(repoRoot, relativePath), "utf8")));
  const html = await readFile(path.join(repoRoot, "notifications", manifest.html_file), "utf8");
  const authoredText = manifest.text_file
    ? await readFile(path.join(repoRoot, "notifications", manifest.text_file), "utf8")
    : undefined;
  validateAuthoringContent(manifest, html, authoredText);
  return {
    id: manifest.id,
    subject: manifest.subject,
    html,
    send: manifest.send,
    ...(manifest.format === undefined ? {} : { format: manifest.format }),
    ...(authoredText === undefined ? {} : { text: authoredText }),
  };
}

/**
 * 中文：把清单提交给受保护的 Rust Worker；非 2xx 响应视为发布失败。
 * English: Submit a manifest to the protected Rust Worker; non-2xx responses fail deployment.
 * @param {string} baseUrl Worker origin URL.
 * @param {string} token Admin bearer token.
 * @param {{id: string, subject: string, html: string, send: boolean, format?: string, text?: string}} notification Validated payload.
 * @param {typeof fetch} fetchImpl Injectable fetch for tests.
 */
export async function postNotification(baseUrl, token, notification, fetchImpl = fetch) {
  const origin = new URL(baseUrl);
  if (origin.protocol !== "https:" || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== "/") {
    throw new Error("ATELIER_WORKER_URL must be a clean HTTPS URL");
  }
  const url = new URL("/api/admin/notify", origin);
  if (!token) throw new Error("ATELIER_NOTIFY_TOKEN is missing");
  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(notification),
    redirect: "error",
  });
  if (!response.ok) throw new Error(`Notification API returned HTTP ${response.status}`);
}

/** 中文：CI 入口 / CI entry point. */
async function main() {
  const paths = changedManifestsBetween(process.env.NOTIFY_BASE_SHA ?? "", process.env.GITHUB_SHA ?? "");
  if (paths.length === 0) {
    process.stdout.write("No changed notification manifests.\n");
    return;
  }
  const baseUrl = process.env.ATELIER_WORKER_URL;
  const token = process.env.ATELIER_NOTIFY_TOKEN;
  if (!baseUrl || !token) throw new Error("Notification endpoint URL or token is missing");
  for (const relativePath of paths) {
    const notification = await loadNotification(relativePath);
    await postNotification(baseUrl, token, notification);
    process.stdout.write(`Accepted notification ${notification.id} (send=${notification.send}).\n`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
