import { getCollection } from "astro:content";
import { ATELIER_LOCALES } from "@i18n/atelier";
import {
  type AtelierSourceFile,
  createSourceArchive,
  scanSourceFiles,
} from "../../../../../lib/atelier";

/** @brief 源码归档端点属性 (source archive endpoint props) / Build-time properties for one source ZIP. */
interface Props {
  slug: string;
  version: string;
  files: AtelierSourceFile[];
}

/**
 * @brief 展开全部公开版本的源码归档路由 (published source archive routes) / Materialize a ZIP route for every non-empty, non-draft source release.
 * @return Astro 静态端点描述 / Astro static endpoint descriptors.
 */
export async function getStaticPaths() {
  /** @brief 所有公开 Atelier 条目 (published Atelier entries) / Every non-draft Atelier entry. */
  const works = await getCollection("atelier", ({ data }) => !data.draft);
  /** @brief 所有非空源码归档路由 (non-empty source archive routes) / ZIP endpoints backed by at least one source file. */
  const routes = await Promise.all(
    works.flatMap((work) =>
      work.data.releases.map(async (release) => {
        /** @brief 当前版本扫描结果 (release scan result) / Files archived for this release. */
        const files = await scanSourceFiles(work.data.slug, release.version);
        return files.length > 0
          ? ATELIER_LOCALES.map((locale) => ({
              params: {
                locale,
                slug: work.data.slug,
                version: release.version,
              },
              props: {
                slug: work.data.slug,
                version: release.version,
                files,
              },
            }))
          : [];
      }),
    ),
  );
  return routes.flat();
}

/**
 * @brief 返回确定性的完整源码 ZIP (deterministic source ZIP) / Return the complete source tree as a reproducible archive.
 * @param context Astro 请求上下文 (Astro request context) / Static endpoint context carrying generated props.
 * @return ZIP 下载响应 / Downloadable ZIP response.
 */
export function GET(context: { props: Props }): Response {
  /** @brief 当前归档属性 (current archive properties) / Release identity and scanned files. */
  const { slug, version, files } = context.props;
  /** @brief 确定性 ZIP 字节 (deterministic ZIP bytes) / Archive generated from the shared scan result. */
  const archive = createSourceArchive(files);
  /** @brief 与共享内存无关的 ZIP 响应体 (standalone ZIP body) / ArrayBuffer-backed copy accepted by the Fetch response API. */
  const body = new Uint8Array(archive).buffer;
  /** @brief 人类可读下载文件名 (human-readable download name) / Stable release archive filename. */
  const filename = `${slug}-${version}-source.zip`;
  return new Response(body, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Length": String(archive.byteLength),
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
