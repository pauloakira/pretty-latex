import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],

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
