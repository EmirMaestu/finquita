/** Pitido corto al escanear bien y otro tono al fallar (apagables en Ajustes). */
let ctx: AudioContext | null = null;

export function soundOn(): boolean {
  try {
    return localStorage.getItem("mostrador.sound") !== "off";
  } catch {
    return true;
  }
}

export function setSound(on: boolean) {
  try {
    localStorage.setItem("mostrador.sound", on ? "on" : "off");
  } catch {}
}

export function beep(kind: "ok" | "error" = "ok") {
  if (!soundOn() || typeof window === "undefined") return;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return;
  try {
    ctx ??= new Ctor();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = kind === "ok" ? "sine" : "square";
    osc.frequency.value = kind === "ok" ? 1760 : 220;
    gain.gain.value = 0.08;
    osc.connect(gain).connect(ctx.destination);
    const t = ctx.currentTime;
    osc.start(t);
    osc.stop(t + (kind === "ok" ? 0.08 : 0.25));
  } catch {}
}
