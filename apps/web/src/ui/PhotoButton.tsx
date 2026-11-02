import { Camera } from "lucide-react";
import { useRef } from "react";
import { queuePhoto } from "../data/files";
import { Button } from "./Button";

/** Foto de un comprobante: abre la cámara o los archivos y la deja en la cola de subida. */
export function PhotoButton({
  value,
  onChange,
  label,
}: {
  value: string | null;
  onChange: (id: string) => void;
  label: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        aria-label={label}
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (f) onChange(await queuePhoto(f));
        }}
      />
      <Button variant="secondary" icon={<Camera size={18} />} onClick={() => ref.current?.click()}>
        {value ? `${label} ✓` : label}
      </Button>
    </>
  );
}
