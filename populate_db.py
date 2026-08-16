import argparse
import os
import re
import glob
import json
import mysql.connector
from dotenv import load_dotenv

load_dotenv()

# Cấu hình database giống app.py
DB_CONFIG = {
    "host": os.getenv("DB_HOST", "127.0.0.1"),
    "port": int(os.getenv("DB_PORT", "3306")),
    "user": os.getenv("DB_USER", "shop_app"),
    "password": os.getenv("DB_PASSWORD", ""),
    "database": os.getenv("DB_NAME", "shop_caulong"),
    "charset": "utf8mb4",
    "use_unicode": True,
    "autocommit": False,
}

# Ánh xạ từ tiền tố file tĩnh sang mã danh mục (MaDM)
CATEGORY_MAP = {
    'a': 1,  # Vợt Cầu Lông (vot-cau-long)
    'b': 2,  # Giày Cầu Lông (giay-cau-long)
    'c': 3,  # Áo Cầu Lông (ao-cau-long)
    'd': 4,  # Váy Cầu Lông (vay-cau-long)
    'f': 5,  # Quần Cầu Lông (quan-cau-long)
    'g': 6,  # Túi Vợt (tui-vot)
    'h': 7,  # Balo (balo)
    'e': 8   # Phụ Kiện (phu-kien)
}

def clean_price(price_str):
    # Loại bỏ các ký tự dấu chấm, chữ ₫ và khoảng trắng, chuyển thành số nguyên
    clean_str = re.sub(r'[\.₫\s,]', '', price_str)
    try:
        return float(clean_str)
    except ValueError:
        return 0.0

def get_brand(name):
    name_lower = name.lower()
    for brand in ["lining", "yonex", "victor", "kamito", "apacs", "vnb", "kawasaki", "kumpoo"]:
        if brand in name_lower:
            return brand.capitalize() if brand != "vnb" else "VNB"
    # Nếu không khớp thì lấy từ đầu tiên làm hãng
    words = name.split()
    if words:
        return words[0]
    return "Khác"

def main(replace_products=False, confirmation=""):
    if not replace_products or confirmation != "REPLACE_ALL_PRODUCTS":
        print("DỪNG AN TOÀN: script này sẽ thay toàn bộ dữ liệu SanPham.")
        print("Muốn chạy, cần đồng thời truyền --replace-products --confirm REPLACE_ALL_PRODUCTS sau khi sao lưu.")
        return 0
    print("Connecting to MySQL...")
    conn = mysql.connector.connect(**DB_CONFIG)
    cursor = conn.cursor()

    # 1. Thêm cột AnhChiTiet vào bảng SanPham nếu chưa tồn tại
    try:
        cursor.execute("ALTER TABLE SanPham ADD COLUMN AnhChiTiet TEXT")
        print("✅ Added column 'AnhChiTiet' to SanPham table.")
        conn.commit()
    except mysql.connector.errors.ProgrammingError as e:
        if "Duplicate column name" in str(e):
            print("ℹ️ Column 'AnhChiTiet' already exists.")
        else:
            raise e

    # 2. Xóa dữ liệu cũ trong bảng SanPham để tránh trùng lặp khi chạy lại
    print("Clearing old products in database...")
    cursor.execute("DELETE FROM SanPham")
    conn.commit()
    print("✅ Cleared SanPham table.")

    # 3. Tìm kiếm tất cả các file HTML chi tiết
    html_files = glob.glob("*.html")
    print(f"Found {len(html_files)} HTML files in the directory.")

    success_count = 0

    for file_path in html_files:
        # Lọc các file bắt đầu bằng tiền tố nằm trong CATEGORY_MAP
        filename = os.path.basename(file_path)
        prefix = filename[0].lower()
        if 'chi tiết' not in filename or prefix not in CATEGORY_MAP:
            continue

        category_id = CATEGORY_MAP[prefix]

        print(f"Processing: {filename} (Category {category_id})...")

        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()

        # Cào Tên Sản phẩm
        name_match = re.search(r'<h2[^>]*>(.*?)</h2>', content)
        if not name_match:
            print(f"⚠️ Warning: Could not find product name in {filename}, skipping.")
            continue
        name = name_match.group(1).strip()

        # Cào Giá bán
        price_match = re.search(r'<p style="color:red;[^>]*>\s*<b>(.*?)</b>', content, re.IGNORECASE)
        if not price_match:
            # Tìm kiếm dự phòng
            price_match = re.search(r'<b>([\d\.,\s]+)\s*₫\s*</b>', content)
        
        if not price_match:
            print(f"⚠️ Warning: Could not find price in {filename}, defaulting to 0.")
            price = 0.0
        else:
            price_str = price_match.group(1).strip()
            price = clean_price(price_str)

        # Cào ảnh chính
        img_match = re.search(r'<img id="mainProductImage"[^>]*src="([^"]+)"', content)
        if not img_match:
            img_match = re.search(r'<img[^>]*id="mainProductImage"[^>]*src="([^"]+)"', content)
        if not img_match:
            print(f"⚠️ Warning: Could not find main product image in {filename}, skipping.")
            continue
        main_img = img_match.group(1).strip()

        # Cào mô tả / khuyến mãi
        desc_match = re.search(r'<div class="uu-dai">(.*?)</div>', content, re.DOTALL)
        if desc_match:
            mota = desc_match.group(1).strip()
        else:
            mota = "<p>Thông tin sản phẩm chính hãng, bảo hành lâu dài.</p>"

        # Cào ảnh chi tiết
        img_dir_match = re.search(r'const\s+imageDirectory\s*=\s*"([^"]+)";', content)
        img_files_match = re.search(r'const\s+imageFiles\s*=\s*\[(.*?)\];', content)

        detailed_images = []
        if img_dir_match and img_files_match:
            img_dir = img_dir_match.group(1).strip()
            files_str = img_files_match.group(1).strip()
            # Tách danh sách file
            files = [f.strip(" '\"") for f in files_str.split(',') if f.strip()]
            detailed_images = [f"{img_dir}{f}" for f in files]

        # Chuyển đổi list ảnh chi tiết thành JSON string để lưu vào TEXT column
        detailed_images_json = json.dumps(detailed_images, ensure_ascii=False)
        brand = get_brand(name)

        # Thực hiện insert vào database
        sql = """
        INSERT INTO SanPham (MaDM, TenSP, MoTa, GiaBan, GiaGoc, TonKho, HinhAnh, ThuongHieu, AnhChiTiet, DanhGiaTrungBinh, TrangThai)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 1)
        """
        try:
            cursor.execute(sql, (category_id, name, mota, price, price, 100, main_img, brand, detailed_images_json, 5.0))
            success_count += 1
        except Exception as e:
            print(f"❌ Error inserting {name}: {e}")

    conn.commit()
    cursor.close()
    conn.close()
    print(f"\n🎉 Successfully seeded {success_count} products into MySQL database!")

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Nạp lại toàn bộ sản phẩm từ các trang HTML tĩnh.")
    parser.add_argument("--replace-products", action="store_true", help="Cho phép thay toàn bộ SanPham.")
    parser.add_argument("--confirm", default="", help="Chuỗi xác nhận bắt buộc.")
    args = parser.parse_args()
    raise SystemExit(main(args.replace_products, args.confirm))
