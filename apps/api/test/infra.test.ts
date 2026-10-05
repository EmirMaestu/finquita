import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const root = resolve(import.meta.dirname, "../../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");
/** Una variable de compose tal cual: ${NOMBRE}. */
const v = (name: string) => `$${"{"}${name}}`;

type Service = {
  image?: string;
  ports?: string[];
  command?: string[];
  environment?: Record<string, string>;
  volumes?: string[];
  depends_on?: Record<string, { condition: string }> | string[];
  healthcheck?: unknown;
  restart?: string;
  logging?: { driver: string; options: Record<string, string> };
};

describe("infraestructura de producción", () => {
  const compose = parse(read("infra/docker-compose.prod.yml"), { merge: true }) as {
    services: Record<string, Service>;
    volumes: Record<string, unknown>;
  };
  const s = compose.services;

  it("el compose tiene los cinco servicios y es YAML válido", () => {
    expect(Object.keys(s).sort()).toEqual(["api", "backup", "caddy", "postgres", "worker"]);
    for (const svc of Object.values(s)) {
      expect(svc.restart).toBe("unless-stopped");
      expect(svc.logging).toMatchObject({ driver: "json-file", options: { "max-size": "10m" } });
    }
    expect(Object.keys(compose.volumes).sort()).toEqual([
      "caddy_config",
      "caddy_data",
      "files",
      "pgdata",
    ]);
  });

  it("solo Caddy se expone; Postgres queda adentro", () => {
    expect(s.caddy?.ports).toEqual(["80:80", "443:443", "443:443/udp"]);
    for (const name of ["api", "worker", "postgres", "backup"])
      expect(s[name]?.ports).toBeUndefined();
    expect(s.postgres?.image).toBe("postgres:16-alpine");
    expect(s.postgres?.healthcheck).toBeTruthy();
  });

  it("api y worker comparten imagen, base y fotos; el worker corre pg-boss", () => {
    expect(s.worker?.image).toBe(s.api?.image);
    expect(s.worker?.command).toEqual(["bun", "src/worker.ts"]);
    for (const name of ["api", "worker"]) {
      expect(s[name]?.environment?.DATABASE_URL).toBe(
        `postgres://mostrador:${v("POSTGRES_PASSWORD")}@postgres:5432/mostrador`,
      );
      expect(s[name]?.environment?.BETTER_AUTH_URL).toBe(`https://${v("DOMAIN")}`);
      expect(s[name]?.volumes).toContain("files:/data/files");
      expect(s[name]?.depends_on).toMatchObject({ postgres: { condition: "service_healthy" } });
    }
    expect(s.backup?.volumes).toEqual(["files:/data/files:ro"]);
    expect(s.backup?.environment).toMatchObject({
      RESTIC_REPOSITORY: v("RESTIC_REPOSITORY"),
      PGHOST: "postgres",
    });
  });

  it("Caddyfile con el subdominio de .env, la API en /api y la PWA en /", () => {
    const caddy = read("infra/Caddyfile");
    expect(caddy).toMatch(/^\{\$DOMAIN\} \{/m);
    expect(caddy).toContain("handle /api/*");
    expect(caddy).toContain("reverse_proxy api:3000");
    expect(caddy).toContain("try_files {path} /index.html");
    expect(s.caddy?.environment?.DOMAIN).toBe(v("DOMAIN"));
  });

  it("backup: pg_dump y fotos con restic, 7 diarias, 4 semanales y 12 mensuales", () => {
    const sh = read("infra/backup/backup.sh");
    expect(sh).toContain("pg_dump --format=custom");
    expect(sh).toContain("restic backup");
    expect(sh).toContain("/data/files");
    expect(sh).toContain("--keep-daily 7 --keep-weekly 4 --keep-monthly 12");
    expect(read("infra/backup/crontab")).toMatch(/restore-test\.sh/);
  });

  it(".env.example tiene todo lo que usa el compose", () => {
    const env = read(".env.example");
    const used = new Set(
      [...read("infra/docker-compose.prod.yml").matchAll(/\$\{([A-Z0-9_]+)/g)].map((m) => m[1]),
    );
    for (const v of used)
      expect(env, `falta ${v} en .env.example`).toMatch(new RegExp(`^${v}=`, "m"));
  });
});
