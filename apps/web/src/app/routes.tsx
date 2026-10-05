import { Navigate, type RouteObject } from "react-router";
import { CashPage } from "../pages/cash/CashPage";
import { CloseShiftPage } from "../pages/cash/CloseShiftPage";
import { ClosingsPage } from "../pages/cash/ClosingsPage";
import { ModulePlaceholder } from "../pages/ModulePlaceholder";
import { MorePage } from "../pages/MorePage";
import { BulkPricePage } from "../pages/products/BulkPricePage";
import { CodeSheetPage } from "../pages/products/CodeSheetPage";
import { CountPage, CountsPage } from "../pages/products/CountsPage";
import { ImportPage } from "../pages/products/ImportPage";
import { LoadModePage } from "../pages/products/LoadModePage";
import { MovementsPage } from "../pages/products/MovementsPage";
import { ProductsPage } from "../pages/products/ProductsPage";
import { ShelfLabelsPage } from "../pages/products/ShelfLabelsPage";
import { SalesHistoryPage } from "../pages/sell/SalesHistoryPage";
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
      { path: "caja/cierre", element: <CloseShiftPage /> },
      { path: "caja/historial", element: <ClosingsPage /> },
      { path: "vender", element: <SellPage /> },
      { path: "vender/historial", element: <SalesHistoryPage /> },
      { path: "vender/historial/:id", element: <SalesHistoryPage /> },
      { path: "productos", element: <ProductsPage /> },
      { path: "productos/carga", element: <LoadModePage /> },
      { path: "productos/importar", element: <ImportPage /> },
      { path: "productos/planilla", element: <CodeSheetPage /> },
      { path: "productos/etiquetas", element: <ShelfLabelsPage /> },
      { path: "productos/movimientos", element: <MovementsPage /> },
      { path: "productos/precios", element: <BulkPricePage /> },
      { path: "productos/conteos", element: <CountsPage /> },
      { path: "productos/conteos/:id", element: <CountPage /> },
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
