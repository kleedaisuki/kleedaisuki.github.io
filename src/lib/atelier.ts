import { createHash } from "node:crypto";
import type { Dirent } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { strToU8, zipSync } from "fflate";
import type { AtelierLocale } from "../i18n/atelier";

/** @brief 无自定义封面时使用的统一插图 / Shared illustration used when a work has no custom cover. */
export const DEFAULT_ATELIER_COVER = "/atelier-default-cover.svg";

/** @brief 单值或双语 Atelier 文本 / Scalar or bilingual Atelier text. */
export type AtelierText = string | Readonly<Record<AtelierLocale, string>>;

/** @brief Atelier 中一个可下载文件的元数据 / Metadata for one downloadable Atelier file. */
export interface AtelierFile {
  id: string;
  label: AtelierText;
  path: string;
  mediaType?: string;
  description?: AtelierText;
  size?: number;
  checksum?: string;
  /** @brief 构建期确认的可用状态 / Availability confirmed at build time. */
  available?: boolean;
}

/**
 * @brief 解析共享制品的本地化文本 / Resolve localized text for a shared artifact.
 * @param value 单值或双语文本 / Scalar or bilingual text.
 * @param locale 目标语言 / Target locale.
 * @return 当前语言的展示文本 / Display text for the target locale.
 */
export function getAtelierText(
  value: AtelierText,
  locale: AtelierLocale,
): string {
  return typeof value === "string" ? value : value[locale];
}

/** @brief Atelier 的一个不可变发布版本 / One immutable Atelier release. */
export interface AtelierRelease {
  version: string;
  date: Date;
  notes?: AtelierText;
  files: AtelierFile[];
}

/** @brief 文件在站点中获得的展示能力 / Presentation capabilities derived for a file. */
export interface AtelierFileCapability {
  kind: "pdf" | "source" | "archive" | "download";
  canRead: boolean;
  canDownload: true;
}

/** @brief 扫描后可用于阅读、下载与打包的源码文件 / A scanned source file for reading, downloading, and archiving. */
export interface AtelierSourceFile {
  name: string;
  path: string;
  extension: string;
  language: string;
  size: number;
  data: Uint8Array;
  content?: string;
}

/** @brief 源码浏览器使用的嵌套目录节点 / A nested directory node used by the source browser. */
export interface AtelierSourceDirectory {
  type: "directory";
  name: string;
  path: string;
  children: AtelierSourceNode[];
}

/** @brief 源码浏览器使用的文件节点 / A file node used by the source browser. */
export interface AtelierSourceFileNode {
  type: "file";
  name: string;
  path: string;
  file: AtelierSourceFile;
}

/** @brief 源码树中允许出现的节点 / A node allowed in a source tree. */
export type AtelierSourceNode = AtelierSourceDirectory | AtelierSourceFileNode;

/** @brief 扩展名到 Shiki 语言标识的映射 / Extension-to-Shiki-language mapping. */
export const SOURCE_LANGUAGE_BY_EXTENSION: Readonly<Record<string, string>> = {
  c: "c",
  cc: "cpp",
  cpp: "cpp",
  cxx: "cpp",
  h: "c",
  hh: "cpp",
  hpp: "cpp",
  hxx: "cpp",
  rs: "rust",
  go: "go",
  py: "python",
  js: "javascript",
  jsx: "jsx",
  mjs: "javascript",
  cjs: "javascript",
  ts: "typescript",
  tsx: "tsx",
  java: "java",
  kt: "kotlin",
  kts: "kotlin",
  cs: "csharp",
  rb: "ruby",
  php: "php",
  swift: "swift",
  scala: "scala",
  sh: "bash",
  bash: "bash",
  ps1: "powershell",
  sql: "sql",
  html: "html",
  htm: "html",
  css: "css",
  scss: "scss",
  less: "less",
  vue: "vue",
  svelte: "svelte",
  astro: "astro",
  md: "markdown",
  mdx: "mdx",
  json: "json",
  jsonc: "jsonc",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
  xml: "xml",
  tex: "latex",
  txt: "text",
};

/** @brief 可被 UTF-8 文本阅读器自然展示的无扩展名文件 / Extensionless files naturally readable as UTF-8 text. */
const TEXT_FILENAMES = new Set([
  "dockerfile",
  "makefile",
  "license",
  "readme",
  "changelog",
  ".gitignore",
  ".editorconfig",
]);

/**
 * @brief 按发布日期取得最新版本 / Get the newest release by publication date.
 * @param releases 可为空的发布版本 / Possibly empty releases.
 * @return 最新版本；无版本时为 undefined / Latest release, or undefined when empty.
 */
export function getLatestRelease(
  releases: readonly AtelierRelease[],
): AtelierRelease | undefined {
  return releases.reduce<AtelierRelease | undefined>((latest, release) => {
    if (!latest || release.date.getTime() > latest.date.getTime())
      return release;
    return latest;
  }, undefined);
}

/**
 * @brief 计算作品最近活动时间 / Compute the most recent activity date for a work.
 * @param published 作品首次发布日期 / Initial publication date.
 * @param updated 可选的说明页更新时间 / Optional descriptive-content update date.
 * @param releases 全部制品版本 / All artifact releases.
 * @return 发布、更新与版本日期中的最大值 / Latest date across publication, update, and releases.
 */
export function getAtelierActivityDate(
  published: Date,
  updated: Date | undefined,
  releases: readonly AtelierRelease[],
): Date {
  return releases.reduce(
    (latest, release) =>
      release.date.getTime() > latest.getTime() ? release.date : latest,
    updated && updated.getTime() > published.getTime() ? updated : published,
  );
}

/**
 * @brief 从 MIME 类型与扩展名推导展示能力 / Derive presentation capabilities from MIME type and extension.
 * @param file 文件元数据 / File metadata.
 * @return 稳定的能力描述 / Stable capability descriptor.
 */
export function getFileCapability(file: AtelierFile): AtelierFileCapability {
  const mediaType = file.mediaType?.split(";", 1)[0]?.trim().toLowerCase();
  const extension = getExtension(file.path);
  if (mediaType === "application/pdf" || extension === "pdf") {
    return { kind: "pdf", canRead: true, canDownload: true };
  }
  if (
    mediaType?.startsWith("text/") ||
    mediaType === "application/json" ||
    mediaType === "application/xml" ||
    extension in SOURCE_LANGUAGE_BY_EXTENSION
  ) {
    return { kind: "source", canRead: true, canDownload: true };
  }
  if (
    mediaType === "application/zip" ||
    mediaType === "application/x-tar" ||
    ["zip", "tar", "gz", "tgz", "bz2", "xz", "7z"].includes(extension)
  ) {
    return { kind: "archive", canRead: false, canDownload: true };
  }
  return { kind: "download", canRead: false, canDownload: true };
}

/**
 * @brief 将字节数格式化为简洁的人类可读值 / Format bytes as a compact human-readable value.
 * @param bytes 字节数 / Byte count.
 * @return 使用二进制单位的字符串 / String using binary units.
 */
export function formatFileSize(bytes?: number): string {
  if (bytes === undefined || !Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const units = ["KiB", "MiB", "GiB", "TiB"];
  let value = bytes;
  let unitIndex = -1;
  do {
    value /= 1024;
    unitIndex += 1;
  } while (value >= 1024 && unitIndex < units.length - 1);
  const digits = value >= 10 ? 1 : 2;
  return `${Number(value.toFixed(digits))} ${units[unitIndex]}`;
}

/**
 * @brief 生成 Atelier 详情页 URL / Build an Atelier detail URL.
 * @param locale 页面语言 / Page locale.
 * @param slug Atelier 标识 / Atelier slug.
 * @return 站内详情页 URL / Internal detail URL.
 */
export function getAtelierPath(locale: AtelierLocale, slug: string): string {
  return `/${locale}/atelier/${encodeSegment(slug)}/`;
}

/**
 * @brief 生成不可变版本详情 URL / Build an immutable release-detail URL.
 * @param locale 页面语言 / Page locale.
 * @param slug Atelier 标识 / Atelier slug.
 * @param version 发布版本 / Release version.
 * @return 版本化详情页 URL / Versioned detail-page URL.
 */
export function getAtelierReleasePath(
  locale: AtelierLocale,
  slug: string,
  version: string,
): string {
  return `${getAtelierPath(locale, slug)}${encodeSegment(version)}/`;
}

/**
 * @brief 解析发布文件的公开 URL / Resolve a release file's public URL.
 * @param locale 页面语言 / Page locale.
 * @param slug Atelier 标识 / Atelier slug.
 * @param version 发布版本 / Release version.
 * @param file 文件元数据 / File metadata.
 * @return 外部 URL 或版本化站内 URL / External URL or versioned internal URL.
 */
export function getReleaseFileUrl(
  slug: string,
  version: string,
  file: AtelierFile,
): string {
  if (/^https?:\/\//i.test(file.path) || file.path.startsWith("/")) {
    return file.path;
  }
  return `/atelier-assets/${encodeSegment(slug)}/${encodeSegment(version)}/${encodePath(file.path)}`;
}

/**
 * @brief 用本地发布文件的真实大小与 SHA-256 丰富元数据 / Enrich metadata with a local release file's actual size and SHA-256.
 * @param slug Atelier 标识 / Atelier slug.
 * @param version 发布版本 / Release version.
 * @param file 清单中的文件元数据 / File metadata from the manifest.
 * @param publicRoot 站点 public 根目录 / Site public root.
 * @return 带真实元数据和可用状态的副本 / Copy with real metadata and availability state.
 */
export async function enrichAtelierFile(
  slug: string,
  version: string,
  file: AtelierFile,
  publicRoot = path.resolve("public"),
): Promise<AtelierFile> {
  if (/^https?:\/\//i.test(file.path) || file.path.startsWith("/")) {
    return { ...file, available: true };
  }
  const absolutePath = path.join(
    publicRoot,
    "atelier-assets",
    slug,
    version,
    ...file.path.replaceAll("\\", "/").split("/").filter(Boolean),
  );
  try {
    const data = await readFile(absolutePath);
    const checksum = createHash("sha256").update(data).digest("hex");
    return {
      ...file,
      size: data.byteLength,
      checksum: `sha256:${checksum}`,
      available: true,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { ...file, available: false };
    }
    throw error;
  }
}

/**
 * @brief 生成 PDF 阅读页 URL / Build a PDF reader URL.
 * @param slug Atelier 标识 / Atelier slug.
 * @param version 发布版本 / Release version.
 * @param fileId 文件标识 / File identifier.
 * @return PDF 阅读页 URL / PDF reader URL.
 */
export function getPdfReaderUrl(
  locale: AtelierLocale,
  slug: string,
  version: string,
  fileId: string,
): string {
  return `/${locale}/atelier/${encodeSegment(slug)}/${encodeSegment(version)}/read/${encodeSegment(fileId)}/`;
}

/**
 * @brief 生成源码树首页 URL / Build a source browser root URL.
 * @param locale 页面语言 / Page locale.
 * @param slug Atelier 标识 / Atelier slug.
 * @param version 发布版本 / Release version.
 * @return 源码树首页 URL / Source browser root URL.
 */
export function getSourceBrowserUrl(
  locale: AtelierLocale,
  slug: string,
  version: string,
): string;
/**
 * @brief 生成源码文件阅读页 URL / Build a source file reader URL.
 * @param locale 页面语言 / Page locale.
 * @param slug Atelier 标识 / Atelier slug.
 * @param version 发布版本 / Release version.
 * @param sourcePath 源码相对路径 / Source-relative path.
 * @return 源码阅读页 URL / Source reader URL.
 */
export function getSourceBrowserUrl(
  locale: AtelierLocale,
  slug: string,
  version: string,
  sourcePath: string,
): string;
export function getSourceBrowserUrl(
  locale: AtelierLocale,
  slug: string,
  version: string,
  sourcePath?: string,
): string {
  const root = `/${locale}/atelier/${encodeSegment(slug)}/${encodeSegment(version)}/source/`;
  return sourcePath ? `${root}${encodePath(sourcePath)}/` : root;
}

/**
 * @brief 生成源码原始内容 URL / Build a raw source URL.
 * @param locale 页面语言 / Page locale.
 * @param slug Atelier 标识 / Atelier slug.
 * @param version 发布版本 / Release version.
 * @param sourcePath 源码相对路径 / Source-relative path.
 * @return 原始内容 URL / Raw content URL.
 */
export function getSourceRawUrl(
  locale: AtelierLocale,
  slug: string,
  version: string,
  sourcePath: string,
): string {
  return `/${locale}/atelier/${encodeSegment(slug)}/${encodeSegment(version)}/raw/${encodePath(sourcePath)}`;
}

/**
 * @brief 生成单个源码文件下载 URL / Build a single-source-file download URL.
 * @param locale 页面语言 / Page locale.
 * @param slug Atelier 标识 / Atelier slug.
 * @param version 发布版本 / Release version.
 * @param sourcePath 源码相对路径 / Source-relative path.
 * @return 文件下载 URL / File download URL.
 */
export function getSourceDownloadUrl(
  locale: AtelierLocale,
  slug: string,
  version: string,
  sourcePath: string,
): string {
  return getSourceRawUrl(locale, slug, version, sourcePath);
}

/**
 * @brief 生成版本化源码 ZIP 下载 URL / Build a versioned source ZIP download URL.
 * @param locale 页面语言 / Page locale.
 * @param slug Atelier 标识 / Atelier slug.
 * @param version 发布版本 / Release version.
 * @return ZIP 下载 URL / ZIP download URL.
 */
export function getSourceArchiveUrl(
  locale: AtelierLocale,
  slug: string,
  version: string,
): string {
  return `/${locale}/atelier/${encodeSegment(slug)}/${encodeSegment(version)}/source.zip`;
}

/**
 * @brief 扫描一个发布版本的源码目录 / Scan one release's source directory.
 * @param slug Atelier 标识 / Atelier slug.
 * @param version 发布版本 / Release version.
 * @param atelierRoot Atelier 源码根目录 / Atelier source root.
 * @return 按路径排序的源码文件；目录不存在时为空 / Path-sorted source files, or an empty list when absent.
 */
export async function scanSourceFiles(
  slug: string,
  version: string,
  atelierRoot = path.resolve("src/atelier"),
): Promise<AtelierSourceFile[]> {
  const sourceRoot = path.join(atelierRoot, slug, version, "source");
  const files = await walkSourceDirectory(sourceRoot);
  return files.sort((left, right) => left.path.localeCompare(right.path, "en"));
}

/**
 * @brief 将平面源码列表构造成嵌套树 / Build a nested tree from a flat source-file list.
 * @param files 扫描后的源码文件 / Scanned source files.
 * @return 名为 source 的根目录 / Root directory named source.
 */
export function buildSourceTree(
  files: readonly AtelierSourceFile[],
): AtelierSourceDirectory {
  const root: AtelierSourceDirectory = {
    type: "directory",
    name: "source",
    path: "",
    children: [],
  };
  for (const file of files) insertSourceFile(root, file);
  sortSourceTree(root);
  return root;
}

/**
 * @brief 纯函数式生成确定性的源码 ZIP / Purely generate a deterministic source ZIP.
 * @param files 要归档的源码文件 / Source files to archive.
 * @return ZIP 二进制数据 / ZIP binary data.
 */
export function createSourceArchive(
  files: readonly Pick<AtelierSourceFile, "path" | "data">[],
): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  for (const file of [...files].sort((a, b) =>
    a.path.localeCompare(b.path, "en"),
  )) {
    entries[file.path.replaceAll("\\", "/")] = file.data;
  }
  return zipSync(entries, {
    level: 6,
    mtime: new Date("1980-01-01T00:00:00Z"),
  });
}

/** @brief 提取不含点号的小写扩展名 / Extract a lowercase extension without its dot. */
function getExtension(filePath: string): string {
  const pathname = filePath.split(/[?#]/, 1)[0] ?? "";
  const name = pathname.slice(pathname.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

/** @brief 对一个 URL 路径片段编码 / Encode one URL path segment. */
function encodeSegment(segment: string): string {
  return encodeURIComponent(segment);
}

/** @brief 对相对 URL 路径逐段编码 / Encode a relative URL path segment by segment. */
function encodePath(relativePath: string): string {
  return relativePath
    .replaceAll("\\", "/")
    .split("/")
    .filter(Boolean)
    .map(encodeSegment)
    .join("/");
}

/** @brief 递归读取源码目录；缺失目录自然表现为空 / Recursively read a source directory; a missing directory is naturally empty. */
async function walkSourceDirectory(
  directory: string,
  relativeDirectory = "",
): Promise<AtelierSourceFile[]> {
  let entries: Dirent[];
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const nested = await Promise.all(
    entries.map(async (entry): Promise<AtelierSourceFile[]> => {
      const relativePath = path.posix.join(relativeDirectory, entry.name);
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return walkSourceDirectory(absolutePath, relativePath);
      }
      if (!entry.isFile()) return [];
      const buffer = await readFile(absolutePath);
      const data = new Uint8Array(buffer);
      const extension = getExtension(entry.name);
      const language = getSourceLanguage(entry.name, extension);
      const text =
        language !== "binary" ? new TextDecoder().decode(data) : undefined;
      return [
        {
          name: entry.name,
          path: relativePath,
          extension,
          language,
          size: data.byteLength,
          data,
          content: text,
        },
      ];
    }),
  );
  return nested.flat();
}

/** @brief 根据文件名取得源码语言 / Resolve a source language from a filename. */
function getSourceLanguage(filename: string, extension: string): string {
  const mapped = SOURCE_LANGUAGE_BY_EXTENSION[extension];
  if (mapped) return mapped;
  return TEXT_FILENAMES.has(filename.toLowerCase()) ? "text" : "binary";
}

/** @brief 将一个文件插入嵌套源码树 / Insert one file into the nested source tree. */
function insertSourceFile(
  root: AtelierSourceDirectory,
  file: AtelierSourceFile,
): void {
  const segments = file.path.split("/").filter(Boolean);
  let directory = root;
  for (const [index, segment] of segments.entries()) {
    const isFile = index === segments.length - 1;
    if (isFile) {
      directory.children.push({
        type: "file",
        name: segment,
        path: file.path,
        file,
      });
      return;
    }
    const directoryPath = segments.slice(0, index + 1).join("/");
    const existing = directory.children.find(
      (node): node is AtelierSourceDirectory =>
        node.type === "directory" && node.name === segment,
    );
    const child =
      existing ??
      ({
        type: "directory",
        name: segment,
        path: directoryPath,
        children: [],
      } satisfies AtelierSourceDirectory);
    if (!existing) directory.children.push(child);
    directory = child;
  }
}

/** @brief 将目录优先、名称次序递归应用到源码树 / Recursively sort a source tree by directory first, then name. */
function sortSourceTree(directory: AtelierSourceDirectory): void {
  directory.children.sort((left, right) => {
    if (left.type !== right.type) return left.type === "directory" ? -1 : 1;
    return left.name.localeCompare(right.name, "en");
  });
  for (const child of directory.children) {
    if (child.type === "directory") sortSourceTree(child);
  }
}

/** @brief 将字符串方便地转换成归档输入 / Convert a string conveniently into archive input. */
export function sourceText(text: string): Uint8Array {
  return strToU8(text);
}
