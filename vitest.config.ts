import { getViteConfig } from "astro/config";
import { defineConfig } from "vitest/config";

/** @brief Configure Vitest with Astro's Vite integration / 使用 Astro 的 Vite 集成配置 Vitest。 */
export default defineConfig(
  getViteConfig({
    test: {
      environment: "node",
      include: ["src/**/*.test.ts"],
    },
  }),
);
