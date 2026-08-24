import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defaultExclude, defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
    }),
  ],
  test: {
    exclude: [...defaultExclude, "cli/**"],
  },
});
