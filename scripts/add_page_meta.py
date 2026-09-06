"""Thêm favicon và canonical vào mọi trang HTML.

Chạy ở chế độ kiểm tra mặc định; dùng --apply để ghi tệp.
"""

from __future__ import annotations

import pathlib
import re
import sys
import urllib.parse

ROOT = pathlib.Path(__file__).resolve().parent.parent
APPLY = "--apply" in sys.argv

FAVICON_TAG = '<link rel="icon" href="favicon.svg" type="image/svg+xml">'
# Trang riêng tư không nên được lập chỉ mục, nên chỉ gắn canonical cho trang công khai.
NOINDEX_PAGES = {
    "admin.html", "canhan.html", "giohang.html", "yeuthich.html", "dangnhap.html",
    "dangky.html", "quenmatkhau.html", "datlaimatkhau.html", "index.html",
    "404.html", "500.html", "baiviet.html", "chitiet.html",
}

changed: list[str] = []
skipped: list[str] = []

for path in sorted(ROOT.glob("*.html")):
    source = path.read_text(encoding="utf-8")
    original = source
    eol = "\r\n" if "\r\n" in source else "\n"

    if not re.search(r"<head\b[^>]*>", source, re.I):
        skipped.append(f"{path.name}: không có <head>")
        continue

    if not re.search(r'<link\b[^>]*\brel\s*=\s*["\']icon["\']', source, re.I):
        source = re.sub(
            r"(<title\b[^>]*>.*?</title>)",
            lambda match: f"{match.group(1)}{eol}    {FAVICON_TAG}",
            source,
            count=1,
            flags=re.I | re.S,
        )
        if source == original:
            source = re.sub(
                r"(<head\b[^>]*>)",
                lambda match: f"{match.group(1)}{eol}    {FAVICON_TAG}",
                source,
                count=1,
                flags=re.I,
            )

    if path.name not in NOINDEX_PAGES and not re.search(
        r'<link\b[^>]*\brel\s*=\s*["\']canonical["\']', source, re.I
    ):
        canonical = (
            '<link rel="canonical" href="https://haianh.alwaysdata.net/'
            + urllib.parse.quote(path.name)
            + '">'
        )
        source = re.sub(
            r'(<link\b[^>]*\brel\s*=\s*["\']icon["\'][^>]*>)',
            lambda match: f"{match.group(1)}{eol}    {canonical}",
            source,
            count=1,
            flags=re.I,
        )

    if source != original:
        changed.append(path.name)
        if APPLY:
            path.write_text(source, encoding="utf-8")

print(f"Chế độ: {'APPLY' if APPLY else 'CHECK'}")
print(f"Trang cần cập nhật: {len(changed)}")
for name in changed:
    print(f"  - {name}")
for note in skipped:
    print(f"  ! {note}")
