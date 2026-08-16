"""Chuyển sản phẩm từ các trang chi tiết tĩnh sang MySQL và đổi liên kết.

Script giữ nguyên MaSP của sản phẩm đã tồn tại để không làm hỏng giỏ hàng,
đơn hàng và đánh giá. Trước khi ghi, dữ liệu SanPham hiện tại được sao lưu
thành JSON. Chỉ các trang khớp mẫu ``a-h chi tiết ...html`` được xử lý.
"""

from __future__ import annotations

import argparse
import html
import json
import os
import re
from datetime import datetime
from pathlib import Path

import mysql.connector
from dotenv import load_dotenv


ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
DETAIL_FILE_RE = re.compile(r"^[a-h] chi tiết .+\.html$", re.IGNORECASE)
CATEGORY_MAP = {"a": 1, "b": 2, "c": 3, "d": 4, "f": 5, "g": 6, "h": 7, "e": 8}


def db_config() -> dict:
    load_dotenv(ROOT / ".env")
    return {
        "host": os.getenv("DB_HOST", "127.0.0.1"),
        "port": int(os.getenv("DB_PORT", "3306")),
        "user": os.getenv("DB_USER", "shop_app"),
        "password": os.getenv("DB_PASSWORD", ""),
        "database": os.getenv("DB_NAME", "shop_caulong"),
        "charset": "utf8mb4",
        "use_unicode": True,
        "autocommit": False,
    }


def text_content(value: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", value))).strip()


def price_number(value: str) -> int:
    digits = re.sub(r"\D", "", value)
    return int(digits) if digits else 0


def brand_from_name(name: str) -> str:
    for brand in ("Lining", "Yonex", "Victor", "Kamito", "Apacs", "VNB", "Kawasaki", "Kumpoo"):
        if brand.lower() in name.lower():
            return brand
    return name.split()[0] if name.split() else "Khác"


def first_match(pattern: str, source: str, label: str, filename: str) -> str:
    match = re.search(pattern, source, re.IGNORECASE | re.DOTALL)
    if not match:
        raise RuntimeError(f"{filename}: không tìm thấy {label}")
    return match.group(1).strip()


def extract_product(path: Path) -> dict:
    source = path.read_text(encoding="utf-8-sig")
    name = text_content(first_match(r"<h2[^>]*>(.*?)</h2>", source, "tên sản phẩm", path.name))
    price_html = first_match(
        r"<p[^>]*color\s*:\s*red[^>]*>\s*<b[^>]*>(.*?)</b>", source, "giá bán", path.name
    )
    image = first_match(
        r"<img[^>]*\bid=[\"']mainProductImage[\"'][^>]*\bsrc=[\"']([^\"']+)",
        source,
        "ảnh chính",
        path.name,
    )
    description_match = re.search(r"<div\s+class=[\"']uu-dai[\"'][^>]*>(.*?)</div>", source, re.I | re.S)
    description = description_match.group(1).strip() if description_match else "<p>Sản phẩm chính hãng.</p>"
    image_dir_match = re.search(r"const\s+imageDirectory\s*=\s*[\"']([^\"']+)", source)
    image_files_match = re.search(r"const\s+imageFiles\s*=\s*\[(.*?)\]", source, re.S)
    detail_images: list[str] = []
    if image_dir_match and image_files_match:
        names = re.findall(r"[\"']([^\"']+)[\"']", image_files_match.group(1))
        detail_images = [f"{image_dir_match.group(1)}{item}" for item in names]
    if image not in detail_images:
        detail_images.insert(0, image)
    return {
        "sourceFile": path.name,
        "MaDM": CATEGORY_MAP[path.name[0].lower()],
        "TenSP": name,
        "MoTa": description,
        "GiaBan": price_number(text_content(price_html)),
        "HinhAnh": image,
        "ThuongHieu": brand_from_name(name),
        "AnhChiTiet": detail_images,
    }


def json_ready(row: dict) -> dict:
    return {key: (float(value) if hasattr(value, "as_tuple") else value.isoformat() if hasattr(value, "isoformat") else value) for key, value in row.items()}


def rewrite_links(mapping: dict[str, int]) -> int:
    changed = 0
    detail_names = set(mapping)
    for path in ROOT.glob("*.html"):
        if path.name in detail_names:
            continue
        source = path.read_text(encoding="utf-8-sig")
        updated = source
        for filename, product_id in mapping.items():
            updated = updated.replace(filename, f"chitiet.html?id={product_id}")
        if updated != source:
            path.write_text(updated, encoding="utf-8", newline="")
            changed += 1
    return changed


def migrate(apply: bool) -> int:
    detail_paths = sorted((path for path in ROOT.glob("*.html") if DETAIL_FILE_RE.match(path.name)), key=lambda p: p.name)
    products = [extract_product(path) for path in detail_paths]
    if len(products) != 75:
        raise RuntimeError(f"Dừng an toàn: dự kiến 75 trang chi tiết, thực tế có {len(products)}.")
    conn = mysql.connector.connect(**db_config())
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT * FROM SanPham ORDER BY MaSP")
        current = cursor.fetchall()
        print(f"Trang tĩnh: {len(products)}; sản phẩm hiện có trong MySQL: {len(current)}")
        if not apply:
            print("Chỉ kiểm tra; chưa ghi cơ sở dữ liệu hoặc đổi liên kết. Dùng --apply để thực hiện.")
            return 0

        DATA_DIR.mkdir(exist_ok=True)
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        backup_path = DATA_DIR / f"sanpham-backup-{stamp}.json"
        backup_path.write_text(json.dumps([json_ready(row) for row in current], ensure_ascii=False, indent=2), encoding="utf-8")

        mapping: dict[str, int] = {}
        inserted = 0
        updated = 0
        for product in products:
            # Ảnh chính phân biệt được các biến thể có cùng tên sản phẩm.
            cursor.execute(
                "SELECT MaSP FROM SanPham WHERE MaDM=%s AND HinhAnh=%s ORDER BY MaSP LIMIT 1",
                (product["MaDM"], product["HinhAnh"]),
            )
            row = cursor.fetchone()
            if not row:
                cursor.execute(
                    "SELECT MaSP FROM SanPham WHERE MaDM=%s AND LOWER(TRIM(TenSP))=LOWER(TRIM(%s)) ORDER BY MaSP LIMIT 1",
                    (product["MaDM"], product["TenSP"]),
                )
                row = cursor.fetchone()
            values = (
                product["MoTa"], product["GiaBan"], product["GiaBan"], 100,
                product["HinhAnh"], product["ThuongHieu"],
                json.dumps(product["AnhChiTiet"], ensure_ascii=False),
            )
            if row:
                product_id = int(row["MaSP"])
                cursor.execute(
                    """UPDATE SanPham SET MoTa=%s,GiaBan=%s,GiaGoc=%s,
                       TonKho=GREATEST(TonKho,%s),HinhAnh=%s,ThuongHieu=%s,
                       AnhChiTiet=%s,TrangThai=1 WHERE MaSP=%s""",
                    (*values, product_id),
                )
                updated += 1
            else:
                cursor.execute(
                    """INSERT INTO SanPham
                       (MaDM,TenSP,MoTa,GiaBan,GiaGoc,TonKho,HinhAnh,ThuongHieu,AnhChiTiet,DanhGiaTrungBinh,TrangThai)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,5.0,1)""",
                    (product["MaDM"], product["TenSP"], *values),
                )
                product_id = int(cursor.lastrowid)
                inserted += 1
            mapping[product["sourceFile"]] = product_id

        conn.commit()
        cursor.execute("SELECT COUNT(*) AS total FROM SanPham WHERE TrangThai=1")
        active_total = int(cursor.fetchone()["total"])
        manifest = [{**product, "MaSP": mapping[product["sourceFile"]]} for product in products]
        (DATA_DIR / "products-migrated.json").write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        changed_pages = rewrite_links(mapping)
        print(f"Hoàn tất: cập nhật {updated}, thêm {inserted}, đang hoạt động {active_total}.")
        print(f"Đã đổi liên kết trong {changed_pages} trang; sao lưu: {backup_path.name}")
        return 0
    except Exception:
        conn.rollback()
        raise
    finally:
        cursor.close()
        conn.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    raise SystemExit(migrate(args.apply))
