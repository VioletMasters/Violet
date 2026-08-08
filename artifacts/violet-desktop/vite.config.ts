import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Tauri dev host (set by Tauri CLI in mobile/remote dev)
const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react(), tailwindcss()],

  // Prevent vite from obscuring Rust errors
  clearScreen: false,

  server: {
    host: host || false,
    port: 1420,
    strictPort: true,
    hmr: host ? { protocol: 'ws', host, port: 1421 } : undefined,
    // Don't watch Rust source — changes there are handled by Tauri CLI
    watch: { ignored: ['**/src-tauri/**'] },
  },

  // Tauri uses its own env prefix for build config
  envPrefix: ['VITE_', 'TAURI_ENV_*'],

  build: {
    // Tauri supports es2021 / modern chromium — no need to target ancient browsers
    target: ['es2021', 'chrome100', 'safari13'],
    minify: !process.env.TAURI_ENV_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
    outDir: 'dist',
    emptyOutDir: true,
  },
});
