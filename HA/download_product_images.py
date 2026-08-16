"""Tải ảnh đại diện từ URL nguồn đã lưu và gắn vào sản phẩm tương ứng."""

from __future__ import annotations

import os
import re
import time
import unicodedata
from difflib import SequenceMatcher
from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen

from HA.app import PROJECT_ROOT, get_db_connection


OUTPUT_DIR = os.path.join(PROJECT_ROOT, "HA", "imported-products")
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) BadmintonStoreCatalog/1.0"


def normalize(value):
    text = unicodedata.normalize("NFD", str(value or "").lower())
    text = "".join(char for char in text if unicodedata.category(char) != "Mn")
    return re.sub(r"[^a-z0-9]+", " ", text).strip()


class ImageParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.images = []

    def handle_starttag(self, tag, attrs):
        if tag.lower() != "img":
            return
        values = dict(attrs)
        source = values.get("data-lazy-src") or values.get("data-src") or values.get("src")
        label = values.get("alt") or values.get("title") or ""
        if source and not source.startswith("data:"):
            self.images.append((label, source.split()[0]))


def fetch(url, timeout=25):
    request = Request(url, headers={"User-Agent": USER_AGENT, "Accept": "text/html,image/avif,image/webp,image/*,*/*"})
    with urlopen(request, timeout=timeout) as response:
        return response.read(), response.headers.get("Content-Type", "")


def score(product_name, image_label, image_url):
    wanted = normalize(product_name)
    candidate = normalize(f"{image_label} {os.path.basename(urlparse(image_url).path)}")
    if not candidate:
        return 0
    wanted_tokens = set(wanted.split()) - {"vot", "cau", "long", "giay", "ong", "qua"}
    candidate_tokens = set(candidate.split())
    overlap = len(wanted_tokens & candidate_tokens) / max(1, len(wanted_tokens))
    return overlap * 0.72 + SequenceMatcher(None, wanted, candidate).ratio() * 0.28


def extension(content_type, url):
    lowered = content_type.lower()
    if "webp" in lowered: return ".webp"
    if "png" in lowered: return ".png"
    if "avif" in lowered: return ".avif"
    if "jpeg" in lowered or "jpg" in lowered: return ".jpg"
    suffix = os.path.splitext(urlparse(url).path)[1].lower()
    return suffix if suffix in {".jpg", ".jpeg", ".png", ".webp", ".avif"} else ".jpg"


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            """SELECT MaSP,TenSP,NguonURL FROM SanPham
            WHERE NguonURL IS NOT NULL AND (HinhAnh IS NULL OR HinhAnh='' OR HinhAnh='HA/cc-removebg-preview.png')
            ORDER BY MaSP"""
        )
        products = cursor.fetchall()
        pages = {}
        for source_url in sorted({row["NguonURL"] for row in products}):
            try:
                html, _ = fetch(source_url)
                parser = ImageParser(); parser.feed(html.decode("utf-8", errors="ignore"))
                pages[source_url] = [(label, urljoin(source_url, image_url)) for label, image_url in parser.images]
                print(f"Nguồn {source_url}: {len(pages[source_url])} ảnh ứng viên")
            except Exception as exc:
                pages[source_url] = []
                print(f"Không đọc được {source_url}: {exc}")

        updated = 0
        for product in products:
            candidates = pages.get(product["NguonURL"], [])
            ranked = sorted(((score(product["TenSP"], label, url), url) for label, url in candidates), reverse=True)
            if not ranked or ranked[0][0] < 0.42:
                print(f"Bỏ qua #{product['MaSP']}: chưa khớp ảnh cho {product['TenSP']}")
                continue
            match_score, image_url = ranked[0]
            try:
                payload, content_type = fetch(image_url)
                if len(payload) < 4000 or len(payload) > 8_000_000 or "image" not in content_type.lower():
                    raise ValueError("phản hồi không phải ảnh sản phẩm hợp lệ")
                suffix = extension(content_type, image_url)
                filename = f"product-{product['MaSP']}{suffix}"
                destination = os.path.join(OUTPUT_DIR, filename)
                with open(destination, "wb") as handle:
                    handle.write(payload)
                relative = f"HA/imported-products/{filename}"
                cursor.execute("UPDATE SanPham SET HinhAnh=%s, AnhChiTiet=%s WHERE MaSP=%s", (relative, f'["{relative}"]', product["MaSP"]))
                updated += 1
                print(f"Đã gắn ảnh #{product['MaSP']} ({match_score:.2f}): {product['TenSP']}")
                time.sleep(0.15)
            except Exception as exc:
                print(f"Lỗi ảnh #{product['MaSP']}: {exc}")
        conn.commit()
        print(f"Hoàn tất: {updated}/{len(products)} sản phẩm có ảnh mới.")
    except Exception:
        conn.rollback()
        raise
    finally:
        cursor.close(); conn.close()


if __name__ == "__main__":
    main()
