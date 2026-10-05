import { render } from "@testing-library/react";
import { act, type ReactElement } from "react";
import { createMemoryRouter, type RouteObject, RouterProvider } from "react-router";
import { defaultShell, ShellProvider, type ShellState } from "../src/app/shell";

export function setViewport(width: number, height = width < 600 ? 852 : 800) {
  act(() => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: height });
    window.dispatchEvent(new Event("resize"));
  });
}

export function renderRoutes(
  routes: RouteObject[],
  { path = "/", shell = {} }: { path?: string; shell?: Partial<ShellState> } = {},
) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const utils = render(
    <ShellProvider value={{ ...defaultShell, ...shell }}>
      <RouterProvider router={router} />
    </ShellProvider>,
  );
  return { ...utils, router };
}

export function renderEl(el: ReactElement) {
  return render(el);
}
