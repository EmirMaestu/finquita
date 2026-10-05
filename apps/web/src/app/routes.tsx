import { Navigate, type RouteObject } from "react-router";
import { CashPage } from "../pages/cash/CashPage";
import { ModulePlaceholder } from "../pages/ModulePlaceholder";
import { MorePage } from "../pages/MorePage";
import { CodeSheetPage } from "../pages/products/CodeSheetPage";
import { ImportPage } from "../pages/products/ImportPage";
import { LoadModePage } from "../pages/products/LoadModePage";
import { ProductsPage } from "../pages/products/ProductsPage";
import { ShelfLabelsPage } from "../pages/products/ShelfLabelsPage";
import { SellPage } from "../pages/sell/SellPage";
import { AppShell } from "./layout/AppShell";
import { MODULES } from "./modules";

export const routes: RouteObject[] = [
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/inicio" replace /> },
      { path: "caja", element: <CashPage /> },
      { path: "vender", element: <SellPage /> },
      { path: "productos", element: <ProductsPage /> },
      { path: "productos/carga", element: <LoadModePage /> },
      { path: "productos/importar", element: <ImportPage /> },
      { path: "productos/planilla", element: <CodeSheetPage /> },
      { path: "productos/etiquetas", element: <ShelfLabelsPage /> },
      { path: "productos/:id", element: <ProductsPage /> },
      ...MODULES.filter((m) => !["productos", "caja", "vender"].includes(m.id)).map((m) => ({
        path: `${m.path.slice(1)}/*`,
        element: <ModulePlaceholder />,
      })),
      { path: "mas", element: <MorePage /> },
      { path: "*", element: <Navigate to="/inicio" replace /> },
    ],
  },
];
