import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

const CLIENT_PORT = 5173;

export default defineConfig(() => ({
  plugins: [react(), tailwindcss()],
  css: {
    postcss: { plugins: [] },
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
  build: {
    outDir: path.resolve(import.meta.dirname, "dist"),
    emptyOutDir: true,
  },
  server: {
    port: CLIENT_PORT,
    strictPort: false,
  },
  preview: {
    port: 4173,
    strictPort: false,
  },
}));
