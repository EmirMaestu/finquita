import type { Context, MiddlewareHandler } from "hono";
import type { z } from "zod";
import { ApiError } from "./errors";

type Target = "json" | "query" | "param";

export function validationError(error: z.ZodError): ApiError {
  return new ApiError(
    400,
    "validation",
    "Revisá los datos: hay campos con errores.",
    error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
  );
}

async function read(c: Context, target: Target): Promise<unknown> {
  if (target === "query") return c.req.query();
  if (target === "param") return c.req.param();
  try {
    return await c.req.json();
  } catch {
    throw new ApiError(400, "invalid_json", "El cuerpo no es JSON válido.");
  }
}

/** Valida con Zod y deja el resultado en `c.req.valid(target)`. */
export function validate<T extends Target, S extends z.ZodType>(
  target: T,
  schema: S,
): MiddlewareHandler<
  // biome-ignore lint/suspicious/noExplicitAny: el Env lo aporta la ruta
  any,
  string,
  { in: { [K in T]: z.input<S> }; out: { [K in T]: z.output<S> } }
> {
  return async (c, next) => {
    const parsed = schema.safeParse(await read(c, target));
    if (!parsed.success) throw validationError(parsed.error);
    c.req.addValidatedData(target, parsed.data as object);
    await next();
  };
}
