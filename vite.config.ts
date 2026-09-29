import { readFileSync } from "node:fs";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

// package.json is the single source of truth for the version (bumped by
// .githooks/pre-commit); Vite only reads it.
const { version } = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
) as { version: string };

function appVersionMeta(): Plugin {
  return {
    name: "app-version-meta",
    transformIndexHtml: () => [
      {
        tag: "meta",
        attrs: { name: "app-version", content: version },
        injectTo: "head",
      },
    ],
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare(), appVersionMeta()],
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
});
