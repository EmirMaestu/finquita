import { Navigate, type RouteObject } from "react-router";
import { ModulePlaceholder } from "../pages/ModulePlaceholder";
import { MorePage } from "../pages/MorePage";
import { AppShell } from "./layout/AppShell";
import { MODULES } from "./modules";

export const routes: RouteObject[] = [
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/inicio" replace /> },
      ...MODULES.map((m) => ({ path: `${m.path.slice(1)}/*`, element: <ModulePlaceholder /> })),
      { path: "mas", element: <MorePage /> },
      { path: "*", element: <Navigate to="/inicio" replace /> },
    ],
  },
];
