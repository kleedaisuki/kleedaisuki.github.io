import { getCollection } from "astro:content";
import {
  type AtelierSourceFile,
  scanSourceFiles,
} from "../../../../../lib/atelier";

/** @brief 原始源码端点属性 (raw source endpoint props) / Build-time properties for one raw source response. */
interface Props {
  file: AtelierSourceFile;
}

/**
 * @brief 展开全部公开源码的原始文件路由 (published raw-source routes) / Materialize raw endpoints for every non-draft source file.
 * @return Astro 静态端点描述 / Astro static endpoint descriptors.
 */
export async function getStaticPaths() {
  /** @brief 所有公开 Atelier 条目 (published Atelier entries) / Every non-draft Atelier entry. */
  const works = await getCollection("atelier", ({ data }) => !data.draft);
  /** @brief 全部版本化原始文件路由 (versioned raw routes) / All raw-file endpoint descriptors. */
  const routes = await Promise.all(
    works.flatMap((work) =>
      work.data.releases.map(async (release) => {
        /** @brief 当前版本扫描结果 (release scan result) / Files in the current release. */
        const files = await scanSourceFiles(work.data.slug, release.version);
        return files.map((file) => ({
          params: {
            slug: work.data.slug,
            version: release.version,
            path: file.path,
          },
          props: { file },
        }));
      }),
    ),
  );
  return routes.flat();
}

/**
 * @brief 按源码语言得到响应类型 (source response media type) / Resolve a useful response media type without changing the bytes.
 * @param file 当前源码文件 (current source file) / Source file whose response type is needed.
 * @return 适合下载响应的媒体类型 / Media type suitable for the download response.
 */
const getContentType = (file: AtelierSourceFile): string => {
  if (file.language === "binary") return "application/octet-stream";
  if (file.language === "html") return "text/plain; charset=utf-8";
  if (file.language === "json" || file.language === "jsonc") {
    return "application/json; charset=utf-8";
  }
  return "text/plain; charset=utf-8";
};

/**
 * @brief 返回源码文件原始字节 (raw source bytes) / Return one source file without text re-encoding.
 * @param context Astro 请求上下文 (Astro request context) / Static endpoint context carrying generated props.
 * @return 原始文件响应 / Raw file response.
 */
export function GET(context: { props: Props }): Response {
  /** @brief 当前原始文件 (current raw file) / Source file selected by the generated route. */
  const { file } = context.props;
  /** @brief 与共享内存无关的响应字节 (standalone response bytes) / ArrayBuffer-backed copy accepted by the Fetch response API. */
  const body = new Uint8Array(file.data).buffer;
  return new Response(body, {
    headers: {
      "Content-Type": getContentType(file),
      "Content-Length": String(file.size),
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
    },
  });
}
