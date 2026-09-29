import { cloudflareTest } from "@cloudflare/vitest-plugin";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";

const { version } = JSON.parse(
    readFileSync(new URL("./package.json", import.meta.url), "utf8"),
) as { version: string };

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
                define: { __APP_VERSION__: JSON.stringify(version) },
                test: {
                    name: "client",
                    include: ["src/**/*.test.{ts,tsx}"],
                    environment: "jsdom",
                    setupFiles: ["./src/test/setup.ts"],
                },
            },
            {
                // cli tests run in node, but don't need the worker runtime or DOM.
                test: {
                    name: "cli",
                    include: ["cli/**/*.test.ts"],
                    environment: "node",
                },
            },
        ],
    },
});
