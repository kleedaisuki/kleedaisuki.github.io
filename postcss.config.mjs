import autoprefixer from "autoprefixer";

/**
 * The vendored design system bundles KaTeX styles and 20 font faces. This site renders formulas as native
 * MathML, so they are dead weight; pruning here keeps the vendored files byte-identical to the release.
 */
const pruneKatex = {
  postcssPlugin: "prune-katex",
  Once(root) {
    root.walkAtRules("font-face", (rule) => {
      if (rule.toString().includes("KaTeX")) rule.remove();
    });
    root.walkRules((rule) => {
      if (rule.selectors.every((selector) => selector.startsWith(".katex"))) rule.remove();
    });
  },
};

/** Autoprefixer reads its only target set from `browserslist` in package.json. */
export default {
  plugins: [pruneKatex, autoprefixer()],
};
