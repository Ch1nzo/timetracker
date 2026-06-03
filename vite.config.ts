import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// @tauri-apps/cli sets TAURI_DEV_HOST when targeting a physical device.
const host = process.env.TAURI_DEV_HOST;

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],

  // Tauri expects a fixed port and fails if it is busy.
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? { protocol: "ws", host, port: 1421 }
      : undefined,
    watch: {
      // Don't watch the Rust side — Cargo handles that.
      ignored: ["**/src-tauri/**"],
    },
  },

  // Produce assets the Tauri webview can load from the bundled frontend.
  build: {
    // Tauri v2 supports modern webviews; target their baselines.
    target: process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari13",
    minify: !process.env.TAURI_ENV_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
    // The Japanese font files are ~5MB each; keep them as real files, not inlined.
    assetsInlineLimit: 4096,
  },
});
