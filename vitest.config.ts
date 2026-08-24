import { cloudflareTest } from "@cloudflare/vitest-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Two projects, because the two halves of this app need different runtimes:
// the Worker's tests run on workerd with real R2/asset bindings, the client's
// need a DOM. `npm test` runs both.
export default defineConfig({
  test: {
    projects: [
      {
        plugins: [
          cloudflareTest({
            wrangler: { configPath: "./wrangler.jsonc" },
          }),
        ],
        test: {
          name: "worker",
          include: ["worker/**/*.test.ts"],
        },
      },
      {
        plugins: [react()],
        test: {
          name: "client",
          include: ["src/**/*.test.{ts,tsx}"],
          environment: "jsdom",
          setupFiles: ["./src/test/setup.ts"],
        },
      },
    ],
  },
});
