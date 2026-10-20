import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { seedId } from "../src/seed/ids";
import { as } from "./helpers/actors";
import { TEST_AUTH } from "./helpers/client";
import { useSeededDb } from "./helpers/seeded";

const ref = useSeededDb();
const app = () => createApp({ db: ref.t.db, auth: TEST_AUTH });

describe("errores que se entienden", () => {
  it("un 400 dice el campo y qué corregir, en español", async () => {
    const julian = await as(app(), ref.t.db, "julian");
    const r = await julian.post("/api/suppliers", { name: "x".repeat(5000), orderDays: [] });
    expect(r.status).toBe(400);
    expect(r.body.error.message).toBe("Nombre: como mucho 80 caracteres");
    expect(r.body.error.details[0]).toMatchObject({
      path: "name",
      field: "Nombre",
      message: "como mucho 80 caracteres",
    });
  });

  it("un nombre con HTML no se guarda", async () => {
    const julian = await as(app(), ref.t.db, "julian");
    const r = await julian.post("/api/suppliers", {
      name: "<b>Prov</b><script>alert(1)</script>",
      orderDays: [],
    });
    expect(r.status).toBe(400);
    expect(r.body.error.message).toBe("Nombre: no puede tener < ni >");
  });

  it("invitar con el PIN de otra persona falla con mensaje", async () => {
    const carlos = await as(app(), ref.t.db, "carlos");
    const r = await carlos.post("/api/members", { name: "Paola", role: "cashier", pin: "1234" });
    expect(r.status).toBe(400);
    expect(r.body.error.message).toBe("Ese PIN no se puede usar: elegí otro.");
    const ok = await carlos.post("/api/members", { name: "Paola", role: "cashier", pin: "7391" });
    expect(ok.status).toBe(201);
  });
});

describe("el escenario de ejemplo", () => {
  it("no tiene fechas en el futuro en la línea de tiempo de los pedidos", async () => {
    const carlos = await as(app(), ref.t.db, "carlos");
    const now = Date.now();
    for (const key of ["order:0041", "order:0042"]) {
      const d = await carlos.get(`/api/orders/${seedId(key)}`);
      expect(d.status).toBe(200);
      for (const t of d.body.timeline as { at: string }[]) {
        expect(new Date(t.at).getTime()).toBeLessThanOrEqual(now + 1000);
      }
    }
  });
});
