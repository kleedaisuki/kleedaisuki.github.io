/**
 * 中文：由 Rust 的真实模板生成预览，再检查 320/600 px 下的邮件横向布局；不调用邮件服务。
 * English: Render real Rust mail templates, then check 320/600 px layout without calling the mail service.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

/** 中文：仓库根路径。 / Repository root. */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("confirmation and actual authored update fit a narrow mail viewport", async () => {
  execFileSync("cargo", ["test", "--manifest-path", "worker/Cargo.toml", "--locked", "write_mail_previews", "--", "--ignored"], {
    cwd: root,
    stdio: "pipe",
  });
  const browser = await chromium.launch({ headless: true });
  try {
    for (const name of ["confirmation", "update"]) {
      const html = await readFile(path.join(root, ".temp", `email-${name}-preview.html`), "utf8");
      assert.match(html, /A\/ Atelier/);
      assert.equal((html.match(/<!doctype html>/gi) ?? []).length, 1);
      for (const width of [320, 600]) {
        const page = await browser.newPage({ viewport: { width, height: 720 } });
        try {
          await page.setContent(html);
          const size = await page.evaluate(() => ({
            clientWidth: document.documentElement.clientWidth,
            scrollWidth: document.documentElement.scrollWidth,
          }));
          assert.equal(size.scrollWidth, size.clientWidth, `${name} at ${width}px: ${JSON.stringify(size)}`);
        } finally {
          await page.close();
        }
      }
    }
  } finally {
    await browser.close();
  }
});
