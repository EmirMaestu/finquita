/**
 * Escenario de ejemplo del spec (§ Datos de ejemplo): Almacén La Esquina, Godoy Cruz.
 * Todos los valores son ficticios. Plata en pesos acá; el seed la pasa a centavos.
 */
import type { CreditTerms, Role, SaleUnit, SupplierChannel } from "../db/schema/index";

export const BUSINESS = {
  name: "Almacén La Esquina",
  address: "San Martín 1234",
  city: "Godoy Cruz, Mendoza",
  cuit: "20-12345678-9",
  taxCondition: "monotributo" as const,
  hours: "Lunes a sábado de 8 a 13 y de 17 a 21",
};

/** Medios de pago del local: alias y CVU de ejemplo. */
export const PAYMENTS = { alias: "la.esquina.mp", cvu: "0000003100012345678901" };

export const TEAM: { key: string; name: string; role: Role; email?: string; pin: string }[] = [
  {
    key: "carlos",
    name: "Carlos Díaz",
    role: "owner",
    email: "carlos@laesquina.example",
    pin: "1234",
  },
  {
    key: "julian",
    name: "Julián",
    role: "manager",
    email: "julian@laesquina.example",
    pin: "2345",
  },
  { key: "lucia", name: "Lucía", role: "cashier", pin: "3456" },
  { key: "tomas", name: "Tomás", role: "cashier", pin: "4567" },
  { key: "nico", name: "Nico", role: "stocker", pin: "5678" },
];

/** Categorías en dos niveles: [padre, hijo, ganancia por defecto %, +18] */
export const CATEGORIES: {
  key: string;
  name: string;
  parent?: string;
  margin?: number;
  adult?: boolean;
  expiry?: boolean;
}[] = [
  { key: "almacen", name: "Almacén", margin: 40 },
  { key: "infusiones", name: "Infusiones", parent: "almacen" },
  { key: "aceites", name: "Aceites", parent: "almacen" },
  { key: "pastas", name: "Pastas", parent: "almacen" },
  { key: "bebidas", name: "Bebidas", margin: 40 },
  { key: "gaseosas", name: "Gaseosas", parent: "bebidas" },
  { key: "cervezas", name: "Cervezas", parent: "bebidas", adult: true },
  { key: "lacteos", name: "Lácteos", margin: 44, expiry: true },
  { key: "leches", name: "Leches", parent: "lacteos" },
  { key: "quesos-blandos", name: "Quesos y cremas", parent: "lacteos" },
  { key: "yogures", name: "Yogures y postres", parent: "lacteos" },
  { key: "panaderia", name: "Panadería", margin: 41 },
  { key: "fiambreria", name: "Fiambrería", margin: 45, expiry: true },
  { key: "fiambres", name: "Fiambres", parent: "fiambreria" },
  { key: "quesos", name: "Quesos", parent: "fiambreria" },
  { key: "huevos", name: "Huevos", margin: 30 },
  { key: "limpieza", name: "Limpieza", margin: 50 },
  { key: "kiosco", name: "Kiosco", margin: 15 },
  { key: "cigarrillos", name: "Cigarrillos", parent: "kiosco", adult: true },
  { key: "verduleria", name: "Verdulería", margin: 40 },
];

export type ScenarioProduct = {
  key: string;
  name: string;
  category: string;
  barcode?: string;
  plu?: string;
  unit?: SaleUnit;
  cost: number;
  price: number;
  stock: number;
  min: number;
  supplier: string;
  supplierCode?: string;
  pack?: number;
  packName?: string;
  adult?: boolean;
  fixedPrice?: boolean;
  quick?: boolean;
  location?: string;
  /** Presentación vinculada: [producto base, factor] */
  base?: [string, number];
  expiresInDays?: number;
};

/** Los 13 productos del spec y los que completan el pedido 0042 y los botones rápidos. */
export const PRODUCTS: ScenarioProduct[] = [
  {
    key: "coca",
    name: "Coca-Cola 2,25 L",
    category: "gaseosas",
    barcode: "7790000001017",
    cost: 3300,
    price: 4600,
    stock: 14,
    min: 12,
    supplier: "andina",
    supplierCode: "CC-225",
    pack: 8,
    packName: "Pack",
    location: "Heladera 1",
  },
  {
    key: "yerba",
    name: "Yerba Playadito 1 kg",
    category: "infusiones",
    barcode: "7791234000012",
    cost: 4850,
    price: 6900,
    stock: 3,
    min: 8,
    supplier: "andina",
    supplierCode: "YPL-1K",
    pack: 12,
    packName: "Caja",
    location: "Góndola 3",
  },
  {
    key: "leche",
    name: "Leche entera 1 L sachet",
    category: "leches",
    barcode: "7790000002014",
    cost: 1350,
    price: 1950,
    stock: 0,
    min: 24,
    supplier: "lacteos",
    supplierCode: "LE-1L",
    pack: 12,
    packName: "Cajón",
  },
  {
    key: "ricota",
    name: "Ricota 500 g",
    category: "quesos-blandos",
    barcode: "7790000002021",
    cost: 1800,
    price: 2600,
    stock: 2,
    min: 6,
    supplier: "lacteos",
    supplierCode: "RI-500",
  },
  {
    key: "pan",
    name: "Pan francés",
    category: "panaderia",
    plu: "1001",
    unit: "kg",
    cost: 2700,
    price: 3800,
    stock: 6.4,
    min: 5,
    supplier: "panificadora",
    quick: true,
  },
  {
    key: "jamon",
    name: "Jamón cocido",
    category: "fiambres",
    plu: "2001",
    unit: "kg",
    cost: 14500,
    price: 21000,
    stock: 2.15,
    min: 2,
    supplier: "fiambres",
    quick: true,
    expiresInDays: 3,
  },
  {
    key: "queso",
    name: "Queso cremoso",
    category: "quesos",
    plu: "2010",
    unit: "kg",
    cost: 9600,
    price: 13500,
    stock: 1.8,
    min: 2,
    supplier: "fiambres",
    quick: true,
  },
  {
    key: "aceite",
    name: "Aceite de girasol 1,5 L",
    category: "aceites",
    barcode: "7790000003011",
    cost: 4000,
    price: 5400,
    stock: 9,
    min: 6,
    supplier: "andina",
    supplierCode: "AG-15",
    pack: 12,
    packName: "Caja",
  },
  {
    key: "fideos",
    name: "Fideos tirabuzón 500 g",
    category: "pastas",
    barcode: "7790000003028",
    cost: 1300,
    price: 1900,
    stock: 22,
    min: 10,
    supplier: "andina",
    supplierCode: "FT-500",
    pack: 20,
    packName: "Bulto",
  },
  {
    key: "maple",
    name: "Huevos maple x 30",
    category: "huevos",
    plu: "3001",
    cost: 6300,
    price: 8200,
    stock: 4,
    min: 3,
    supplier: "mayorista",
    quick: true,
    base: ["huevo", 30],
  },
  {
    key: "huevo",
    name: "Huevo suelto",
    category: "huevos",
    plu: "3002",
    cost: 210,
    price: 290,
    stock: 120,
    min: 90,
    supplier: "mayorista",
    quick: true,
  },
  {
    key: "lavandina",
    name: "Lavandina 1 L",
    category: "limpieza",
    barcode: "7790000004018",
    cost: 850,
    price: 1300,
    stock: 0,
    min: 6,
    supplier: "limpieza",
    supplierCode: "LV-1L",
    pack: 12,
    packName: "Caja",
  },
  {
    key: "cerveza",
    name: "Cerveza rubia lata 473 ml",
    category: "cervezas",
    barcode: "7790000005015",
    cost: 1650,
    price: 2300,
    stock: 48,
    min: 24,
    supplier: "andina",
    supplierCode: "CR-473",
    pack: 24,
    packName: "Pack",
    adult: true,
  },
  {
    key: "cigarrillos",
    name: "Cigarrillos atado x 20",
    category: "cigarrillos",
    barcode: "7790000005022",
    cost: 4150,
    price: 4700,
    stock: 40,
    min: 20,
    supplier: "andina",
    supplierCode: "CG-20",
    pack: 10,
    packName: "Cartón",
    adult: true,
    fixedPrice: true,
  },
  // Lácteos del Sur: completan el pedido 0042.
  {
    key: "yogur",
    name: "Yogur bebible 1 L",
    category: "yogures",
    barcode: "7790000002038",
    cost: 2100,
    price: 3000,
    stock: 4,
    min: 8,
    supplier: "lacteos",
    supplierCode: "YB-1L",
    pack: 6,
  },
  {
    key: "manteca",
    name: "Manteca 200 g",
    category: "quesos-blandos",
    barcode: "7790000002045",
    cost: 2300,
    price: 3300,
    stock: 3,
    min: 6,
    supplier: "lacteos",
    supplierCode: "MA-200",
  },
  {
    key: "quesocrema",
    name: "Queso crema 290 g",
    category: "quesos-blandos",
    barcode: "7790000002052",
    cost: 2900,
    price: 4200,
    stock: 2,
    min: 6,
    supplier: "lacteos",
    supplierCode: "QC-290",
  },
  {
    key: "descremada",
    name: "Leche descremada 1 L sachet",
    category: "leches",
    barcode: "7790000002069",
    cost: 1400,
    price: 2000,
    stock: 6,
    min: 12,
    supplier: "lacteos",
    supplierCode: "LD-1L",
    pack: 12,
    packName: "Cajón",
  },
  {
    key: "ddl",
    name: "Dulce de leche 400 g",
    category: "quesos-blandos",
    barcode: "7790000002076",
    cost: 2300,
    price: 3300,
    stock: 2,
    min: 6,
    supplier: "lacteos",
    supplierCode: "DL-400",
  },
  {
    key: "rallado",
    name: "Queso rallado 150 g",
    category: "quesos-blandos",
    barcode: "7790000002083",
    cost: 2600,
    price: 3700,
    stock: 1,
    min: 4,
    supplier: "lacteos",
    supplierCode: "QR-150",
  },
  {
    key: "crema",
    name: "Crema de leche 200 ml",
    category: "quesos-blandos",
    barcode: "7790000002090",
    cost: 1500,
    price: 2200,
    stock: 2,
    min: 6,
    supplier: "lacteos",
    supplierCode: "CR-200",
  },
  {
    key: "yogurfirme",
    name: "Yogur firme 190 g",
    category: "yogures",
    barcode: "7790000002106",
    cost: 750,
    price: 1100,
    stock: 5,
    min: 12,
    supplier: "lacteos",
    supplierCode: "YF-190",
  },
  {
    key: "chocolatada",
    name: "Leche chocolatada 1 L",
    category: "leches",
    barcode: "7790000002113",
    cost: 1900,
    price: 2700,
    stock: 2,
    min: 4,
    supplier: "lacteos",
    supplierCode: "LC-1L",
  },
  {
    key: "postre",
    name: "Postre de vainilla 120 g",
    category: "yogures",
    barcode: "7790000002120",
    cost: 500,
    price: 750,
    stock: 3,
    min: 6,
    supplier: "lacteos",
    supplierCode: "PV-120",
  },
  {
    key: "untable",
    name: "Queso untable light 190 g",
    category: "quesos-blandos",
    barcode: "7790000002137",
    cost: 2200,
    price: 3200,
    stock: 2,
    min: 3,
    supplier: "lacteos",
    supplierCode: "QU-190",
  },
  {
    key: "flan",
    name: "Flan casero 120 g",
    category: "yogures",
    barcode: "7790000002144",
    cost: 500,
    price: 750,
    stock: 2,
    min: 4,
    supplier: "lacteos",
    supplierCode: "FC-120",
  },
];

export const SUPPLIERS: {
  key: string;
  name: string;
  category: string;
  orderDays: number[];
  deliveryDays: number[];
  scheduleNote?: string;
  channel: SupplierChannel;
  contact?: string;
  whatsapp?: string;
  /** Saldo a pagar (facturas pendientes). */
  balance: number;
  minOrder?: number;
  termsDays?: number;
}[] = [
  {
    key: "andina",
    name: "Distribuidora Andina",
    category: "Bebidas y almacén",
    orderDays: [5],
    deliveryDays: [1],
    channel: "whatsapp",
    contact: "Gustavo",
    whatsapp: "5492614000001",
    balance: 96300,
    minOrder: 150000,
    termsDays: 15,
  },
  {
    key: "lacteos",
    name: "Lácteos del Sur",
    category: "Lácteos",
    orderDays: [2],
    deliveryDays: [4],
    channel: "whatsapp",
    contact: "Marcelo",
    whatsapp: "5492614000002",
    balance: 184500,
    minOrder: 150000,
    termsDays: 15,
  },
  {
    key: "panificadora",
    name: "Panificadora San Martín",
    category: "Pan",
    orderDays: [0, 1, 2, 3, 4, 5, 6],
    deliveryDays: [0, 1, 2, 3, 4, 5, 6],
    scheduleNote: "Diario (pedido fijo)",
    channel: "whatsapp",
    contact: "Rubén",
    whatsapp: "5492614000003",
    balance: 41000,
    termsDays: 7,
  },
  {
    key: "fiambres",
    name: "Fiambres Don Luis",
    category: "Fiambres y quesos",
    orderDays: [5],
    deliveryDays: [6],
    channel: "whatsapp",
    contact: "Luis",
    whatsapp: "5492614000004",
    balance: 0,
    termsDays: 7,
  },
  {
    key: "limpieza",
    name: "Limpieza Cuyo",
    category: "Limpieza",
    orderDays: [],
    deliveryDays: [],
    scheduleNote: "Cada 15 días · entrega 2 días después",
    channel: "manual",
    contact: "Silvia",
    balance: 22800,
    termsDays: 30,
  },
  {
    key: "mayorista",
    name: "Mayorista Central",
    category: "Almacén y varios",
    orderDays: [],
    deliveryDays: [],
    channel: "wholesale",
    balance: 0,
  },
];

/** Fiado con plazo de 30 días: movimientos con su antigüedad en días (− es pago). */
export const CUSTOMERS: {
  key: string;
  name: string;
  nickname?: string;
  phone?: string;
  limit: number;
  terms: CreditTerms;
  ledger: { daysAgo: number; amount: number }[];
}[] = [
  {
    key: "rosa",
    name: "Rosa Giménez",
    phone: "2614111111",
    limit: 30000,
    terms: "30d",
    ledger: [
      { daysAgo: 12, amount: 8400 },
      { daysAgo: 5, amount: 10000 },
    ],
  },
  {
    key: "tano",
    name: "El Tano (obra)",
    nickname: "El Tano",
    phone: "2614222222",
    limit: 40000,
    terms: "30d",
    ledger: [
      { daysAgo: 38, amount: 30000 },
      { daysAgo: 33, amount: 12100 },
    ],
  },
  {
    key: "sergio",
    name: "Sergio Paz",
    phone: "2614333333",
    limit: 15000,
    terms: "30d",
    ledger: [{ daysAgo: 35, amount: 3100 }],
  },
  {
    key: "ortiz",
    name: "Familia Ortiz",
    phone: "2614444444",
    limit: 20000,
    terms: "30d",
    ledger: [
      { daysAgo: 31, amount: 4000 },
      { daysAgo: 20, amount: 6200 },
      { daysAgo: 10, amount: -2400 },
    ],
  },
  {
    key: "marta",
    name: "Marta (vecina)",
    nickname: "Marta",
    limit: 10000,
    terms: "30d",
    ledger: [{ daysAgo: 9, amount: 2400 }],
  },
];

/** Pedido 0042 a Lácteos del Sur: 14 productos, $ 186.400. */
export const ORDER_0042: { product: string; qty: number }[] = [
  { product: "leche", qty: 24 },
  { product: "yogur", qty: 12 },
  { product: "ricota", qty: 4 },
  { product: "manteca", qty: 10 },
  { product: "quesocrema", qty: 8 },
  { product: "descremada", qty: 12 },
  { product: "ddl", qty: 6 },
  { product: "rallado", qty: 5 },
  { product: "crema", qty: 6 },
  { product: "yogurfirme", qty: 12 },
  { product: "chocolatada", qty: 4 },
  { product: "postre", qty: 6 },
  { product: "untable", qty: 1 },
  { product: "flan", qty: 2 },
];
