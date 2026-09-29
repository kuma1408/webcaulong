"""Preview/import source-checked product drafts after explicit approval.

Default mode is read-only. With --apply, candidates are inserted hidden with
zero stock; an admin must verify image, variants, local price and inventory.
Existing records are never modified or deleted.
"""

from __future__ import annotations

import argparse

from HA.app import get_db_connection

CHECKED_ON = "2026-09-30"
PLACEHOLDER_IMAGE = "HA/cc-removebg-preview.png"

CANDIDATES = [
    {
        "category": 1,
        "name": "Vợt cầu lông Yonex Nanoflare 1000Z",
        "brand": "Yonex",
        "price": 5_099_000,
        "original_price": 6_118_800,
        "source": "https://shopvnb.com/vot-cau-long-yonex-nanoflare-1000z.html",
        "description": (
            "Vợt hướng tới lối đánh tốc độ với thân rất cứng, phù hợp người chơi đã có kỹ "
            "thuật. Hãng công bố 4U trung bình 83 g hoặc 3U 88 g, dài hơn chuẩn 10 mm; mức "
            "căng khuyến nghị 4U 20–28 lb, 3U 21–29 lb. Khung HM Graphite, NANOMETRIC DR, "
            "M40X và EX-HYPER MG; thân HM Graphite, Ultra PE Fiber. Chọn cỡ cán và mức căng "
            "phù hợp thể lực. Thông số đối chiếu thêm với hãng tại https://www.yonex.com/nf-1000z. "
            "Giá tham khảo từ nhà bán lẻ, chưa phải giá bán của cửa hàng."
        ),
        "weight": "3U / 4U",
        "style": None,
        "balance": "NHE_DAU",
        "stiffness": "CUNG",
        "max_tension": 29,
    },
    {
        "category": 1,
        "name": "Vợt cầu lông Li-Ning Axforce 80",
        "brand": "Li-Ning",
        "price": 4_320_000,
        "original_price": 5_184_000,
        "source": "https://shopvnb.com/vot-cau-long-lining-axforce-80.html",
        "description": (
            "Mẫu vợt thiên công, hướng tới người chơi thích tạo lực ở cuối sân. Nhà bán lẻ "
            "liệt kê các lựa chọn 3U, 4U và 5U; chiều dài 675 mm; cân bằng khoảng 305 mm; "
            "mức căng tối đa được nguồn ghi đến 30 lb. Thông số có thể khác theo phiên bản "
            "và cần đối chiếu tem trên vợt. Giá chỉ là ảnh chụp tham khảo, chưa được duyệt."
        ),
        "weight": None,
        "style": "TAN_CONG",
        "balance": "NANG_DAU",
        "stiffness": "CUNG",
        "max_tension": 30,
    },
    {
        "category": 1,
        "name": "Vợt cầu lông Yonex Nanoflare 002A",
        "brand": "Yonex",
        "price": 1_299_000,
        "original_price": 1_359_000,
        "source": "https://shopvnb.com/vot-cau-long-yonex-nanoflare-002a.html",
        "description": (
            "Dòng Nanoflare hướng tới cảm giác đánh nhanh, dễ xoay trở trong các pha cầu đôi. "
            "Nhà bán lẻ liệt kê cỡ 3U/4U và cán G4/G5/G6 tùy lựa chọn. Cần xác nhận chính xác "
            "phiên bản, màu, tình trạng đan dây và bảo hành trước khi đặt. Giá đang là mức "
            "tham khảo, chưa được Badminton Store xác nhận."
        ),
        "weight": None,
        "style": None,
        "balance": None,
        "stiffness": None,
        "max_tension": None,
    },
    {
        "category": 2,
        "name": "Giày cầu lông Yonex Power Cushion 88 Dial Gen 3 Wide",
        "brand": "Yonex",
        "price": 3_059_000,
        "original_price": 3_670_800,
        "source": "https://shopvnb.com/giay-cau-long-yonex-88-dial-3-wide-2025.html",
        "description": (
            "Phiên bản phom Wide dành cho người cần thêm không gian ngang bàn chân; hệ thống "
            "vặn dây giúp điều chỉnh độ ôm nhanh. Nguồn bán lẻ liệt kê nhiều cỡ khoảng 36–45 "
            "tùy tồn kho và màu Light Beige. Nên thử cỡ, kiểm tra phom chân và xác nhận hàng "
            "thực tế trước khi mua. Giá trong bản nháp là giá tham khảo tại ngày kiểm tra."
        ),
        "weight": None,
        "style": None,
        "balance": None,
        "stiffness": None,
        "max_tension": None,
    },
    {
        "category": 2,
        "name": "Giày cầu lông Yonex Cascade Accel Gen 2",
        "brand": "Yonex",
        "price": 2_149_000,
        "original_price": 2_578_800,
        "source": "https://shopvnb.com/giay-cau-long-yonex-cascade-accel-gen-2.html",
        "description": (
            "Giày sân trong dòng Cascade Accel Gen 2, có phối màu và cỡ giày thay đổi theo "
            "đợt bán. Nguồn tham khảo liệt kê màu Blue và White/Orange cùng nhiều cỡ người lớn. "
            "Nên thử độ ôm gót, khoảng trống mũi chân và độ bám trên mặt sân thực tế. Giá là "
            "mức tham khảo từ nhà bán lẻ, chưa được cửa hàng duyệt."
        ),
        "weight": None,
        "style": None,
        "balance": None,
        "stiffness": None,
        "max_tension": None,
    },
    {
        "category": 2,
        "name": "Giày cầu lông Yonex Cascade Accel Gen 2 Wide",
        "brand": "Yonex",
        "price": 2_149_000,
        "original_price": 2_578_800,
        "source": "https://shopvnb.com/giay-cau-long-yonex-cascade-accel-gen-2-wide.html",
        "description": (
            "Biến thể Wide của Cascade Accel Gen 2 dành cho người cần phom ngang rộng hơn. "
            "Nguồn bán lẻ liệt kê màu Purple và White/Light Blue; cỡ thay đổi theo kho. Hãy "
            "thử trực tiếp để chọn cỡ vừa chân và kiểm tra tồn kho, bảo hành. Giá trong bản "
            "nháp chỉ để đối chiếu, chưa được cửa hàng xác nhận."
        ),
        "weight": None,
        "style": None,
        "balance": None,
        "stiffness": None,
        "max_tension": None,
    },
]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Ghi sản phẩm dưới dạng bản nháp ẩn, tồn kho 0; mặc định chỉ xem trước.",
    )
    args = parser.parse_args()

    print(f"Danh mục tham khảo đã kiểm tra ngày {CHECKED_ON}: {len(CANDIDATES)} sản phẩm")
    for item in CANDIDATES:
        print(f"- [{item['category']}] {item['name']} — {item['price']:,} đ — {item['source']}")
    if not args.apply:
        print("Chế độ xem trước; chưa kết nối cơ sở dữ liệu. Dùng --apply sau khi duyệt danh mục.")
        return 0

    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    created = 0
    skipped = 0
    try:
        conn.start_transaction()
        for item in CANDIDATES:
            cursor.execute("SELECT MaSP FROM SanPham WHERE TenSP=%s LIMIT 1", (item["name"],))
            if cursor.fetchone():
                skipped += 1
                continue
            cursor.execute("SELECT MaDM FROM DanhMuc WHERE MaDM=%s LIMIT 1", (item["category"],))
            if not cursor.fetchone():
                raise RuntimeError(f"Danh mục {item['category']} chưa tồn tại; đã hủy giao dịch.")
            description = (
                f"{item['description']} Giá tham khảo được kiểm tra ngày {CHECKED_ON}; "
                "quản trị viên cần xác nhận giá, ảnh, phiên bản và số lượng trước khi công khai."
            )
            cursor.execute(
                """INSERT INTO SanPham
                   (MaDM,TenSP,MoTa,GiaBan,GiaGoc,TonKho,HinhAnh,ThuongHieu,AnhChiTiet,
                    TrangThai,NguonURL,NguonTen,TrongLuongCan,LoiChoi,DiemCanBang,DoCungDua,LucCangToiDa)
                   VALUES (%s,%s,%s,%s,%s,0,%s,%s,'[]',0,%s,'ShopVNB',%s,%s,%s,%s,%s)""",
                (
                    item["category"], item["name"], description, item["price"],
                    item["original_price"], PLACEHOLDER_IMAGE, item["brand"], item["source"],
                    item["weight"], item["style"], item["balance"], item["stiffness"],
                    item["max_tension"],
                ),
            )
            created += 1
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        cursor.close()
        conn.close()
    print(f"Đã tạo {created} bản nháp ẩn; bỏ qua {skipped} sản phẩm đã có.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
