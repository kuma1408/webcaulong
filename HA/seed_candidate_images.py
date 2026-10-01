"""Attach locally bundled ShopVNB product photos to the six catalog drafts.

Images are keyed by the exact draft name instead of database IDs so this is
safe across local and production databases. Existing non-placeholder images are
left untouched; products stay hidden and inventory/prices are not changed.
"""

from __future__ import annotations

import json
import os

from HA.app import PROJECT_ROOT, get_db_connection


IMAGE_ROOT = os.path.join(PROJECT_ROOT, "HA", "imported-products")
IMAGE_BASE = "HA/imported-products"

PRODUCT_IMAGES = {
    "Vợt cầu lông Yonex Nanoflare 1000Z": (
        "nanoflare-1000z-1.webp",
        "nanoflare-1000z-2.webp",
    ),
    "Vợt cầu lông Li-Ning Axforce 80": (
        "axforce-80-1.webp",
        "axforce-80-2.webp",
    ),
    "Vợt cầu lông Yonex Nanoflare 002A": (
        "nanoflare-002a-1.webp",
        "nanoflare-002a-2.webp",
    ),
    "Giày cầu lông Yonex Power Cushion 88 Dial Gen 3 Wide": (
        "power-cushion-88-dial-3-wide-1.webp",
        "power-cushion-88-dial-3-wide-2.webp",
    ),
    "Giày cầu lông Yonex Cascade Accel Gen 2": (
        "cascade-accel-gen-2-1.webp",
        "cascade-accel-gen-2-2.webp",
    ),
    "Giày cầu lông Yonex Cascade Accel Gen 2 Wide": (
        "cascade-accel-gen-2-wide-1.webp",
        "cascade-accel-gen-2-wide-2.webp",
    ),
}


def main() -> int:
    missing = [
        filename
        for filenames in PRODUCT_IMAGES.values()
        for filename in filenames
        if not os.path.isfile(os.path.join(IMAGE_ROOT, filename))
    ]
    if missing:
        raise FileNotFoundError(f"Thiếu ảnh sản phẩm trong gói deploy: {', '.join(missing)}")

    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    updated = skipped = 0
    try:
        conn.start_transaction()
        for product_name, filenames in PRODUCT_IMAGES.items():
            cursor.execute(
                "SELECT MaSP,HinhAnh,AnhChiTiet FROM SanPham WHERE TenSP=%s LIMIT 1",
                (product_name,),
            )
            product = cursor.fetchone()
            if not product:
                print(f"Bỏ qua ảnh, chưa có sản phẩm: {product_name}")
                skipped += 1
                continue

            current_image = (product.get("HinhAnh") or "").strip()
            current_gallery = product.get("AnhChiTiet")
            if isinstance(current_gallery, str):
                try:
                    current_gallery = json.loads(current_gallery)
                except (TypeError, ValueError):
                    current_gallery = []
            if current_image not in {"", "HA/cc-removebg-preview.png"}:
                print(f"Giữ ảnh đã có: {product_name}")
                skipped += 1
                continue

            gallery = [f"{IMAGE_BASE}/{filename}" for filename in filenames]
            if isinstance(current_gallery, list):
                gallery.extend(
                    image
                    for image in current_gallery
                    if isinstance(image, str) and image not in gallery
                )
            cursor.execute(
                "UPDATE SanPham SET HinhAnh=%s,AnhChiTiet=%s WHERE MaSP=%s",
                (gallery[0], json.dumps(gallery, ensure_ascii=False), product["MaSP"]),
            )
            updated += 1
            print(f"Đã gắn {len(gallery)} ảnh: {product_name}")

        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        cursor.close()
        conn.close()

    print(f"Hoàn tất ảnh sản phẩm: cập nhật {updated}, bỏ qua {skipped}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
