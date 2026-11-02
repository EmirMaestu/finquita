/** Qué equipo es, por el navegador: para proponer el nombre al habilitarlo. */
export function guessDevice(ua = typeof navigator === "undefined" ? "" : navigator.userAgent): {
  name: string;
  kind: "mac" | "iphone" | "tablet" | "other";
} {
  if (/iPhone/i.test(ua)) return { name: "iPhone", kind: "iphone" };
  if (/iPad|Tablet|Android(?!.*Mobile)/i.test(ua)) return { name: "Tablet", kind: "tablet" };
  if (/Android/i.test(ua)) return { name: "Celular", kind: "other" };
  if (/Macintosh|Mac OS X/i.test(ua)) return { name: "Mac del mostrador", kind: "mac" };
  return { name: "Computadora del mostrador", kind: "other" };
}
