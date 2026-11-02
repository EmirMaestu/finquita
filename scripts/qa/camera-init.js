// Cámara falsa para la QA con usuarios: reemplaza getUserMedia por un canvas.captureStream
// que dibuja el EAN-13 que se le pida (window.__qaCamera.code). Se inyecta con addInitScript.
(() => {
  const L = [
    "0001101",
    "0011001",
    "0010011",
    "0111101",
    "0100011",
    "0110001",
    "0101111",
    "0111011",
    "0110111",
    "0001011",
  ];
  const G = [
    "0100111",
    "0110011",
    "0011011",
    "0100001",
    "0011101",
    "0111001",
    "0000101",
    "0010001",
    "0001001",
    "0010111",
  ];
  const R = [
    "1110010",
    "1100110",
    "1101100",
    "1000010",
    "1011100",
    "1001110",
    "1010000",
    "1000100",
    "1001000",
    "1110100",
  ];
  const PARITY = [
    "LLLLLL",
    "LLGLGG",
    "LLGGLG",
    "LLGGGL",
    "LGLLGG",
    "LGGLLG",
    "LGGGLL",
    "LGLGLG",
    "LGLGGL",
    "LGGLGL",
  ];
  function modules(code) {
    if (!/^\d{13}$/.test(code)) return null;
    const d = code.split("").map(Number);
    const parity = PARITY[d[0]];
    let out = "101";
    for (let i = 1; i <= 6; i++) out += (parity[i - 1] === "L" ? L : G)[d[i]];
    out += "01010";
    for (let i = 7; i <= 12; i++) out += R[d[i]];
    return `${out}101`;
  }
  const state = { code: null, frames: 0 };
  window.__qaCamera = state;
  const W = 1280;
  const H = 720;
  let canvas = null;
  let timer = null;
  function draw() {
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#6b6b6b";
    ctx.fillRect(0, 0, W, H);
    state.frames++;
    const m = state.code ? modules(state.code) : null;
    if (m) {
      const mw = 10;
      const bw = m.length * mw;
      const x0 = Math.floor((W - bw) / 2);
      ctx.fillStyle = "#fff";
      ctx.fillRect(x0 - 120, 160, bw + 240, 400);
      ctx.fillStyle = "#000";
      for (let i = 0; i < m.length; i++) {
        if (m[i] === "1") ctx.fillRect(x0 + i * mw, 200, mw, 300);
      }
      ctx.font = "36px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(state.code, W / 2, 545);
    }
  }
  function start() {
    if (canvas) return;
    canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    draw();
    timer = setInterval(draw, 66);
  }
  const md = navigator.mediaDevices;
  if (!md) return;
  md.getUserMedia = async (c) => {
    if (!c?.video) throw new DOMException("Sin audio en la QA", "NotFoundError");
    start();
    const stream = canvas.captureStream(15);
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
      canvas = null;
    };
    for (const t of stream.getTracks()) {
      const orig = t.stop.bind(t);
      t.stop = () => {
        orig();
        stop();
      };
      t.getCapabilities = () => ({ facingMode: ["environment"], width: { max: W } });
    }
    return stream;
  };
  md.enumerateDevices = async () => [
    { kind: "videoinput", deviceId: "qa-cam", groupId: "qa", label: "Cámara trasera (QA)" },
  ];
})();
