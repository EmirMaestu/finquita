import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import { PwaUpdater } from "./app/PwaUpdater";
import { routes } from "./app/routes";
import { SessionGate } from "./app/SessionGate";
import { applyTheme, savedTheme } from "./app/theme";
import { syncEngine } from "./sync";
import { listenServerEvents } from "./sync/events";
import "./styles.css";

applyTheme(savedTheme());

// Que el navegador no borre la copia local (catálogo y ventas sin sincronizar).
void navigator.storage?.persist?.().catch(() => {});

syncEngine().start();
// El servidor avisa por SSE cuando hay cambios para bajar.
listenServerEvents(() => void syncEngine().kick());

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});
const router = createBrowserRouter(routes);

const root = document.getElementById("root");
if (!root) throw new Error("Falta #root");

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <SessionGate>
        <RouterProvider router={router} />
        <PwaUpdater />
      </SessionGate>
    </QueryClientProvider>
  </StrictMode>,
);
