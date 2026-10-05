import { api } from "../data/api";
import type { Transport } from "./client";

/** Transporte real: POST /api/sync/push y GET /api/sync/pull. */
export const httpTransport: Transport = {
  push: (body) => api("/api/sync/push", { body }),
  pull: (since, limit) => api(`/api/sync/pull?since=${encodeURIComponent(since)}&limit=${limit}`),
};
