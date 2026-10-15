/**
 * Carga el .env de la raíz del repo (si existe) en process.env, sin pisar las variables que ya
 * vienen definidas: en el contenedor del agente, DATABASE_URL y TEST_DATABASE_URL llegan por el
 * entorno y siguen mandando; en una shell local alcanza con el .env.
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

export function loadRootEnv(file = fileURLToPath(new URL("../.env", import.meta.url))): void {
  if (!existsSync(file)) return;
  for (const [key, value] of Object.entries(parseEnv(readFileSync(file, "utf8")))) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadRootEnv();
