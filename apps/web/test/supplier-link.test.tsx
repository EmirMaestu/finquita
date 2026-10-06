import type { Grant, Permission } from "@mostrador/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type Me, SessionProvider } from "../src/app/session";
import { SupplierLinkSheet } from "../src/pages/products/SupplierLinkSheet";

const ANDINA = "0190a000-0000-7000-8000-000000000001";
const YERBA = "0190a000-0000-7000-8000-000000000002";

function me(grants: Partial<Record<Permission, Grant>>): Me {
  return {
    business: { name: "Almacén" },
    member: { id: "m1", name: "Julián", role: "owner", email: null },
    permissions: new Proxy(grants, { get: (t, k) => t[k as Permission] ?? "deny" }) as Record<
      Permission,
      Grant
    >,
    device: null,
    via: "password",
  };
}

function mount(el: ReactElement, grants: Partial<Record<Permission, Grant>>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SessionProvider me={me(grants)}>{el}</SessionProvider>
    </QueryClientProvider>,
  );
}

type Call = { url: string; method: string; body: unknown };

function mockFetch(routes: Record<string, unknown>) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      const hit = Object.entries(routes).find(([k]) => url.startsWith(k));
      return new Response(JSON.stringify(hit ? hit[1] : { ok: true }), { status: 200 });
    }),
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe("vincular productos con proveedores", () => {
  it("desde la ficha del producto: elige proveedor, código, costo, bulto y queda principal", async () => {
    const calls = mockFetch({
      "/api/suppliers?light=1": [{ id: ANDINA, name: "Distribuidora Andina" }],
    });
    const onClose = vi.fn();
    mount(<SupplierLinkSheet from="product" productId={YERBA} firstLink onClose={onClose} />, {
      build_orders: "allow",
      view_costs: "allow",
    });
    const select = await screen.findByLabelText(/^Proveedor$/);
    await screen.findByRole("option", { name: "Distribuidora Andina" });
    fireEvent.change(select, { target: { value: ANDINA } });
    fireEvent.change(screen.getByLabelText(/^Código del proveedor/), {
      target: { value: "YPL-1K" },
    });
    fireEvent.change(screen.getByLabelText(/^Costo del proveedor/), {
      target: { value: "4.850,50" },
    });
    expect(screen.getByText("$ 4.850,50")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/^Unidades por bulto/), { target: { value: "10" } });
    expect(screen.getByRole("switch", { name: /Proveedor principal/ })).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const put = calls.find((c) => c.method === "PUT");
    expect(put?.url).toBe(`/api/suppliers/${ANDINA}/products`);
    expect(put?.body).toEqual({
      productId: YERBA,
      supplierCode: "YPL-1K",
      costCents: 485050,
      packQty: 10,
      isPrimary: true,
    });
  });

  it("sin ver costos no muestra ni manda el costo", async () => {
    const calls = mockFetch({});
    const onClose = vi.fn();
    mount(
      <SupplierLinkSheet
        from="supplier"
        supplierId={ANDINA}
        link={{
          supplierId: ANDINA,
          productId: YERBA,
          productName: "Yerba Playadito 1 kg",
          supplierCode: "YPL-1K",
          packQty: null,
          isPrimary: false,
        }}
        onClose={onClose}
      />,
      { build_orders: "allow" },
    );
    expect(screen.queryByLabelText(/^Costo del proveedor/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const put = calls.find((c) => c.method === "PUT");
    expect(put?.body).not.toHaveProperty("costCents");
  });

  it("quitar pide confirmación y borra el vínculo", async () => {
    const calls = mockFetch({});
    const onClose = vi.fn();
    mount(
      <SupplierLinkSheet
        from="product"
        productId={YERBA}
        link={{
          supplierId: ANDINA,
          productId: YERBA,
          supplierName: "Distribuidora Andina",
          supplierCode: null,
          packQty: null,
          isPrimary: true,
        }}
        onClose={onClose}
      />,
      { build_orders: "allow" },
    );
    fireEvent.click(screen.getByRole("button", { name: "Quitar" }));
    expect(screen.getByRole("alert")).toHaveTextContent("¿Quitás el vínculo?");
    expect(calls.some((c) => c.method === "DELETE")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Sí, quitar" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(calls.find((c) => c.method === "DELETE")?.url).toBe(
      `/api/suppliers/${ANDINA}/products/${YERBA}`,
    );
  });
});
