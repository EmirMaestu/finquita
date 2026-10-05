import { Button } from "../../ui/Button";

/** Comprobante de cierre: para imprimir o compartir. */
export function ClosingReceipt({ lines, onDone }: { lines: string[]; onDone?: () => void }) {
  const print = () => {
    const w = window.open("", "_blank", "width=420,height=640");
    if (!w) return window.print();
    w.document.write(
      `<pre style="font:12px/1.3 ui-monospace,Menlo,monospace">${lines.join("\n").replace(/[<&]/g, (c) => (c === "<" ? "&lt;" : "&amp;"))}</pre>`,
    );
    w.document.close();
    w.print();
  };
  const share = async () => {
    const text = lines.join("\n");
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    if (nav.share) await nav.share({ title: "Cierre de caja", text }).catch(() => {});
    else await navigator.clipboard?.writeText(text).catch(() => {});
  };
  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 p-4 lg:p-6">
      <h1 className="m-0 text-[22px] font-semibold">Turno cerrado</h1>
      <pre
        role="document"
        aria-label="Comprobante de cierre"
        className="overflow-x-auto rounded-card border border-borde bg-superficie p-4 font-mono text-xs leading-snug"
      >
        {lines.join("\n")}
      </pre>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={print}>
          Imprimir
        </Button>
        <Button variant="secondary" onClick={() => void share()}>
          Compartir
        </Button>
      </div>
      {onDone && <Button onClick={onDone}>Listo</Button>}
    </div>
  );
}
