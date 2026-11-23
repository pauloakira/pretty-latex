import { cp, readFile, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, normalize, resolve, sep } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const host = process.env.TAURI_DEV_HOST;

/** Where the app serves pdf.js's data files from (assetUrl in pdfJsDisplay.ts). */
const PDFJS_ASSETS_URL = "/pdfjs/";
/** pdf.js data fetched at runtime: CJK character maps, the standard 14 fonts, wasm image
 * decoders and ICC colour profiles. */
const PDFJS_ASSET_DIRS = ["cmaps", "standard_fonts", "wasm", "iccs"];

/**
 * Ships pdf.js's data files with the app so PDFs render fully offline: served from
 * node_modules in dev, copied into the build output for production. (From pretty-markdown.)
 */
function pdfjsAssets(): Plugin {
  const pdfjsRoot = dirname(createRequire(import.meta.url).resolve("pdfjs-dist/package.json"));
  let outDir = "dist";
  return {
    name: "pdfjs-assets",
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    configureServer(server) {
      server.middlewares.use(PDFJS_ASSETS_URL, async (req, res, next) => {
        const relative = normalize(decodeURIComponent((req.url ?? "").split("?")[0])).replace(/^[/\\]+/, "");
        const [dir] = relative.split(/[/\\]/);
        const file = join(pdfjsRoot, relative);
        // Only the asset folders, and never a path that escapes them.
        if (!PDFJS_ASSET_DIRS.includes(dir) || !file.startsWith(join(pdfjsRoot, dir) + sep)) {
          next();
          return;
        }
        try {
          if (!(await stat(file)).isFile()) throw new Error("not a file");
          if (file.endsWith(".wasm")) res.setHeader("Content-Type", "application/wasm");
          res.end(await readFile(file));
        } catch {
          next();
        }
      });
    },
    async writeBundle() {
      await Promise.all(
        PDFJS_ASSET_DIRS.map((dir) =>
          cp(join(pdfjsRoot, dir), join(outDir, PDFJS_ASSETS_URL, dir), { recursive: true }),
        ),
      );
    },
  };
}

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), pdfjsAssets()],

  // Expose Tauri's build-time env (TAURI_ENV_PLATFORM etc.) to the app.
  envPrefix: ["VITE_", "TAURI_ENV_"],

  build: {
    // Keep the editor engine in its own chunk so the app chunk stays small.
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes("node_modules/@codemirror") || id.includes("node_modules/@lezer")) {
            return "codemirror";
          }
          // pdf.js is imported lazily (lazyPdfJs.ts) and stays in its own chunk.
          return undefined;
        },
      },
    },
  },

  // Options for `tauri dev` / `tauri build`:
  // 1. don't hide Rust errors
  clearScreen: false,
  // 2. Tauri expects a fixed port; fail if it's taken
  server: {
    port: 1430,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1431 } : undefined,
    // 3. don't watch the Rust side
    watch: { ignored: ["**/src-tauri/**"] },
  },
}));
