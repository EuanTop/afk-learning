import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          return id.includes("/phaser/") || id.endsWith("/phaser") ? "phaser" : undefined;
        },
      },
    },
  },
  server: {
    proxy: {
      "/api": {
        target: process.env.EDU_STORY_API_ORIGIN ?? "http://127.0.0.1:4318",
        changeOrigin: true,
      },
    },
  },
});
