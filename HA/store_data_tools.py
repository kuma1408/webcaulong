"""Lệnh quản trị dữ liệu cửa hàng chạy qua SSH (Flask CLI).

    flask --app wsgi restock-products            # xem trước
    flask --app wsgi restock-products --apply    # bổ sung tồn kho hàng đã hết
    flask --app wsgi import-products-2026-11 [--apply]
    flask --app wsgi demo-activity [--apply | --remove]

Mọi lệnh mặc định chỉ XEM TRƯỚC; phải thêm --apply mới ghi vào database.

Dữ liệu DEMO (demo-activity) chỉ để báo cáo/AI quản trị có số liệu minh họa:
- khách hàng demo bị khóa đăng nhập, email đuôi @demo.invalid;
- đơn hàng ghi chú bắt đầu bằng "[DEMO]", chỉ ở trạng thái kết thúc
  (HOAN_THANH / DA_HUY) nên không ai xử lý nhầm;
- KHÔNG cộng "Đã bán" (SoLuotMua), KHÔNG trừ tồn kho, KHÔNG tạo đánh giá,
  nên khách hàng trên website không nhìn thấy số liệu này;
- xóa sạch bằng --remove.
"""

from __future__ import annotations

import random
import secrets
from datetime import datetime, timedelta

import click
from werkzeug.security import generate_password_hash

from HA.app import app, get_db_connection

# ---------------------------------------------------------------------------
# 1. Bổ sung tồn kho
# ---------------------------------------------------------------------------


@app.cli.command("restock-products")
@click.option("--threshold", default=0, show_default=True, type=click.IntRange(0, 1000),
              help="Bổ sung các sản phẩm đang bán có tồn kho <= ngưỡng này.")
@click.option("--quantity", default=20, show_default=True, type=click.IntRange(1, 10000),
              help="Số lượng tồn kho mới sau khi bổ sung.")
@click.option("--apply", "apply_changes", is_flag=True, help="Ghi vào database (mặc định chỉ xem trước).")
def restock_products(threshold: int, quantity: int, apply_changes: bool):
    """Đặt lại tồn kho cho sản phẩm đang bán đã hết (hoặc dưới ngưỡng)."""
    if quantity <= threshold:
        raise click.ClickException("--quantity phải lớn hơn --threshold.")
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            "SELECT MaSP, TenSP, TonKho FROM SanPham WHERE TrangThai = 1 AND TonKho <= %s ORDER BY TonKho, MaSP",
            (threshold,),
        )
        rows = cursor.fetchall()
        if not rows:
            click.echo("Không có sản phẩm đang bán nào cần bổ sung.")
            return
        for row in rows:
            click.echo(f"  #{row['MaSP']:<5} tồn {int(row['TonKho'] or 0):>3} -> {quantity:<4} {row['TenSP']}")
        if not apply_changes:
            click.echo(f"XEM TRƯỚC: {len(rows)} sản phẩm sẽ được đặt tồn kho = {quantity}. Thêm --apply để ghi.")
            return
        cursor.execute(
            "UPDATE SanPham SET TonKho = %s, NgayCapNhat = NOW() WHERE TrangThai = 1 AND TonKho <= %s",
            (quantity, threshold),
        )
        conn.commit()
        click.echo(f"Đã bổ sung tồn kho cho {cursor.rowcount} sản phẩm.")
    except Exception:
        conn.rollback()
        raise
    finally:
        cursor.close()
        conn.close()


# ---------------------------------------------------------------------------
# 2. Sản phẩm mới (danh mục tham khảo công khai meta.vn ngày 26-11-2026)
# ---------------------------------------------------------------------------
# (MaDM, tên, thương hiệu, giá bán, giá gốc hoặc None, URL nguồn)
# MaDM: 1 vợt, 6 túi, 7 balo, 8 phụ kiện. Không sao chép ảnh/mô tả nguồn.
CHECKED_ON = "26/11/2026"
PLACEHOLDER_IMAGE = "HA/cc-removebg-preview.png"
M = "https://meta.vn/"
NEW_PRODUCTS_2026_11 = [
    (1, "Vợt cầu lông FZ Forza Light 1", "Forza", 960000, 1320000, M + "vot-cau-long-fz-forza-light-1-p76664"),
    (1, "Vợt cầu lông FZ Forza Light 8", "Forza", 1690000, 2550000, M + "vot-cau-long-fz-forza-light-8-p76644"),
    (1, "Vợt cầu lông FZ Forza Light 9.9", "Forza", 1950000, 2990000, M + "vot-cau-long-fz-forza-light-9-9-p76629"),
    (1, "Vợt cầu lông FZ Forza Graphite Light 88", "Forza", 1360000, 1800000, M + "vot-cau-long-fz-forza-graphite-light-88-p76668"),
    (1, "Vợt cầu lông Forza Power 976", "Forza", 1950000, 2200000, M + "vot-cau-long-forza-power-976-p108761"),
    (1, "Vợt cầu lông FZ Forza Power 388M", "Forza", 1420000, 1800000, M + "vot-cau-long-fz-forza-power-388m-p76627"),
    (1, "Vợt cầu lông FZ Forza Power 388F", "Forza", 1340000, 1550000, M + "vot-cau-long-fz-forza-power-388f-p76581"),
    (1, "Vợt cầu lông FZ Forza Power 588M", "Forza", 1480000, None, M + "vot-cau-long-fz-forza-power-588m-p76619"),
    (1, "Vợt cầu lông FZ Forza Power 988M", "Forza", 2290000, 3000000, M + "vot-cau-long-fz-forza-power-988m-p76620"),
    (1, "Vợt cầu lông FZ Forza CNT-Kevlar Power 6.0", "Forza", 1690000, 1900000, M + "vot-cau-long-fz-forza-cnt-kevlar-power-6-0-p127254"),
    (1, "Vợt cầu lông Adidas WUCHT P8 SCHOCK SOLAR RED 3U đỏ/đen", "Adidas", 3590000, None, M + "vot-cau-long-adidas-wucht-p8-schock-solar-red-3u-do-den-p81517"),
    (1, "Vợt cầu lông Adidas WUCHT P8 SCHOCK SOLAR RED 4U đỏ/đen", "Adidas", 3140000, None, M + "vot-cau-long-adidas-wucht-p8-schock-solar-red-4u-do-den-p81525"),
    (1, "Vợt cầu lông Adidas WUCHT P8 OLYMPIC WHITE 4U trắng/đen/cam", "Adidas", 3590000, None, M + "vot-cau-long-adidas-wucht-p8-olympic-white-4u-p81523"),
    (1, "Vợt cầu lông Adidas WUCHT P8 OLYMPIC WHITE 3U", "Adidas", 3590000, None, M + "vot-cau-long-adidas-wucht-p8-olympic-white-3u-p81470"),
    (1, "Vợt cầu lông Adidas Wucht P6 Shock Cyan - Xanh dương", "Adidas", 3990000, None, M + "vot-cau-long-adidas-wucht-p6-shock-cyan-xanh-duong-p76670"),
    (1, "Vợt cầu lông Miiracer Lionking 808", "Miiracer", 1699000, 2888000, M + "vot-cau-long-miiracer-lionking-808-p44146"),
    (1, "Vợt cầu lông Miiracer Taranis 999", "Miiracer", 2730000, 3550000, M + "vot-cau-long-miiracer-taranis-999-p44123"),
    (1, "Vợt cầu lông Miiracer Taranis 997", "Miiracer", 2640000, 3150000, M + "vot-cau-long-miiracer-taranis-997-p44121"),
    (1, "Vợt cầu lông Miiracer Knight Cavalier 32", "Miiracer", 960000, 1250000, M + "vot-cau-long-miiracer-knight-cava-lier-32-p44147"),
    (1, "Vợt cầu lông Miiracer Assassin 35", "Miiracer", 860000, 1030000, M + "vot-cau-long-miiracer-assassin-35-p44101"),
    (1, "Vợt cầu lông Miiracer Assassin 25+", "Miiracer", 770000, 950000, M + "vot-cau-long-miiracer-assassin-25-p44098"),
    (1, "Vợt cầu lông Miiracer Breaking 389", "Miiracer", 950000, 1150000, M + "vot-cau-long-miiracer-breaking-389-p44102"),
    (1, "Vợt cầu lông Miiracer Woven Shot 888", "Miiracer", 1810000, 2300000, M + "vot-cau-long-miiracer-woven-shot-888-p44150"),
    (1, "Vợt cầu lông Miiracer Woven Shot 889", "Miiracer", 1810000, 2300000, M + "vot-cau-long-miiracer-woven-shot-889-p44120"),
    (1, "Vợt cầu lông Miiracer Wing of Steel 50", "Miiracer", 610000, 700000, M + "vot-cau-long-miiracer-wing-of-steel-50-p44107"),
    (1, "Vợt cầu lông Miiracer Wing of Steel 40", "Miiracer", 500000, 650000, M + "vot-cau-long-miiracer-wing-of-steel-40-p44106"),
    (1, "Vợt cầu lông Miiracer Phoenix 8800", "Miiracer", 3080000, 3960000, M + "vot-cau-long-miiracer-phoenix-8800-p44127"),
    (1, "Vợt cầu lông Mizuno JPX 10.3 4U (MZ-BF2257)", "Mizuno", 2990000, 3700000, M + "vot-cau-long-mizuno-jpx-10-3-4u-mz-bf2257-p99006"),
    (1, "Vợt cầu lông Mizuno JPX Limited Edition Attack+ 3U (MZ-BF2255)", "Mizuno", 2720000, None, M + "vot-cau-long-mizuno-jpx-limited-edition-attack-3u-mz-bf2255-p99022"),
    (1, "Vợt cầu lông Mizuno Turboblade K600", "Mizuno", 1030000, 1500000, M + "vot-cau-long-mizuno-turboblade-k600-p79432"),
    (1, "Vợt cầu lông Mizuno Nanoblade 909", "Mizuno", 1060000, 1500000, M + "vot-cau-long-mizuno-nanoblade-909-p58802"),
    (1, "Vợt cầu lông Mizuno Dynalite 780", "Mizuno", 1370000, None, M + "vot-cau-long-mizuno-dynalite-780-p106289"),
    (1, "Vợt cầu lông Mizuno Dynalite 770", "Mizuno", 1370000, None, M + "vot-cau-long-mizuno-dynalite-770-p106281"),
    (1, "Vợt cầu lông Mizuno Fioria Lite", "Mizuno", 1460000, None, M + "vot-cau-long-mizuno-fioria-lite-p53508"),
    (1, "Vợt cầu lông Mizuno XYST-02 3U (MZ-BF2083)", "Mizuno", 3000000, 4200000, M + "vot-cau-long-mizuno-xyst-02-3u-mz-bf2083-p99045"),
    (1, "Vợt cầu lông Mizuno Duralite 69", "Mizuno", 1460000, None, M + "vot-cau-long-mizuno-duralite-69-p106288"),
    (1, "Vợt cầu lông Mizuno Duralite 68 (75g)", "Mizuno", 1420000, 2000000, M + "vot-cau-long-mizuno-duralite-68-p48494"),
    (1, "Vợt cầu lông Mizuno Caliber S-Boost (MZ-BF2266)", "Mizuno", 2010000, 2700000, M + "vot-cau-long-mizuno-caliber-s-boost-mz-bf2266-p98673"),
    (1, "Vợt cầu lông Mizuno Fortius 29 Ultima 5U (MZ-BF2249)", "Mizuno", 3230000, None, M + "vot-cau-long-mizuno-fortius-29-ultima-5u-mz-bf2249-p99041"),
    (1, "Vợt cầu lông Dunlop Force Max G2HL", "Dunlop", 1670000, 2190000, M + "vot-cau-long-dunlop-force-max-g2hl-p44794"),
    (1, "Vợt cầu lông Kamito Galaxy Play", "Kamito", 570000, None, M + "vot-cau-long-kamito-galaxy-play-p112325"),
    (1, "Vợt cầu lông Kamito Stark Power 100", "Kamito", 680000, 740000, M + "vot-cau-long-kamito-stark-power-100-p80494"),
    (1, "Vợt cầu lông Kamito Helios", "Kamito", 1120000, 1182000, M + "vot-cau-long-kamito-helios-p80493"),
    (1, "Vợt cầu lông Kamito Mercury", "Kamito", 640000, None, M + "vot-cau-long-kamito-mercurry-p80496"),
    (1, "Vợt cầu lông Kamito Vragon KMBR21005", "Kamito", 210000, 290000, M + "vot-cau-long-kamito-vragon-kmbr21005-p93298"),
    (1, "Vợt cầu lông Kamito Vragon Kid KMBR21004", "Kamito", 180000, 306000, M + "vot-cau-long-kamito-vragon-kid-kmbr21004-p93297"),
    (1, "Vợt cầu lông JEEPN X6", "JEEPN", 560000, 890000, M + "vot-cau-long-jeepn-x6-p98150"),
    (1, "Vợt cầu lông JEEPN - Tuổi Ngọ", "JEEPN", 560000, 795000, M + "vot-cau-long-jeepn-tuoi-ngo-p43800"),
    (1, "Vợt cầu lông JEEPN - Tuổi Dậu", "JEEPN", 560000, 795000, M + "vot-cau-long-jeepn-tuoi-dau-p43797"),
    (1, "Vợt cầu lông JEEPN - Tuổi Sửu", "JEEPN", 560000, 795000, M + "vot-cau-long-jeepn-tuoi-suu-p43790"),
    (1, "Vợt cầu lông JEEPN - Tuổi Mùi", "JEEPN", 560000, 795000, M + "vot-cau-long-jeepn-tuoi-mui-p43798"),
    (1, "Vợt cầu lông JEEPN - Tuổi Dần", "JEEPN", 560000, 795000, M + "vot-cau-long-jeepn-tuoi-dan-p43788"),
    (1, "Vợt cầu lông Promax Power Of Star 7", "Promax", 460000, 490000, M + "vot-cau-long-promax-power-of-star-7-p35180"),
    (1, "Vợt cầu lông Promax Power Of Star 9", "Promax", 520000, 600000, M + "vot-cau-long-promax-power-of-star-9-p35179"),
    (1, "Cặp vợt cầu lông Ebet Power 1911", "Ebet", 150000, None, M + "cap-vot-cau-long-ebet-power-1911-p84911"),
    (6, "Túi cầu lông Adidas 2 ngăn 360 B7", "Adidas", 2190000, None, M + "tui-cau-long-adidas-360-b7-p92686"),
    (6, "Túi Adidas vuông XS5 Tournament Bag", "Adidas", 1990000, None, M + "tui-adidas-vuong-xs5-tournament-bag-p81846"),
    (6, "Túi đeo vai Adidas U5 Shoulder Bag", "Adidas", 1380000, 2200000, M + "tui-deo-vai-adidas-u5-shoulder-bag-p81847"),
    (6, "Túi cầu lông Babolat Backrack 3 (757021)", "Babolat", 1499000, None, M + "tui-cau-long-babolat-backrack-3-757021-p106426"),
    (6, "Túi cầu lông Babolat Cross Pro (757020)", "Babolat", 2740000, None, M + "tui-cau-long-babolat-cross-pro-757020-p106421"),
    (6, "Túi đựng vợt cầu lông Babolat Backracq 8 (757009-328)", "Babolat", 1040000, 1500000, M + "tui-dung-vot-cau-long-babolat-backracq-8-backpack-757009-328-p78551"),
    (6, "Túi đựng vợt cầu lông Mizuno Duffle Bag (MZ-DB2014)", "Mizuno", 1330000, None, M + "tui-dung-vot-cau-long-mizuno-duffle-bag-mz-db2014-p99220"),
    (6, "Túi đựng vợt cầu lông Mizuno Duffle Bag (MZ-DB2009)", "Mizuno", 1790000, 2299000, M + "tui-dung-vot-cau-long-mizuno-duffle-bag-mz-db2009-p99090"),
    (6, "Túi đựng vợt cầu lông Mizuno 2Comp Bag (MZ-CP2032)", "Mizuno", 1999000, None, M + "tui-dung-vot-cau-long-mizuno-2comp-bag-mz-cp2032-p99097"),
    (6, "Túi đựng vợt cầu lông Mizuno 3Comp Bag (MZ-CP202)", "Mizuno", 1870000, None, M + "tui-dung-vot-cau-long-mizuno-3comp-bag-mz-cp202-p99098"),
    (7, "Balo Adidas 360 B7", "Adidas", 1690000, 2050000, M + "balo-adidas-360-b7-p92685"),
    (7, "Balo Adidas XS5 Back Pack", "Adidas", 1460000, None, M + "balo-adidas-xs5-back-pack-p81844"),
    (7, "Balo cầu lông Kamito KMBALO200146 đen hồng", "Kamito", 500000, 590000, M + "balo-cau-long-kamito-kmbalo200146-p75263"),
    (7, "Balo cầu lông Mizuno MZ-BP2013", "Mizuno", 1710000, 2350000, M + "balo-cau-long-mizuno-mz-bp2013-p76351"),
    (7, "Balo cầu lông Mizuno Full Bodice Backpack (MZ-BP2019)", "Mizuno", 1020000, None, M + "tui-dung-vot-cau-long-mizuno-full-bodice-backpack-mz-bp2019-p99218"),
    (8, "Lưới cầu lông tập luyện S27830", "Sodex", 217000, 240000, M + "luoi-cau-long-tap-luyen-s27830-p32398"),
    (8, "Lưới cầu lông luyện tập 501506", "Sodex", 270000, 370000, M + "luoi-cau-long-luyen-tap-501506-p7101"),
    (8, "Lưới cầu lông thi đấu 501809", "Sodex", 330000, 350000, M + "luoi-cau-long-thi-dau-501809-p17408"),
    (8, "Lưới cầu lông thi đấu S27840", "Sodex", 371000, 420000, M + "luoi-cau-long-thi-dau-s27840-p65258"),
    (8, "Lưới cầu lông thi đấu chuẩn quốc tế FFBaD S27875", "Sodex", 742000, 790000, M + "luoi-cau-long-thi-dau-chuan-quoc-te-ffbad-s27875-p65406"),
    (8, "Bảng điểm lật tay 2 số 502390 (S390)", "Sodex", 1550000, 1714000, M + "bang-diem-lat-tay-2-so-502390-s390-p6987"),
]
CATEGORY_WORDS = {1: "vợt cầu lông", 6: "túi đựng vợt", 7: "balo cầu lông", 8: "phụ kiện sân cầu lông"}


def new_product_description(category: int, brand: str, source: str) -> str:
    return (
        f"<p>{CATEGORY_WORDS.get(category, 'Sản phẩm cầu lông').capitalize()} chính hãng {brand}, "
        "mới bổ sung vào danh mục của Badminton Store.</p>"
        f"<p>Giá tham khảo theo danh mục công khai ngày {CHECKED_ON} ({source}). "
        "Thông số chi tiết, màu sắc và hình ảnh thật sẽ được cửa hàng cập nhật; "
        "vui lòng nhắn cửa hàng để được tư vấn trước khi đặt.</p>"
    )


@app.cli.command("import-products-2026-11")
@click.option("--stock", default=10, show_default=True, type=click.IntRange(0, 10000), help="Tồn kho ban đầu.")
@click.option("--hidden", is_flag=True, help="Thêm ở trạng thái ẩn để admin duyệt ảnh/giá trước khi bán.")
@click.option("--apply", "apply_changes", is_flag=True, help="Ghi vào database (mặc định chỉ xem trước).")
def import_products_2026_11(stock: int, hidden: bool, apply_changes: bool):
    """Thêm sản phẩm mới (vợt, túi, balo, lưới…) từ danh mục tham khảo; bỏ qua tên đã có."""
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    created = []
    try:
        cursor.execute("SELECT MaDM FROM DanhMuc")
        categories = {int(row["MaDM"]) for row in cursor.fetchall()}
        missing = sorted({item[0] for item in NEW_PRODUCTS_2026_11} - categories)
        if missing:
            raise click.ClickException(f"Database thiếu danh mục MaDM={missing}.")
        for category, name, brand, price, original, url in NEW_PRODUCTS_2026_11:
            cursor.execute("SELECT MaSP FROM SanPham WHERE LOWER(TenSP) = LOWER(%s) LIMIT 1", (name,))
            if cursor.fetchone():
                continue
            created.append(name)
            if apply_changes:
                cursor.execute(
                    """INSERT INTO SanPham
                       (MaDM, TenSP, MoTa, GiaBan, GiaGoc, TonKho, HinhAnh, ThuongHieu, AnhChiTiet,
                        TrangThai, NguonURL, NguonTen)
                       VALUES (%s, %s, %s, %s, %s, %s, %s, %s, '[]', %s, %s, 'META.vn')""",
                    (category, name, new_product_description(category, brand, "META.vn"), price, original,
                     stock, PLACEHOLDER_IMAGE, brand, 0 if hidden else 1, url),
                )
        for name in created:
            click.echo(f"  + {name}")
        skipped = len(NEW_PRODUCTS_2026_11) - len(created)
        state = "ẩn (chờ duyệt)" if hidden else "đang bán"
        if not apply_changes:
            conn.rollback()
            click.echo(f"XEM TRƯỚC: sẽ thêm {len(created)} sản phẩm {state}, tồn {stock}; bỏ qua {skipped} tên đã có. Thêm --apply để ghi.")
            return
        conn.commit()
        click.echo(f"Đã thêm {len(created)} sản phẩm {state}, tồn {stock}; bỏ qua {skipped} tên đã có.")
        click.echo("Ảnh đang là ảnh tạm: hãy vào admin > Sản phẩm để tải ảnh thật và kiểm tra lại giá.")
    except Exception:
        conn.rollback()
        raise
    finally:
        cursor.close()
        conn.close()


# ---------------------------------------------------------------------------
# 3. Dữ liệu hoạt động DEMO cho báo cáo quản trị
# ---------------------------------------------------------------------------
DEMO_USER_PREFIX = "demo_kh_"
DEMO_EMAIL_DOMAIN = "@demo.invalid"
DEMO_NOTE = "[DEMO] Dữ liệu minh họa cho báo cáo quản trị - xóa bằng: flask --app wsgi demo-activity --remove"
FAMILY = ["Nguyễn", "Trần", "Lê", "Phạm", "Hoàng", "Huỳnh", "Phan", "Vũ", "Võ", "Đặng", "Bùi", "Đỗ", "Hồ", "Ngô", "Dương"]
MIDDLE = ["Văn", "Thị", "Minh", "Ngọc", "Thanh", "Quốc", "Gia", "Hữu", "Thu", "Đức", "Bảo", "Khánh"]
GIVEN = ["An", "Bình", "Châu", "Dũng", "Giang", "Hà", "Hải", "Hiếu", "Hoa", "Huy", "Khang", "Lan", "Linh",
         "Long", "Mai", "Nam", "Nhi", "Phong", "Phúc", "Quân", "Quỳnh", "Sơn", "Tâm", "Thảo", "Trang", "Trung",
         "Tú", "Tuấn", "Vy", "Yến"]
AREAS = ["Quận 1, TP.HCM", "Quận 3, TP.HCM", "Quận 7, TP.HCM", "TP. Thủ Đức, TP.HCM", "Quận Gò Vấp, TP.HCM",
         "Quận Cầu Giấy, Hà Nội", "Quận Đống Đa, Hà Nội", "Quận Hải Châu, Đà Nẵng", "TP. Biên Hòa, Đồng Nai",
         "TP. Thủ Dầu Một, Bình Dương", "Quận Ninh Kiều, Cần Thơ"]
# Tỉ trọng chọn sản phẩm theo danh mục (phụ kiện/cầu bán nhiều, vợt giá trị cao).
CATEGORY_WEIGHTS = {1: 26, 2: 14, 3: 10, 4: 4, 5: 7, 6: 6, 7: 5, 8: 28}


def demo_counts(cursor) -> tuple[int, int]:
    cursor.execute(
        "SELECT COUNT(*) AS n FROM NguoiDung WHERE TenDangNhap LIKE %s AND Email LIKE %s",
        (DEMO_USER_PREFIX + "%", "%" + DEMO_EMAIL_DOMAIN),
    )
    users = int(cursor.fetchone()["n"])
    cursor.execute("SELECT COUNT(*) AS n FROM DonHang WHERE GhiChu LIKE '[DEMO]%%'")
    orders = int(cursor.fetchone()["n"])
    return users, orders


def build_demo_plan(products: list[dict], customers: int, orders: int, days: int, rng: random.Random, now: datetime):
    """Trả danh sách đơn: (chỉ số khách, thời điểm, trạng thái, phương thức, [(MaSP, SL, giá)])."""
    by_category: dict[int, list[dict]] = {}
    for product in products:
        by_category.setdefault(int(product["MaDM"]), []).append(product)
    categories = [category for category in by_category if CATEGORY_WEIGHTS.get(category)]
    weights = [CATEGORY_WEIGHTS[category] for category in categories]
    # Lượng đơn tăng dần về cuối kỳ và đông hơn vào cuối tuần.
    day_weights = []
    for offset in range(days):
        day = now - timedelta(days=days - 1 - offset)
        weight = 0.7 + 0.6 * offset / max(days - 1, 1)
        if day.weekday() >= 5:
            weight *= 1.45
        day_weights.append(weight)
    plan = []
    for _ in range(orders):
        offset = rng.choices(range(days), weights=day_weights)[0]
        day = now - timedelta(days=days - 1 - offset)
        moment = day.replace(hour=rng.choice([8, 9, 10, 11, 12, 13, 14, 15, 16, 19, 20, 20, 21, 21, 22]),
                             minute=rng.randrange(60), second=rng.randrange(60), microsecond=0)
        if moment > now:
            moment = now - timedelta(minutes=rng.randrange(5, 240))
        status = "DA_HUY" if rng.random() < 0.09 else "HOAN_THANH"
        method = rng.choices(["COD", "BANKING", "SO_DU"], weights=[58, 32, 10])[0]
        items = {}
        for _ in range(rng.choices([1, 2, 3], weights=[62, 28, 10])[0]):
            category = rng.choices(categories, weights=weights)[0]
            product = rng.choice(by_category[category])
            quantity = rng.choices([1, 2, 3], weights=[80, 15, 5])[0] if category == 8 else 1
            items[int(product["MaSP"])] = (int(product["MaSP"]), quantity, float(product["GiaBan"]))
        plan.append((rng.randrange(customers), moment, status, method, list(items.values())))
    plan.sort(key=lambda order: order[1])
    return plan


def remove_demo_data(cursor) -> tuple[int, int, int]:
    cursor.execute(
        "SELECT MaND FROM NguoiDung WHERE TenDangNhap LIKE %s AND Email LIKE %s",
        (DEMO_USER_PREFIX + "%", "%" + DEMO_EMAIL_DOMAIN),
    )
    user_ids = [int(row["MaND"]) for row in cursor.fetchall()]
    items = orders = 0
    if user_ids:
        marks = ",".join(["%s"] * len(user_ids))
        cursor.execute(
            f"""DELETE ct FROM ChiTietDonHang ct JOIN DonHang dh ON dh.MaDH = ct.MaDH
                WHERE dh.MaND IN ({marks}) AND dh.GhiChu LIKE '[DEMO]%%'""",
            user_ids,
        )
        items = cursor.rowcount
        cursor.execute(f"DELETE FROM DonHang WHERE MaND IN ({marks}) AND GhiChu LIKE '[DEMO]%%'", user_ids)
        orders = cursor.rowcount
        cursor.execute(f"DELETE FROM NguoiDung WHERE MaND IN ({marks})", user_ids)
    return len(user_ids), orders, items


@app.cli.command("demo-activity")
@click.option("--days", default=30, show_default=True, type=click.IntRange(7, 90))
@click.option("--orders", default=220, show_default=True, type=click.IntRange(10, 2000))
@click.option("--customers", default=60, show_default=True, type=click.IntRange(5, 500))
@click.option("--seed", default=None, type=int, help="Cố định ngẫu nhiên để tạo lại đúng bộ dữ liệu.")
@click.option("--apply", "apply_changes", is_flag=True, help="Ghi vào database (mặc định chỉ xem trước).")
@click.option("--remove", "remove", is_flag=True, help="Xóa toàn bộ khách hàng và đơn hàng DEMO.")
def demo_activity(days: int, orders: int, customers: int, seed: int | None, apply_changes: bool, remove: bool):
    """Tạo/xóa khách và đơn hàng DEMO để trang quản trị có số liệu 30 ngày."""
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        existing_users, existing_orders = demo_counts(cursor)
        if remove:
            if not apply_changes:
                click.echo(f"XEM TRƯỚC: sẽ xóa {existing_users} khách DEMO và {existing_orders} đơn DEMO. Thêm --apply để xóa.")
                return
            users, deleted_orders, items = remove_demo_data(cursor)
            conn.commit()
            click.echo(f"Đã xóa {users} khách DEMO, {deleted_orders} đơn DEMO và {items} dòng chi tiết.")
            return
        if existing_users or existing_orders:
            raise click.ClickException(
                f"Đang có {existing_users} khách / {existing_orders} đơn DEMO. Chạy --remove --apply trước khi tạo lại."
            )
        cursor.execute("SELECT MaSP, MaDM, GiaBan FROM SanPham WHERE TrangThai = 1 AND GiaBan > 0")
        products = cursor.fetchall()
        if not products:
            raise click.ClickException("Chưa có sản phẩm đang bán để tạo đơn mẫu.")
        rng = random.Random(seed)
        now = datetime.now()
        plan = build_demo_plan(products, customers, orders, days, rng, now)
        revenue = sum(sum(q * p for _, q, p in items) for _, _, status, _, items in plan if status == "HOAN_THANH")
        cancelled = sum(1 for order in plan if order[2] == "DA_HUY")
        click.echo(
            f"{'XEM TRƯỚC' if not apply_changes else 'ĐANG TẠO'}: {customers} khách DEMO (bị khóa đăng nhập), "
            f"{len(plan)} đơn trong {days} ngày ({cancelled} đơn hủy), doanh thu hoàn thành ~{revenue:,.0f}đ."
        )
        if not apply_changes:
            click.echo("Không đổi 'Đã bán', tồn kho hay đánh giá. Thêm --apply để ghi; xóa sau bằng --remove --apply.")
            return
        user_ids = []
        unusable_password = generate_password_hash(secrets.token_urlsafe(32))
        for index in range(customers):
            username = f"{DEMO_USER_PREFIX}{index + 1:03d}"
            fullname = f"{rng.choice(FAMILY)} {rng.choice(MIDDLE)} {rng.choice(GIVEN)}"
            joined = now - timedelta(days=rng.randrange(0, days * 2), hours=rng.randrange(24))
            cursor.execute(
                """INSERT INTO NguoiDung (TenDangNhap, MatKhau, HoTen, Email, DiaChi, SoDu, VaiTro, TrangThai)
                   VALUES (%s, %s, %s, %s, %s, 0, 'user', 0)""",
                (username, unusable_password, fullname, username + DEMO_EMAIL_DOMAIN, rng.choice(AREAS) + " (địa chỉ mẫu)"),
            )
            user_id = cursor.lastrowid
            cursor.execute("UPDATE NguoiDung SET NgayTaoTaiKhoan = %s WHERE MaND = %s", (joined, user_id))
            user_ids.append(user_id)
        for customer, moment, status, method, items in plan:
            total = sum(quantity * price for _, quantity, price in items)
            payment = "DA_HUY" if status == "DA_HUY" else "DA_THANH_TOAN"
            cursor.execute(
                """INSERT INTO DonHang (MaND, TongTien, DiaChiGiao, GhiChu, TrangThai, PhuongThuc, TrangThaiThanhToan, NgayDat)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s)""",
                (user_ids[customer], total, rng.choice(AREAS) + " (địa chỉ mẫu)", DEMO_NOTE, status, method, payment, moment),
            )
            order_id = cursor.lastrowid
            for product_id, quantity, price in items:
                cursor.execute(
                    "INSERT INTO ChiTietDonHang (MaDH, MaSP, SoLuong, GiaBan, CauHinh) VALUES (%s, %s, %s, %s, NULL)",
                    (order_id, product_id, quantity, price),
                )
        conn.commit()
        click.echo("Đã tạo xong. Xóa bất cứ lúc nào: flask --app wsgi demo-activity --remove --apply")
    except Exception:
        conn.rollback()
        raise
    finally:
        cursor.close()
        conn.close()
