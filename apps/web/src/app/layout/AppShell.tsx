import { useState } from "react";
import { Outlet, useLocation } from "react-router";
import { PinAuthorizer } from "../../auth/pinAuth";
import { GlobalScan } from "../../scan/GlobalScan";
import { InstallGuide } from "../../ui/InstallGuide";
import { Toaster } from "../../ui/toast";
import { moduleForPath } from "../modules";
import { useViewport } from "../useViewport";
import { BottomBar } from "./BottomBar";
import { CounterTopBar } from "./CounterTopBar";
import { DesktopTopBar } from "./DesktopTopBar";
import { MobileTopBar } from "./MobileTopBar";
import { Rail } from "./Rail";
import { Sidebar } from "./Sidebar";

function readCollapsed(): boolean {
  try {
    return localStorage.getItem("mostrador.sidebar") === "collapsed";
  } catch {
    return false;
  }
}

/**
 * Celular: barra superior y barra inferior. Tablet vertical: riel de íconos.
 * Compu: barra superior con búsqueda y chips, y barra lateral colapsable.
 */
export function AppShell() {
  const { layout } = useViewport();
  const location = useLocation();
  const title =
    location.pathname === "/mas" ? "Más" : (moduleForPath(location.pathname)?.label ?? "");
  const [collapsed, setCollapsed] = useState(readCollapsed);

  if (layout === "phone") {
    return (
      <div className="flex min-h-full flex-col bg-fondo" data-layout="phone">
        <MobileTopBar title={title} />
        <main className="flex-1 pb-[96px]">
          <InstallGuide />
          <Outlet />
        </main>
        <BottomBar />
        <GlobalScan />
        <Toaster />
        <PinAuthorizer />
      </div>
    );
  }

  if (layout === "tablet") {
    return (
      <div className="flex h-full bg-fondo" data-layout="tablet">
        <Rail />
        <div className="flex min-w-0 flex-1 flex-col">
          <MobileTopBar title={title} />
          <main className="min-h-0 flex-1 overflow-y-auto">
            <Outlet />
          </main>
        </div>
        <GlobalScan />
        <Toaster />
        <PinAuthorizer />
      </div>
    );
  }

  // Modo mostrador: Vender ocupa toda la pantalla, sin barra lateral.
  if (location.pathname === "/vender") {
    return (
      <div className="flex h-full flex-col bg-fondo" data-layout={layout} data-mode="counter">
        <CounterTopBar />
        <main className="min-h-0 flex-1">
          <Outlet />
        </main>
        <GlobalScan />
        <Toaster />
        <PinAuthorizer />
      </div>
    );
  }

  const toggle = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem("mostrador.sidebar", c ? "open" : "collapsed");
      } catch {}
      return !c;
    });
  };

  return (
    <div className="flex h-full flex-col bg-fondo" data-layout={layout}>
      <DesktopTopBar onToggleSidebar={toggle} />
      <div className="flex min-h-0 flex-1">
        {collapsed ? <Rail /> : <Sidebar />}
        <main className="min-w-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
      <GlobalScan />
      <Toaster />
      <PinAuthorizer />
    </div>
  );
}
