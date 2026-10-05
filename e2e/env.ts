export const E2E = {
  db: "mostrador_e2e",
  apiPort: 3100,
  webPort: 5174,
  webUrl: "http://localhost:5174",
  macToken: "e2e-token-de-la-mac",
  owner: { email: "carlos@laesquina.example", password: "contraseña-del-dueño" },
  /** Instalación nueva, sin datos (primer uso). */
  empty: {
    db: "mostrador_e2e_vacio",
    apiPort: 3101,
    webPort: 5175,
    webUrl: "http://localhost:5175",
  },
};
