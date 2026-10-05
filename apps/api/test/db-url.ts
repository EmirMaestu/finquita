/** URL de la base para tests: TEST_DATABASE_URL o, si no está, DATABASE_URL. */
export function baseTestUrl(): string {
  const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("Los tests de integración necesitan DATABASE_URL o TEST_DATABASE_URL");
  return url;
}

export function withDatabase(url: string, name: string): string {
  const u = new URL(url);
  u.pathname = `/${name}`;
  return u.toString();
}

export const TEMPLATE_DB = "mostrador_test_tpl";
