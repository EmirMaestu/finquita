import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { pwaOptions } from "./pwa.config";

export default defineConfig({
  plugins: [react(), tailwindcss(), VitePWA(pwaOptions)],
  build: { target: "es2020" },
  server: {
    port: 5173,
    proxy: {
      "/api": { target: process.env.API_URL ?? "http://localhost:3000", changeOrigin: false },
    },
  },
});
