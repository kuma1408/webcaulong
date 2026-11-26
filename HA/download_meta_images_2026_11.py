"""Tải ảnh chính (og:image) của 76 sản phẩm mới 2026-11 từ trang META.vn tương ứng.

Chạy trên máy phát triển (không cần database):
    python -m HA.download_meta_images_2026_11

Ảnh được kiểm tra bằng Pillow, đưa về nền trắng, cạnh dài tối đa 900px, lưu WEBP
vào HA/imported-products/meta-<slug>.webp. Danh sách tên sản phẩm -> tệp ảnh ghi
ở HA/imported-products/meta-2026-11.json để lệnh attach-product-images-2026-11
gắn vào database. Nguồn ảnh là nhà bán lẻ META.vn; nên thay bằng ảnh cửa hàng tự
chụp hoặc được cấp phép khi có thể.
"""

from __future__ import annotations

import io
import json
import os
import re
import sys
import time
from html.parser import HTMLParser
from urllib.parse import quote, urljoin, urlparse
from urllib.request import Request, urlopen

from PIL import Image, ImageOps

from HA.store_data_tools import NEW_PRODUCTS_2026_11

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT_DIR = os.path.join(ROOT, "HA", "imported-products")
MANIFEST = os.path.join(OUTPUT_DIR, "meta-2026-11.json")
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) BadmintonStoreCatalog/1.0"
MAX_PAGE_BYTES = 3 * 1024 * 1024
MAX_IMAGE_BYTES = 6 * 1024 * 1024


class MetaImageParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.images: list[str] = []

    def handle_starttag(self, tag, attrs):
        if tag != "meta":
            return
        values = dict(attrs)
        if (values.get("property") or values.get("name") or "").lower() in {"og:image", "og:image:secure_url", "twitter:image"}:
            if values.get("content"):
                self.images.append(values["content"])


def fetch(url: str, limit: int) -> tuple[bytes, str]:
    request = Request(url, headers={"User-Agent": USER_AGENT, "Accept-Language": "vi,en;q=0.8"})
    with urlopen(request, timeout=25) as response:
        data = response.read(limit + 1)
        if len(data) > limit:
            raise ValueError("quá dung lượng")
        return data, response.headers.get_content_type()


def slug_for(url: str) -> str:
    path = urlparse(url).path.strip("/")
    return re.sub(r"-p\d+$", "", path)[:90]


def to_webp(raw: bytes) -> bytes:
    Image.MAX_IMAGE_PIXELS = 30_000_000
    with Image.open(io.BytesIO(raw)) as probe:
        if (probe.format or "").upper() not in {"JPEG", "PNG", "WEBP"}:
            raise ValueError(f"định dạng {probe.format}")
        probe.verify()
    with Image.open(io.BytesIO(raw)) as source:
        source = ImageOps.exif_transpose(source)
        if min(source.size) < 150:
            raise ValueError(f"ảnh quá nhỏ {source.size}")
        frame = source.convert("RGBA")
        frame.thumbnail((900, 900), Image.Resampling.LANCZOS)
        canvas = Image.new("RGB", frame.size, "white")
        canvas.paste(frame, mask=frame.getchannel("A"))
        output = io.BytesIO()
        canvas.save(output, "WEBP", quality=84, method=6)
        return output.getvalue()


def main() -> int:
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    manifest: dict[str, dict] = {}
    if os.path.exists(MANIFEST):
        with open(MANIFEST, encoding="utf-8") as handle:
            manifest = json.load(handle)
    failures = []
    for _category, name, _brand, _price, _original, page_url in NEW_PRODUCTS_2026_11:
        slug = slug_for(page_url)
        filename = f"meta-{slug}.webp"
        target = os.path.join(OUTPUT_DIR, filename)
        if name in manifest and os.path.exists(target):
            continue
        try:
            html, _ = fetch(page_url, MAX_PAGE_BYTES)
            parser = MetaImageParser()
            parser.feed(html.decode("utf-8", "replace"))
            candidates = [quote(urljoin(page_url, item.strip()), safe=":/?&=%#") for item in parser.images]
            candidates = [item for item in candidates if urlparse(item).scheme == "https"]
            if not candidates:
                raise ValueError("trang không có og:image")
            image_url = candidates[0]
            raw, content_type = fetch(image_url, MAX_IMAGE_BYTES)
            if not content_type.startswith("image/"):
                raise ValueError(f"không phải ảnh ({content_type})")
            data = to_webp(raw)
            with open(target, "wb") as handle:
                handle.write(data)
            manifest[name] = {"file": f"HA/imported-products/{filename}", "page": page_url, "image": image_url}
            print(f"OK   {len(data) // 1024:>4} KB  {name}")
        except Exception as error:  # noqa: BLE001 - báo cáo từng sản phẩm, tiếp tục
            failures.append((name, str(error)))
            print(f"LỖI  {name}: {error}")
        time.sleep(0.6)
    with open(MANIFEST, "w", encoding="utf-8") as handle:
        json.dump(dict(sorted(manifest.items())), handle, ensure_ascii=False, indent=1)
    print(f"\nĐã có ảnh cho {len(manifest)}/{len(NEW_PRODUCTS_2026_11)} sản phẩm; lỗi {len(failures)}.")
    return 0 if not failures else 1


if __name__ == "__main__":
    sys.exit(main())
