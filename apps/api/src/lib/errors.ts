import type { ContentfulStatusCode } from "hono/utils/http-status";

/**
 * Error que la API muestra tal cual. El mensaje dice qué hacer, en voseo;
 * `code` es estable para que la app decida (por ejemplo, pedir PIN).
 */
export class ApiError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new ApiError(400, "bad_request", message, details);
export const unauthorized = (message = "Iniciá sesión para seguir.") =>
  new ApiError(401, "unauthorized", message);
export const forbidden = (message: string, details?: unknown) =>
  new ApiError(403, "forbidden", message, details);
export const notFound = (message = "No lo encontramos.") => new ApiError(404, "not_found", message);
export const conflict = (message: string, details?: unknown) =>
  new ApiError(409, "conflict", message, details);
