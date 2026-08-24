import autoprefixer from "autoprefixer";

/**
 * @brief Astro 的现代浏览器 CSS 后处理合同 (modern-browser CSS post-processing contract for Astro).
 * @note Autoprefixer 从 package.json 的 Browserslist 读取唯一目标集，不启用 IE Grid 等旧实现转换。
 */
export default {
  plugins: [autoprefixer()],
};
