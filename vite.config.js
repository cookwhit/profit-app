import { vitePlugin as remix } from "@remix-run/dev";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

// Related: https://github.com/remix-run/remix/issues/2835#issuecomment-1144102176
// Replace the host in the Remix config
const host = new URL(
  process.env.SHOPIFY_APP_URL || "http://localhost:3000"
).hostname;

export default defineConfig({
  server: {
    host: "localhost",
    port: Number(process.env.PORT || 3000),
    hmr: {
      host,
    },
    fs: {
      allow: ["app", "node_modules"],
    },
  },
  plugins: [
    remix({
      ignoredRouteFiles: ["**/.*"],
    }),
    tsconfigPaths(),
  ],
});
