"""Íconos de prueba de la PWA: cuadrado verde primario con una M blanca. Sin dependencias."""
import struct, zlib, math, sys, os

GREEN = (0x1F, 0x6B, 0x4F)
PAPER = (0xFA, 0xF8, 0xF5)
WHITE = (0xFF, 0xFF, 0xFF)

def seg_dist(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))

def icon(size, maskable=False):
    rows = []
    pad = 0.0 if maskable else 0.0
    radius = 0 if maskable else size * 0.18
    scale = 0.62 if maskable else 0.8  # zona segura en maskable
    s = size * scale
    ox = (size - s) / 2
    oy = (size - s) / 2
    stroke = s * 0.11
    pts = [(0.2, 0.8), (0.2, 0.22), (0.5, 0.58), (0.8, 0.22), (0.8, 0.8)]
    pts = [(ox + x * s, oy + y * s) for x, y in pts]
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            cx, cy = x + 0.5, y + 0.5
            inside = True
            if radius:
                rx = min(max(cx, radius), size - radius)
                ry = min(max(cy, radius), size - radius)
                inside = math.hypot(cx - rx, cy - ry) <= radius
            if not inside:
                row += bytes(PAPER) + b"\x00"
                continue
            d = min(seg_dist(cx, cy, *pts[i], *pts[i + 1]) for i in range(4))
            color = WHITE if d <= stroke / 2 else GREEN
            row += bytes(color) + b"\xff"
        rows.append(bytes(row))
    raw = b"".join(rows)
    def chunk(t, data):
        c = struct.pack(">I", len(data)) + t + data
        return c + struct.pack(">I", zlib.crc32(t + data) & 0xFFFFFFFF)
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")

out = sys.argv[1]
os.makedirs(out, exist_ok=True)
for name, size, mask in [("pwa-192.png", 192, False), ("pwa-512.png", 512, False), ("pwa-maskable-512.png", 512, True), ("apple-touch-icon.png", 180, True), ("favicon-64.png", 64, False)]:
    with open(os.path.join(out, name), "wb") as f:
        f.write(icon(size, mask))
print("ok")
