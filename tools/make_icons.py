"""Sinh icon cho Chung Ví (PWA + iOS) bằng Python thuần, không cần thư viện ngoài.

Chạy:  python tools/make_icons.py
"""
import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
C1 = (0xD9, 0x46, 0x6F)  # hồng đậm
C2 = (0xF4, 0x8F, 0xB1)  # hồng nhạt
WHITE = (255, 255, 255)


def inside_heart(x, y):
    # (x² + y² − 1)³ − x²·y³ ≤ 0, trục y hướng lên
    a = x * x + y * y - 1
    return a * a * a - x * x * y * y * y <= 0


def render(size, alpha=False, ss=3):
    rows = []
    scale = 4.4  # độ lớn vùng toạ độ -> tim chiếm ~50% icon (an toàn cho maskable)
    for py in range(size):
        row = bytearray([0])  # filter byte
        for px in range(size):
            t = (px + py) / (2 * size)
            bg = tuple(round(C1[i] + (C2[i] - C1[i]) * t) for i in range(3))
            hits = 0
            for sy in range(ss):
                for sx in range(ss):
                    x = ((px + (sx + 0.5) / ss) / size - 0.5) * scale
                    y = -((py + (sy + 0.5) / ss) / size - 0.5) * scale + 0.13
                    if inside_heart(x, y):
                        hits += 1
            k = hits / (ss * ss)
            c = tuple(round(bg[i] * (1 - k) + WHITE[i] * k) for i in range(3))
            row += bytes(c) + (b"\xff" if alpha else b"")
        rows.append(bytes(row))
    return b"".join(rows)


def write_png(path, size, alpha=False):
    raw = render(size, alpha, ss=2 if size >= 512 else 3)
    color_type = 6 if alpha else 2

    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, color_type, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(png)
    print("wrote", path.relative_to(ROOT), size)


if __name__ == "__main__":
    write_png(ROOT / "www/icons/icon-192.png", 192)
    write_png(ROOT / "www/icons/icon-512.png", 512)
    write_png(ROOT / "www/icons/apple-touch-icon.png", 180)
    # iOS App Store icon: 1024x1024, KHÔNG có kênh alpha
    write_png(ROOT / "assets/icon-1024.png", 1024)
