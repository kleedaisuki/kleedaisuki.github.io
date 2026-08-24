import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { unzipSync } from "fflate";
import { afterEach, describe, expect, it } from "vitest";
import {
  type AtelierRelease,
  buildSourceTree,
  createSourceArchive,
  enrichAtelierFile,
  formatFileSize,
  getAtelierActivityDate,
  getAtelierPath,
  getAtelierReleasePath,
  getAtelierText,
  getFileCapability,
  getLatestRelease,
  getPdfReaderUrl,
  getReleaseFileUrl,
  getSourceArchiveUrl,
  getSourceBrowserUrl,
  getSourceDownloadUrl,
  getSourceRawUrl,
  scanSourceFiles,
  sourceText,
} from "./atelier";

/** @brief 测试完成后需要删除的临时目录 / Temporary directories removed after tests. */
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("Atelier release helpers", () => {
  it("resolves localized metadata while preserving scalar compatibility", () => {
    expect(getAtelierText("Shared", "zh")).toBe("Shared");
    expect(getAtelierText({ zh: "中文", en: "English" }, "en")).toBe("English");
  });

  it("selects the newest release by date without changing input order", () => {
    const releases: AtelierRelease[] = [
      { version: "2.0.0", date: new Date("2026-01-01"), files: [] },
      { version: "1.9.0", date: new Date("2026-04-01"), files: [] },
    ];

    expect(getLatestRelease(releases)?.version).toBe("1.9.0");
    expect(releases.map(({ version }) => version)).toEqual(["2.0.0", "1.9.0"]);
    expect(getLatestRelease([])).toBeUndefined();
  });

  it("keeps the first release when publication dates are equal", () => {
    const releases: AtelierRelease[] = [
      { version: "first", date: new Date("2026-01-01"), files: [] },
      { version: "second", date: new Date("2026-01-01"), files: [] },
    ];

    expect(getLatestRelease(releases)?.version).toBe("first");
  });

  it("uses release dates when computing recent activity", () => {
    const published = new Date("2025-01-01");
    const updated = new Date("2025-06-01");
    const releases: AtelierRelease[] = [
      { version: "1.0.0", date: new Date("2025-02-01"), files: [] },
      { version: "2.0.0", date: new Date("2026-01-01"), files: [] },
    ];

    expect(getAtelierActivityDate(published, updated, releases)).toEqual(
      new Date("2026-01-01"),
    );
    expect(getAtelierActivityDate(published, undefined, [])).toEqual(published);
  });

  it("derives capabilities from MIME type first and extension as fallback", () => {
    expect(
      getFileCapability({
        id: "paper",
        label: "Paper",
        path: "paper.bin",
        mediaType: "Application/PDF; charset=binary",
      }),
    ).toEqual({ kind: "pdf", canRead: true, canDownload: true });
    expect(
      getFileCapability({ id: "code", label: "Code", path: "main.rs" }).kind,
    ).toBe("source");
    expect(
      getFileCapability({
        id: "bundle",
        label: "Bundle",
        path: "source.tar.gz",
      }).kind,
    ).toBe("archive");
    expect(
      getFileCapability({ id: "data", label: "Data", path: "weights.bin" })
        .kind,
    ).toBe("download");
  });

  it("formats absent, small, and large sizes naturally", () => {
    expect(formatFileSize()).toBe("—");
    expect(formatFileSize(999)).toBe("999 B");
    expect(formatFileSize(1536)).toBe("1.5 KiB");
    expect(formatFileSize(5 * 1024 * 1024)).toBe("5 MiB");
  });
});

describe("Atelier URLs", () => {
  it("encodes slugs, versions, identifiers, and nested source paths", () => {
    expect(getAtelierPath("zh", "lambda notes")).toBe(
      "/zh/atelier/lambda%20notes/",
    );
    expect(getAtelierReleasePath("en", "lambda notes", "1.0 rc")).toBe(
      "/en/atelier/lambda%20notes/1.0%20rc/",
    );
    expect(
      getReleaseFileUrl("lambda notes", "1.0 rc", {
        id: "paper",
        label: "Paper",
        path: "papers/main zh.pdf",
      }),
    ).toBe("/atelier-assets/lambda%20notes/1.0%20rc/papers/main%20zh.pdf");
    expect(getPdfReaderUrl("zh", "demo", "v1", "paper zh")).toBe(
      "/zh/atelier/demo/v1/read/paper%20zh/",
    );
    expect(getSourceBrowserUrl("en", "demo", "v1")).toBe(
      "/en/atelier/demo/v1/source/",
    );
    expect(getSourceBrowserUrl("en", "demo", "v1", "src/main file.ts")).toBe(
      "/en/atelier/demo/v1/source/src/main%20file.ts/",
    );
    expect(getSourceRawUrl("zh", "demo", "v1", "src/main.ts")).toBe(
      "/zh/atelier/demo/v1/raw/src/main.ts",
    );
    expect(getSourceDownloadUrl("zh", "demo", "v1", "src/main.ts")).toBe(
      "/zh/atelier/demo/v1/raw/src/main.ts",
    );
    expect(getSourceArchiveUrl("en", "demo", "v1")).toBe(
      "/en/atelier/demo/v1/source.zip",
    );
  });

  it("keeps absolute and remote release URLs unchanged", () => {
    expect(
      getReleaseFileUrl("demo", "v1", {
        id: "local",
        label: "Local",
        path: "/downloads/demo.pdf",
      }),
    ).toBe("/downloads/demo.pdf");
    expect(
      getReleaseFileUrl("demo", "v1", {
        id: "remote",
        label: "Remote",
        path: "https://example.com/demo.zip",
      }),
    ).toBe("https://example.com/demo.zip");
  });

  it("enriches relative files and preserves manifest data for non-local files", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "atelier-public-"));
    temporaryDirectories.push(root);
    const fileDirectory = path.join(
      root,
      "atelier-assets",
      "demo",
      "v1",
      "papers",
    );
    await mkdir(fileDirectory, { recursive: true });
    await writeFile(path.join(fileDirectory, "paper.pdf"), "PDF");

    const enriched = await enrichAtelierFile(
      "demo",
      "v1",
      { id: "paper", label: "Paper", path: "papers/paper.pdf" },
      root,
    );
    expect(enriched.size).toBe(3);
    expect(enriched.checksum).toBe(
      "sha256:1d393b0081b632c54654eb08c345ff76b92ae4efe0768b4c0f64b9ebbe920492",
    );

    const remote = {
      id: "remote",
      label: "Remote",
      path: "https://example.com/file.zip",
      size: 42,
      checksum: "provided",
    };
    expect(await enrichAtelierFile("demo", "v1", remote, root)).toEqual({
      ...remote,
      available: true,
    });
    expect(
      await enrichAtelierFile(
        "demo",
        "v1",
        { id: "missing", label: "Missing", path: "missing.zip", size: 7 },
        root,
      ),
    ).toMatchObject({ size: 7, available: false });
  });
});

describe("Atelier source model", () => {
  it("scans versioned source files and builds a directory-first tree", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "atelier-test-"));
    temporaryDirectories.push(root);
    const source = path.join(root, "demo", "v1", "source");
    await mkdir(path.join(source, "src"), { recursive: true });
    await writeFile(path.join(source, "README"), "hello\n");
    await writeFile(path.join(source, "src", "main.ts"), "export {};\n");
    await writeFile(path.join(source, "asset.bin"), new Uint8Array([0, 1, 2]));

    const files = await scanSourceFiles("demo", "v1", root);
    expect(files.map(({ path: filePath }) => filePath)).toEqual([
      "asset.bin",
      "README",
      "src/main.ts",
    ]);
    expect(files.find(({ name }) => name === "main.ts")?.language).toBe(
      "typescript",
    );
    expect(files.find(({ name }) => name === "README")?.content).toBe(
      "hello\n",
    );
    expect(
      files.find(({ name }) => name === "asset.bin")?.content,
    ).toBeUndefined();

    const tree = buildSourceTree(files);
    expect(tree.children.map(({ type, name }) => `${type}:${name}`)).toEqual([
      "directory:src",
      "file:asset.bin",
      "file:README",
    ]);
  });

  it("returns an empty source model when a version has no source directory", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "atelier-empty-"));
    temporaryDirectories.push(root);
    expect(await scanSourceFiles("missing", "v1", root)).toEqual([]);
    expect(buildSourceTree([]).children).toEqual([]);
  });

  it("creates a readable ZIP while preserving nested paths", () => {
    const archive = createSourceArchive([
      { path: "README.md", data: sourceText("hello") },
      { path: "src/main.ts", data: sourceText("export {};") },
    ]);
    const entries = unzipSync(archive);

    expect(new TextDecoder().decode(entries["README.md"])).toBe("hello");
    expect(new TextDecoder().decode(entries["src/main.ts"])).toBe("export {};");
  });
});
