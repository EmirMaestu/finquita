import type { VitePWAOptions } from "vite-plugin-pwa";

/** PWA: precachea la app para vender sin conexión; la actualización la decide la app. */
export const pwaOptions: Partial<VitePWAOptions> = {
  registerType: "prompt",
  injectRegister: false,
  includeAssets: ["favicon-64.png", "apple-touch-icon.png"],
  manifest: {
    name: "Mostrador",
    short_name: "Mostrador",
    description: "Vender, caja, stock, compras y fiado para tu almacén.",
    lang: "es-AR",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    theme_color: "#1F6B4F",
    background_color: "#FAF8F5",
    icons: [
      { src: "pwa-192.png", sizes: "192x192", type: "image/png" },
      { src: "pwa-512.png", sizes: "512x512", type: "image/png" },
      { src: "pwa-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  },
  workbox: {
    globPatterns: ["**/*.{js,css,html,png,svg,ico}", "**/inter-latin*.woff2"],
    navigateFallback: "/index.html",
    navigateFallbackDenylist: [/^\/api\//],
    cleanupOutdatedCaches: true,
  },
};
