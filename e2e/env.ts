/**
 * Puertos y bases de los e2e. Con E2E_SLOT=N (N > 0) varios agentes corren en paralelo en la
 * misma máquina: cada slot suma N*10 a los puertos y agrega el sufijo _aN a las bases.
 * Sin E2E_SLOT (o 0) queda todo como siempre: 3100/3101, 5174/5175, mostrador_e2e(_vacio).
 */
const slot = Number(process.env.E2E_SLOT ?? 0);
if (!Number.isInteger(slot) || slot < 0) {
  throw new Error(`E2E_SLOT tiene que ser un entero >= 0 (vino "${process.env.E2E_SLOT}")`);
}
const port = (base: number) => base + slot * 10;
const url = (p: number) => `http://localhost:${p}`;
const db = (name: string) => (slot > 0 ? `${name}_a${slot}` : name);

export const E2E = {
  slot,
  db: db("mostrador_e2e"),
  apiPort: port(3100),
  webPort: port(5174),
  webUrl: url(port(5174)),
  macToken: "e2e-token-de-la-mac",
  owner: { email: "carlos@laesquina.example", password: "contraseña-del-dueño" },
  /** Instalación nueva, sin datos (primer uso). */
  empty: {
    db: db("mostrador_e2e_vacio"),
    apiPort: port(3101),
    webPort: port(5175),
    webUrl: url(port(5175)),
  },
};
