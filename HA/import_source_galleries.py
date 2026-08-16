"""Nhập ảnh sản phẩm từ trang nguồn; chỉ giữ ảnh có alt/URL khớp đúng model."""

import json
import os
import re
from html import unescape
from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen

from HA.app import PROJECT_ROOT, get_db_connection


SOURCES = {
    159: ("https://shopvnb.com/vot-cau-long-victor-auraspeed-99-j-2026-chinh-hang.html", ("auraspeed", "99", "2026")),
    161: ("https://fbshop.vn/p/vot-cau-long-lining-axforce-cannon-rabbit-2026/", ("axforce", "cannon", "rabbit")),
    163: ("https://fbshop.vn/p/vot-cau-long-vicleo-aero-111/", ("vicleo", "aero", "111")),
    164: ("https://fbshop.vn/p/vot-cau-long-vicleo-aero-555/", ("vicleo", "aero", "555")),
    165: ("https://fbshop.vn/p/vot-cau-long-vicleo-aero-333/", ("vicleo", "aero", "333")),
    173: ("https://fbshop.vn/p/ong-cau-long-ba-sao-cong/", ("cau", "long", "ba", "sao")),
    174: ("https://fbshop.vn/p/ong-cau-long-vnbc-3in1/", ("vnbc", "3in1")),
    169: ("https://shopvnb.com/giay-cau-long-lining-aytu025-3-chinh-hang.html", ("aytu025", "3")),
}


class ImageParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.images = []

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if tag == "img":
            src = values.get("data-src") or values.get("data-lazy-src") or values.get("src")
            label = " ".join((values.get("alt", ""), values.get("title", ""), src or ""))
            if src:
                self.images.append((src, unescape(label).lower()))
        elif tag == "meta" and values.get("property") in {"og:image", "og:image:secure_url"}:
            if values.get("content"):
                self.images.append((values["content"], values["content"].lower()))


def image_extension(content_type, url):
    content_type = content_type.lower()
    if "webp" in content_type:
        return ".webp"
    if "png" in content_type:
        return ".png"
    suffix = os.path.splitext(urlparse(url).path)[1].lower()
    return suffix if suffix in {".jpg", ".jpeg", ".png", ".webp"} else ".jpg"


def main():
    folder = os.path.join(PROJECT_ROOT, "HA", "imported-products")
    os.makedirs(folder, exist_ok=True)
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        for product_id, (page_url, words) in SOURCES.items():
            try:
                request = Request(page_url, headers={"User-Agent": "Mozilla/5.0"})
                with urlopen(request, timeout=30) as response:
                    body = response.read().decode("utf-8", "ignore")
            except Exception as exc:
                print(f"Không mở được #{product_id}: {exc}")
                continue

            parser = ImageParser()
            parser.feed(body)
            candidates = []
            for source, label in parser.images:
                normalized = re.sub(r"[^a-z0-9]+", " ", label)
                if all(word in normalized for word in words):
                    absolute = urljoin(page_url, source)
                    if absolute not in candidates:
                        candidates.append(absolute)

            gallery = []
            for index, image_url in enumerate(candidates[:8], 1):
                try:
                    request = Request(
                        image_url,
                        headers={"User-Agent": "Mozilla/5.0", "Referer": page_url, "Accept": "image/*,*/*"},
                    )
                    with urlopen(request, timeout=30) as response:
                        data = response.read()
                        content_type = response.headers.get("Content-Type", "")
                    if "image" not in content_type.lower() or len(data) < 4000:
                        continue
                    suffix = image_extension(content_type, image_url)
                    filename = f"product-{product_id}-source-{len(gallery) + 1}{suffix}"
                    with open(os.path.join(folder, filename), "wb") as handle:
                        handle.write(data)
                    gallery.append(f"HA/imported-products/{filename}")
                except Exception as exc:
                    print(f"Bỏ ảnh #{product_id}.{index}: {exc}")

            if gallery:
                cursor.execute(
                    "UPDATE SanPham SET HinhAnh=%s, AnhChiTiet=%s, NguonURL=%s WHERE MaSP=%s",
                    (gallery[0], json.dumps(gallery, ensure_ascii=False), page_url, product_id),
                )
            print(f"Sản phẩm #{product_id}: tìm {len(candidates)}, lưu {len(gallery)} ảnh")
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        cursor.close()
        conn.close()


if __name__ == "__main__":
    main()
