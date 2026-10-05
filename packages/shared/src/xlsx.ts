/**
 * Lector mínimo de .xlsx (la primera hoja) sin dependencias: un .xlsx es un zip con XML.
 * Descomprime con DecompressionStream("deflate-raw"), que traen los navegadores y Node.
 */

type Entry = { name: string; method: number; offset: number; compSize: number };

function readEntries(buf: Uint8Array): Entry[] {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("No es un archivo de Excel (.xlsx)");
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const entries: Entry[] = [];
  const dec = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (view.getUint32(p, true) !== 0x02014b50) break;
    const method = view.getUint16(p + 10, true);
    const compSize = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const local = view.getUint32(p + 42, true);
    const name = dec.decode(buf.subarray(p + 46, p + 46 + nameLen));
    const lNameLen = view.getUint16(local + 26, true);
    const lExtraLen = view.getUint16(local + 28, true);
    entries.push({ name, method, compSize, offset: local + 30 + lNameLen + lExtraLen });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const body = new Response(data as unknown as ArrayBuffer).body;
  if (!body) throw new Error("No se pudo leer el Excel");
  const stream = body.pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function readText(buf: Uint8Array, e: Entry): Promise<string> {
  const raw = buf.subarray(e.offset, e.offset + e.compSize);
  const bytes = e.method === 0 ? raw : await inflate(raw);
  return new TextDecoder().decode(bytes);
}

const xmlUnescape = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&amp;/g, "&");

function colIndex(ref: string): number {
  const letters = ref.replace(/\d+/g, "");
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** Filas de la primera hoja como texto (los números como los guarda Excel: 6900, 0.35). */
export async function readXlsx(data: ArrayBuffer | Uint8Array): Promise<string[][]> {
  const buf = data instanceof Uint8Array ? data : new Uint8Array(data);
  const entries = readEntries(buf);
  const find = (n: string) => entries.find((e) => e.name === n);
  const shared: string[] = [];
  const ss = find("xl/sharedStrings.xml");
  if (ss) {
    const xml = await readText(buf, ss);
    for (const si of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
      const parts = [...(si[1] ?? "").matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) =>
        xmlUnescape(m[1] ?? ""),
      );
      shared.push(parts.join(""));
    }
  }
  const sheet =
    find("xl/worksheets/sheet1.xml") ??
    entries.find((e) => /^xl\/worksheets\/sheet\d+\.xml$/.test(e.name));
  if (!sheet) throw new Error("El Excel no tiene hojas");
  const xml = await readText(buf, sheet);
  const rows: string[][] = [];
  for (const r of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const row: string[] = [];
    for (const c of (r[1] ?? "").matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1] ?? "";
      const ref = /r="([A-Z]+\d+)"/.exec(attrs)?.[1];
      const type = /t="(\w+)"/.exec(attrs)?.[1];
      const body = c[2] ?? "";
      let value = "";
      if (type === "inlineStr")
        value = xmlUnescape(/<t[^>]*>([\s\S]*?)<\/t>/.exec(body)?.[1] ?? "");
      else {
        const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? "";
        value = type === "s" ? (shared[Number(v)] ?? "") : xmlUnescape(v);
      }
      const idx = ref ? colIndex(ref) : row.length;
      while (row.length < idx) row.push("");
      row[idx] = value;
    }
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}
