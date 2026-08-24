import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

/** @brief 临时构建夹具标识 / Temporary build-fixture identifier. */
const FIXTURE_SLUG = "__build_fixture__";
/** @brief 仓库根目录 / Repository root directory. */
const ROOT = process.cwd();
/** @brief 临时内容文件 / Temporary content entry. */
const CONTENT_FILE = path.join(ROOT, "src", "content", "atelier", `${FIXTURE_SLUG}.md`);
/** @brief 临时源码根目录 / Temporary source root. */
const SOURCE_ROOT = path.join(ROOT, "src", "atelier", FIXTURE_SLUG);
/** @brief 临时发布文件根目录 / Temporary release-asset root. */
const ASSET_ROOT = path.join(ROOT, "public", "atelier-assets", FIXTURE_SLUG);
/** @brief 与生产 dist 隔离的夹具输出目录 / Fixture output isolated from production dist. */
const OUTPUT_ROOT = path.join(ROOT, ".atelier-fixture-dist");
/** @brief 当前进程使用的 pnpm CLI / pnpm CLI used by the current process. */
const PNPM_CLI = process.env.npm_execpath;

/**
 * @brief 断言集成构建条件 / Assert an integration-build condition.
 * @param condition 待验证条件 / Condition to validate.
 * @param message 失败信息 / Failure message.
 * @return 无返回值 / No return value.
 */
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

/**
 * @brief 串行运行 pnpm 脚本 / Run a pnpm script serially.
 * @param script package.json 脚本名 / package.json script name.
 * @param args 传递给脚本的额外参数 / Additional arguments passed to the script.
 * @param environment 附加环境变量 / Additional environment variables.
 * @return 无返回值 / No return value.
 */
function runScript(script, args = [], environment = {}) {
  assert(PNPM_CLI, "npm_execpath is unavailable; run this verifier through pnpm");
  /** @brief pnpm 可为原生可执行文件或 JavaScript CLI / pnpm may be a native executable or JavaScript CLI. */
  const isNativeExecutable = /\.exe$/i.test(PNPM_CLI);
  const result = spawnSync(
    isNativeExecutable ? PNPM_CLI : process.execPath,
    isNativeExecutable ? [script, ...args] : [PNPM_CLI, script, ...args],
    {
      cwd: ROOT,
      env: { ...process.env, ...environment },
      stdio: "inherit",
    },
  );
  if (result.error) throw result.error;
  assert(result.status === 0, `pnpm ${script} failed with exit code ${result.status}`);
}

/**
 * @brief 写入测试夹具文件 / Write one fixture file.
 * @param filename 绝对文件路径 / Absolute file path.
 * @param contents 文件内容 / File contents.
 * @return 无返回值 / No return value.
 */
function writeFixture(filename, contents) {
  mkdirSync(path.dirname(filename), { recursive: true });
  writeFileSync(filename, contents);
}

assert(!existsSync(CONTENT_FILE), `Refusing to overwrite ${CONTENT_FILE}`);
assert(!existsSync(SOURCE_ROOT), `Refusing to overwrite ${SOURCE_ROOT}`);
assert(!existsSync(ASSET_ROOT), `Refusing to overwrite ${ASSET_ROOT}`);
assert(!existsSync(OUTPUT_ROOT), `Refusing to overwrite ${OUTPUT_ROOT}`);

try {
  writeFixture(
    CONTENT_FILE,
    `---
slug: ${FIXTURE_SLUG}
title: Atelier build fixture
summary: Exercises every generated Atelier capability during CI.
published: 2025-01-01
tags: [fixture, code]
releases:
  - version: 1.0.0
    date: 2025-01-01
    files:
      - id: paper
        label: Paper
        path: paper.pdf
        mediaType: application/pdf
  - version: 2.0.0
    date: 2026-01-01
    files:
      - id: paper
        label: Paper
        path: paper.bin
        mediaType: Application/PDF; charset=binary
      - id: missing-pdf
        label: Missing PDF
        path: missing.bin
        mediaType: application/pdf
---

This entry exists only while the integration build runs.
`,
  );
  /** @brief 足以作为静态发布文件的微型 PDF / Tiny PDF sufficient as a static release asset. */
  const tinyPdf = "%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n";
  writeFixture(path.join(ASSET_ROOT, "1.0.0", "paper.pdf"), tinyPdf);
  writeFixture(path.join(ASSET_ROOT, "2.0.0", "paper.bin"), tinyPdf);
  writeFixture(path.join(SOURCE_ROOT, "1.0.0", "source", "README"), "Version one.\n");
  writeFixture(
    path.join(SOURCE_ROOT, "2.0.0", "source", "src", "main.ts"),
    "export const answer = 42;\n",
  );

  runScript("build", ["--outDir", OUTPUT_ROOT]);
  runScript("verify:seo", [], { BUILD_OUTPUT_DIRECTORY: OUTPUT_ROOT });

  /** @brief 必须由夹具生成的静态产物 / Static artifacts the fixture must generate. */
  const expectedOutputs = [
    "zh/atelier/__build_fixture__/index.html",
    "en/atelier/__build_fixture__/index.html",
    "zh/atelier/__build_fixture__/1.0.0/index.html",
    "en/atelier/__build_fixture__/2.0.0/index.html",
    "zh/atelier/__build_fixture__/2.0.0/read/paper/index.html",
    "en/atelier/__build_fixture__/2.0.0/read/paper/index.html",
    "en/atelier/__build_fixture__/2.0.0/source/src/main.ts/index.html",
    "en/atelier/__build_fixture__/2.0.0/raw/src/main.ts",
    "en/atelier/__build_fixture__/2.0.0/source.zip",
  ];
  for (const output of expectedOutputs) {
    assert(existsSync(path.join(OUTPUT_ROOT, ...output.split("/"))), `Missing ${output}`);
  }

  /** @brief 最新版本详情 HTML / Latest version-detail HTML. */
  const latestHtml = readFileSync(
    path.join(OUTPUT_ROOT, "en", "atelier", FIXTURE_SLUG, "2.0.0", "index.html"),
    "utf8",
  );
  assert(
    latestHtml.includes('name="robots" content="noindex, follow"'),
    "Latest version is indexable",
  );
  assert(
    latestHtml.includes(
      `rel="canonical" href="https://blog.moesegfault.dev/en/atelier/${FIXTURE_SLUG}/"`,
    ),
    "Latest version does not canonicalize to the stable work URL",
  );
  assert(latestHtml.includes("File unavailable"), "Missing local file is not reported");
  assert(
    !latestHtml.includes("/missing.bin\" download"),
    "Missing local file remains downloadable",
  );
  assert(
    !existsSync(
      path.join(
        OUTPUT_ROOT,
        "en",
        "atelier",
        FIXTURE_SLUG,
        "2.0.0",
        "read",
        "missing-pdf",
        "index.html",
      ),
    ),
    "Missing local PDF still generated a reader route",
  );

  /** @brief 历史版本详情 HTML / Historical release-detail HTML. */
  const historicalDetail = readFileSync(
    path.join(OUTPUT_ROOT, "en", "atelier", FIXTURE_SLUG, "1.0.0", "index.html"),
    "utf8",
  );
  assert(
    historicalDetail.includes('name="robots" content="noindex, follow"'),
    "Historical release is indexable despite being absent from the sitemap",
  );
  /** @brief 历史 PDF 阅读器 HTML / Historical PDF-reader HTML. */
  const historicalReader = readFileSync(
    path.join(
      OUTPUT_ROOT,
      "en",
      "atelier",
      FIXTURE_SLUG,
      "1.0.0",
      "read",
      "paper",
      "index.html",
    ),
    "utf8",
  );
  /** @brief 历史源码阅读器 HTML / Historical source-reader HTML. */
  const historicalSource = readFileSync(
    path.join(
      OUTPUT_ROOT,
      "en",
      "atelier",
      FIXTURE_SLUG,
      "1.0.0",
      "source",
      "README",
      "index.html",
    ),
    "utf8",
  );
  /** @brief 历史版本详情路径 / Historical release-detail path. */
  const historicalDetailPath = `/en/atelier/${FIXTURE_SLUG}/1.0.0/`;
  assert(
    historicalReader.includes(`href="${historicalDetailPath}"`),
    "Historical PDF reader loses its release context",
  );
  assert(
    historicalSource.includes(`href="${historicalDetailPath}"`),
    "Historical source reader loses its release context",
  );
} finally {
  rmSync(CONTENT_FILE, { force: true });
  rmSync(SOURCE_ROOT, { force: true, recursive: true });
  rmSync(ASSET_ROOT, { force: true, recursive: true });
  rmSync(OUTPUT_ROOT, { force: true, recursive: true });
}
