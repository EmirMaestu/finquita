import Dexie, { type Table } from "dexie";
import type {
  Delta,
  LocalBarcode,
  LocalCustomer,
  LocalProduct,
  LocalShift,
  QueuedOp,
  RejectedOp,
  Row,
} from "./types";

/** Copia local del dispositivo (IndexedDB): lo que necesita para vender sin internet. */
export class MostradorDB extends Dexie {
  products!: Table<LocalProduct, string>;
  barcodes!: Table<LocalBarcode, string>;
  categories!: Table<Row, string>;
  customers!: Table<LocalCustomer, string>;
  settings!: Table<{ key: string; value: unknown }, string>;
  registers!: Table<Row, string>;
  members!: Table<Row, string>;
  shifts!: Table<LocalShift, string>;
  suppliers!: Table<Row, string>;
  promotions!: Table<Row, string>;
  queue!: Table<QueuedOp, number>;
  rejected!: Table<RejectedOp, string>;
  deltas!: Table<Delta, number>;
  sales!: Table<Row, string>;
  meta!: Table<{ key: string; value: unknown }, string>;

  constructor(name = "mostrador") {
    super(name);
    this.version(1).stores({
      products: "id, name, internalCode, categoryId",
      barcodes: "id, code, productId",
      categories: "id, parentId",
      customers: "id, name",
      settings: "key",
      registers: "id",
      members: "id",
      shifts: "id, registerId, status",
      suppliers: "id",
      promotions: "id",
      queue: "++seq, &opId, type",
      rejected: "opId",
      deltas: "++id, opId, [kind+key]",
      sales: "id, number, deviceAt, shiftId",
      meta: "key",
    });
  }

  async getMeta<T>(key: string): Promise<T | undefined> {
    return (await this.meta.get(key))?.value as T | undefined;
  }

  async setMeta(key: string, value: unknown): Promise<void> {
    await this.meta.put({ key, value });
  }
}

/** Tablas que llena el pull, por nombre de entidad del servidor. */
export const PULL_TABLES = [
  "products",
  "barcodes",
  "categories",
  "customers",
  "settings",
  "registers",
  "members",
  "shifts",
  "suppliers",
  "promotions",
] as const;
export type PullTable = (typeof PULL_TABLES)[number];

let instance: MostradorDB | null = null;
export function localDb(): MostradorDB {
  instance ??= new MostradorDB();
  return instance;
}
