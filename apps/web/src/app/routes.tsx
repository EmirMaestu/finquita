import { Navigate, type RouteObject } from "react-router";
import { AlertsPage } from "../pages/AlertsPage";
import { CashPage } from "../pages/cash/CashPage";
import { CloseShiftPage } from "../pages/cash/CloseShiftPage";
import { ClosingsPage } from "../pages/cash/ClosingsPage";
import { CustomersPage } from "../pages/customers/CustomersPage";
import { HomePage } from "../pages/home/HomePage";
import { ModulePlaceholder } from "../pages/ModulePlaceholder";
import { MorePage } from "../pages/MorePage";
import { BulkPricePage } from "../pages/products/BulkPricePage";
import { CodeSheetPage } from "../pages/products/CodeSheetPage";
import { CountPage, CountsPage } from "../pages/products/CountsPage";
import { ExpiryPage } from "../pages/products/ExpiryPage";
import { ImportPage } from "../pages/products/ImportPage";
import { LoadModePage } from "../pages/products/LoadModePage";
import { MovementsPage } from "../pages/products/MovementsPage";
import { ProductsPage } from "../pages/products/ProductsPage";
import { PromotionsPage } from "../pages/products/PromotionsPage";
import { ShelfLabelsPage } from "../pages/products/ShelfLabelsPage";
import { OrdersPage } from "../pages/purchases/OrdersPage";
import { PayablesPage } from "../pages/purchases/PayablesPage";
import { PriceListPage } from "../pages/purchases/PriceListPage";
import { ReceiptCostsPage } from "../pages/purchases/ReceiptCostsPage";
import { ReceivePage } from "../pages/purchases/ReceivePage";
import { SuggestedFlow } from "../pages/purchases/SuggestedFlow";
import { SuppliersPage } from "../pages/purchases/SuppliersPage";
import { ReportsPage } from "../pages/reports/ReportsPage";
import { SalesHistoryPage } from "../pages/sell/SalesHistoryPage";
import { SellPage } from "../pages/sell/SellPage";
import { SettingsPage } from "../pages/settings/SettingsPage";
import { AppShell } from "./layout/AppShell";
import { MODULES } from "./modules";

export const routes: RouteObject[] = [
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/inicio" replace /> },
      { path: "inicio", element: <HomePage /> },
      { path: "caja", element: <CashPage /> },
      { path: "caja/cierre", element: <CloseShiftPage /> },
      { path: "caja/historial", element: <ClosingsPage /> },
      { path: "vender", element: <SellPage /> },
      { path: "compras", element: <Navigate to="/compras/pedidos" replace /> },
      { path: "compras/proveedores", element: <SuppliersPage /> },
      { path: "compras/sugerido", element: <SuggestedFlow /> },
      { path: "compras/pedidos", element: <OrdersPage /> },
      { path: "compras/pedidos/:id", element: <OrdersPage /> },
      { path: "compras/recepcion", element: <ReceivePage /> },
      { path: "compras/facturas", element: <PayablesPage /> },
      { path: "clientes", element: <CustomersPage /> },
      { path: "avisos", element: <AlertsPage /> },
      { path: "reportes", element: <ReportsPage /> },
      { path: "ajustes", element: <SettingsPage /> },
      { path: "ajustes/:section", element: <SettingsPage /> },
      { path: "reportes/:kind", element: <ReportsPage /> },
      { path: "clientes/:id", element: <CustomersPage /> },
      { path: "compras/listas", element: <PriceListPage /> },
      { path: "compras/recepcion/:id/costos", element: <ReceiptCostsPage /> },
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
      { path: "productos/promociones", element: <PromotionsPage /> },
      { path: "productos/vencimientos", element: <ExpiryPage /> },
      { path: "productos/conteos/:id", element: <CountPage /> },
      { path: "productos/:id", element: <ProductsPage /> },
      ...MODULES.filter(
        (m) =>
          ![
            "inicio",
            "productos",
            "caja",
            "vender",
            "compras",
            "clientes",
            "reportes",
            "ajustes",
          ].includes(m.id),
      ).map((m) => ({
        path: `${m.path.slice(1)}/*`,
        element: <ModulePlaceholder />,
      })),
      { path: "mas", element: <MorePage /> },
      { path: "*", element: <Navigate to="/inicio" replace /> },
    ],
  },
];
