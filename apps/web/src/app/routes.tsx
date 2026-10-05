import { Navigate, type RouteObject } from "react-router";
import { ModulePlaceholder } from "../pages/ModulePlaceholder";
import { MorePage } from "../pages/MorePage";
import { LoadModePage } from "../pages/products/LoadModePage";
import { ProductsPage } from "../pages/products/ProductsPage";
import { AppShell } from "./layout/AppShell";
import { MODULES } from "./modules";

export const routes: RouteObject[] = [
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/inicio" replace /> },
      { path: "productos", element: <ProductsPage /> },
      { path: "productos/carga", element: <LoadModePage /> },
      { path: "productos/:id", element: <ProductsPage /> },
      ...MODULES.filter((m) => m.id !== "productos").map((m) => ({
        path: `${m.path.slice(1)}/*`,
        element: <ModulePlaceholder />,
      })),
      { path: "mas", element: <MorePage /> },
      { path: "*", element: <Navigate to="/inicio" replace /> },
    ],
  },
];
