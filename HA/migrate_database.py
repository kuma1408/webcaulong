"""Migration cơ sở dữ liệu an toàn cho Badminton Store.

Mặc định script chỉ đọc ``INFORMATION_SCHEMA`` và in kế hoạch. Chỉ khi truyền
``--apply`` script mới chạy các câu lệnh DDL additive (không DROP/DELETE) và ghi
phiên bản migration. Các câu lệnh được thiết kế để có thể chạy lại sau khi bị
gián đoạn.

Ví dụ::

    python HA/migrate_database.py
    python HA/migrate_database.py --apply
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from dataclasses import dataclass

import mysql.connector
from mysql.connector import Error
from dotenv import load_dotenv


load_dotenv()
MIGRATION_VERSION = "2026-08-17-support-contact-theme-v6"
LOCK_NAME = "shop_caulong_schema_migration"
BASE_TABLES = {
    "nguoidung": {
        "mand", "tendangnhap", "matkhau", "hoten", "sodu", "ngaytaotaikhoan",
        "email", "sodienthoai", "diachi", "vaitro", "trangthai", "landangnhapcuoi",
    },
    "sanpham": {
        "masp", "madm", "tensp", "mota", "giaban", "giagoc", "tonkho", "hinhanh",
        "thuonghieu", "danhgiatrungbinh", "soluotxem", "soluotmua", "trangthai",
        "ngaytao", "anhchitiet",
    },
    "donhang": {
        "madh", "mand", "tongtien", "diachigiao", "ghichu", "trangthai",
        "phuongthuc", "ngaydat", "ngaycapnhat",
    },
    "giohang": {"mand", "masp", "soluong", "ngaythem"},
    "chitietdonhang": {"madh", "masp", "soluong", "giaban"},
    "lichsugiaodich": {"magd", "mand", "loaigiaodich", "sotien", "mota", "ngaygd"},
    "danhmuc": {"madm", "tendm", "slug"},
    "danhgia": {"madg", "mand", "masp", "diem", "noidung", "ngaydanhgia"},
    "voucher": {
        "mavoucher", "loaigiam", "giatri", "giamtoida", "dontoithieu", "soluong",
        "dasudung", "ngaybatdau", "ngayhethan", "trangthai",
    },
}
OPTIONAL_MANAGED_TABLES = {
    "schemamigration": {"version", "description", "appliedat"},
    "phiendangnhap": {
        "maphien", "mand", "tokenhash", "ngaytao", "hethan", "lanhoatdongcuoi",
        "diachiip", "useragent", "dathuhoi",
    },
    "yeucaunaptien": {
        "mayeucau", "mand", "sotien", "mathamchieu", "trangthai", "ngaytao",
        "ngayxuly", "maadminxuly", "ghichuadmin",
    },
    "nhatkyquantri": {
        "manhatky", "mand", "hanhdong", "doituong", "madoituong", "chitiet",
        "diachiip", "ngaytao",
    },
    "datlaimatkhau": {
        "mayeucau", "mand", "tokenhash", "ngaytao", "hethan", "dasudung", "diachiip",
    },
    "yeuthich": {"mand", "masp", "ngaythem"},
    "sudungvoucher": {"mand", "mavoucher", "madh", "ngaysudung"},
    "baiviet": {
        "mabv", "loai", "tieude", "tomtat", "noidung", "hinhanh", "nguonurl",
        "trangthai", "ngaydang", "ngaycapnhat",
    },
    "pheduyetthaydoi": {
        "mathaydoi", "manhatky", "maadmin", "hanhdong", "doituong",
        "madoituong", "dulieutruoc", "dulieusau", "trangthai",
        "masuperadmin", "ghichu", "ngaytao", "ngayxuly",
    },
    "yeucauhotro": {
        "mayeucau", "hoten", "email", "sodienthoai", "chude",
        "madonhang", "kenhphanhoi", "noidung", "trangthai",
        "ghichuadmin", "maadminxuly", "diachiip", "useragent",
        "ngaytao", "ngaycapnhat",
    },
}


@dataclass(frozen=True)
class Operation:
    key: str
    description: str
    sql: str


def db_config() -> dict:
    """Đọc cấu hình kết nối từ biến môi trường, không chứa fallback bí mật."""
    try:
        port = int(os.getenv("DB_PORT", "3306"))
    except ValueError as exc:
        raise ValueError("DB_PORT phải là một số nguyên.") from exc
    return {
        "host": os.getenv("DB_HOST", "127.0.0.1"),
        "port": port,
        "user": os.getenv("DB_USER", "shop_app"),
        "password": os.getenv("DB_PASSWORD", ""),
        "database": os.getenv("DB_NAME", "shop_caulong"),
        "charset": "utf8mb4",
        "use_unicode": True,
        "autocommit": True,
    }


def identifier(name: str) -> str:
    """Quote một identifier nội bộ đã kiểm tra để tránh SQL injection."""
    if not re.fullmatch(r"[A-Za-z0-9_]+", name):
        raise ValueError(f"Identifier không hợp lệ: {name!r}")
    return f"`{name}`"


def read_schema(
    cursor, database: str
) -> tuple[dict[str, set[str]], dict[str, set[str]], dict[str, str]]:
    cursor.execute(
        """
        SELECT TABLE_NAME, COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = %s
        """,
        (database,),
    )
    tables: dict[str, set[str]] = {}
    actual_table_names: dict[str, str] = {}
    for table_name, column_name in cursor.fetchall():
        normalized_table = str(table_name).lower()
        tables.setdefault(normalized_table, set()).add(str(column_name).lower())
        actual_table_names.setdefault(normalized_table, str(table_name))

    cursor.execute(
        """
        SELECT TABLE_NAME, INDEX_NAME
        FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = %s
        """,
        (database,),
    )
    indexes: dict[str, set[str]] = {}
    for table_name, index_name in cursor.fetchall():
        indexes.setdefault(str(table_name).lower(), set()).add(str(index_name).lower())
    return tables, indexes, actual_table_names


def integer_column_type(cursor, database: str, table: str, column: str) -> str:
    cursor.execute(
        """
        SELECT COLUMN_TYPE
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = %s
          AND LOWER(TABLE_NAME) = LOWER(%s)
          AND LOWER(COLUMN_NAME) = LOWER(%s)
        LIMIT 1
        """,
        (database, table, column),
    )
    row = cursor.fetchone()
    if not row:
        raise RuntimeError(f"Không tìm thấy cột {table}.{column}.")
    column_type = str(row[0]).lower()
    # Chỉ đưa kiểu số nguyên do INFORMATION_SCHEMA trả về vào DDL động.
    if not re.fullmatch(r"(?:tinyint|smallint|mediumint|int|bigint)(?:\(\d+\))?(?: unsigned)?", column_type):
        raise RuntimeError(f"Kiểu {table}.{column} không được hỗ trợ: {column_type}")
    return column_type


def validate_base_schema(tables: dict[str, set[str]]) -> None:
    problems = []
    for table, required_columns in BASE_TABLES.items():
        if table not in tables:
            problems.append(f"thiếu bảng {table}")
            continue
        missing = sorted(required_columns - tables[table])
        if missing:
            problems.append(f"bảng {table} thiếu cột {', '.join(missing)}")
    for table, required_columns in OPTIONAL_MANAGED_TABLES.items():
        if table not in tables:
            continue
        missing = sorted(required_columns - tables[table])
        if missing:
            problems.append(
                f"bảng quản lý {table} đã tồn tại nhưng thiếu cột {', '.join(missing)}"
            )
    if problems:
        raise RuntimeError("Schema nền chưa tương thích: " + "; ".join(problems))


def add_column_if_missing(
    operations: list[Operation],
    tables: dict[str, set[str]],
    table: str,
    column: str,
    definition: str,
) -> None:
    if column.lower() in tables.get(table.lower(), set()):
        return
    operations.append(
        Operation(
            f"column:{table}.{column}",
            f"Thêm cột {table}.{column}",
            f"ALTER TABLE {identifier(table)} ADD COLUMN {identifier(column)} {definition}",
        )
    )


def add_index_if_missing(
    operations: list[Operation],
    indexes: dict[str, set[str]],
    table: str,
    index_name: str,
    columns_sql: str,
    *,
    unique: bool = False,
) -> None:
    if index_name.lower() in indexes.get(table.lower(), set()):
        return
    operations.append(
        Operation(
            f"index:{table}.{index_name}",
            f"Thêm chỉ mục {index_name} trên {table}",
            f"CREATE {'UNIQUE ' if unique else ''}INDEX {identifier(index_name)} "
            f"ON {identifier(table)} ({columns_sql})",
        )
    )


def build_plan(cursor, database: str) -> list[Operation]:
    tables, indexes, actual_table_names = read_schema(cursor, database)
    validate_base_schema(tables)
    user_id_type = integer_column_type(cursor, database, "nguoidung", "mand")
    product_id_type = integer_column_type(cursor, database, "sanpham", "masp")
    order_id_type = integer_column_type(cursor, database, "donhang", "madh")
    operations: list[Operation] = []

    def actual(name: str) -> str:
        """Giữ đúng chữ hoa/thường của bảng trên máy chủ Linux."""
        return actual_table_names.get(name.lower(), name.lower())

    user_table_sql = identifier(actual("NguoiDung"))
    migration_table_sql = identifier(actual("SchemaMigration"))

    add_column_if_missing(
        operations,
        tables,
        actual("NguoiDung"),
        "SoLanDangNhapSai",
        "INT UNSIGNED NOT NULL DEFAULT 0",
    )
    add_column_if_missing(operations, tables, actual("NguoiDung"), "KhoaDen", "DATETIME NULL")
    add_column_if_missing(
        operations,
        tables,
        actual("NguoiDung"),
        "NgayCapNhat",
        "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP",
    )
    add_column_if_missing(
        operations, tables, actual("NguoiDung"), "Avatar", "VARCHAR(500) NULL"
    )
    add_column_if_missing(
        operations,
        tables,
        actual("SanPham"),
        "NgayCapNhat",
        "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP",
    )
    add_column_if_missing(
        operations, tables, actual("SanPham"), "NguonURL", "VARCHAR(700) NULL"
    )
    add_column_if_missing(
        operations, tables, actual("SanPham"), "NguonTen", "VARCHAR(120) NULL"
    )

    if "schemamigration" not in tables:
        operations.append(
            Operation(
                "table:SchemaMigration",
                "Tạo bảng theo dõi phiên bản schema",
                """
                CREATE TABLE `schemamigration` (
                    `Version` VARCHAR(80) NOT NULL,
                    `Description` VARCHAR(255) NOT NULL,
                    `AppliedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (`Version`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """,
            )
        )

    if "phiendangnhap" not in tables:
        operations.append(
            Operation(
                "table:PhienDangNhap",
                "Tạo bảng phiên đăng nhập dạng token hash",
                f"""
                CREATE TABLE `phiendangnhap` (
                    `MaPhien` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                    `MaND` {user_id_type} NOT NULL,
                    `TokenHash` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
                    `NgayTao` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    `HetHan` DATETIME NOT NULL,
                    `LanHoatDongCuoi` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    `DiaChiIP` VARCHAR(45) NULL,
                    `UserAgent` VARCHAR(255) NULL,
                    `DaThuHoi` TINYINT(1) NOT NULL DEFAULT 0,
                    PRIMARY KEY (`MaPhien`),
                    UNIQUE KEY `uq_phien_token_hash` (`TokenHash`),
                    KEY `idx_phien_user_active` (`MaND`, `DaThuHoi`, `HetHan`),
                    KEY `idx_phien_expiry` (`HetHan`),
                    CONSTRAINT `fk_phien_nguoidung`
                        FOREIGN KEY (`MaND`) REFERENCES {user_table_sql} (`MaND`) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """,
            )
        )
    else:
        add_index_if_missing(
            operations, indexes, actual("PhienDangNhap"), "uq_phien_token_hash", "`TokenHash`", unique=True
        )
        add_index_if_missing(
            operations,
            indexes,
            actual("PhienDangNhap"),
            "idx_phien_user_active",
            "`MaND`, `DaThuHoi`, `HetHan`",
        )
        add_index_if_missing(
            operations, indexes, actual("PhienDangNhap"), "idx_phien_expiry", "`HetHan`"
        )

    if "yeucaunaptien" not in tables:
        operations.append(
            Operation(
                "table:YeuCauNapTien",
                "Tạo bảng yêu cầu nạp tiền cần admin đối soát",
                f"""
                CREATE TABLE `yeucaunaptien` (
                    `MaYeuCau` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                    `MaND` {user_id_type} NOT NULL,
                    `SoTien` DECIMAL(15,2) NOT NULL,
                    `MaThamChieu` VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
                    `TrangThai` ENUM('CHO_DUYET','DA_DUYET','TU_CHOI') NOT NULL DEFAULT 'CHO_DUYET',
                    `NgayTao` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    `NgayXuLy` DATETIME NULL,
                    `MaAdminXuLy` {user_id_type} NULL,
                    `GhiChuAdmin` VARCHAR(500) NULL,
                    PRIMARY KEY (`MaYeuCau`),
                    UNIQUE KEY `uq_naptien_thamchieu` (`MaThamChieu`),
                    KEY `idx_naptien_user_date` (`MaND`, `NgayTao`),
                    KEY `idx_naptien_status_date` (`TrangThai`, `NgayTao`),
                    KEY `idx_naptien_admin` (`MaAdminXuLy`),
                    CONSTRAINT `fk_naptien_nguoidung`
                        FOREIGN KEY (`MaND`) REFERENCES {user_table_sql} (`MaND`) ON DELETE RESTRICT,
                    CONSTRAINT `fk_naptien_admin`
                        FOREIGN KEY (`MaAdminXuLy`) REFERENCES {user_table_sql} (`MaND`) ON DELETE SET NULL,
                    CONSTRAINT `chk_naptien_sotien` CHECK (`SoTien` > 0)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """,
            )
        )
    else:
        add_index_if_missing(
            operations,
            indexes,
            actual("YeuCauNapTien"),
            "uq_naptien_thamchieu",
            "`MaThamChieu`",
            unique=True,
        )
        add_index_if_missing(
            operations,
            indexes,
            actual("YeuCauNapTien"),
            "idx_naptien_user_date",
            "`MaND`, `NgayTao`",
        )
        add_index_if_missing(
            operations,
            indexes,
            actual("YeuCauNapTien"),
            "idx_naptien_status_date",
            "`TrangThai`, `NgayTao`",
        )
        add_index_if_missing(
            operations, indexes, actual("YeuCauNapTien"), "idx_naptien_admin", "`MaAdminXuLy`"
        )

    if "nhatkyquantri" not in tables:
        operations.append(
            Operation(
                "table:NhatKyQuanTri",
                "Tạo bảng nhật ký thao tác quản trị",
                f"""
                CREATE TABLE `nhatkyquantri` (
                    `MaNhatKy` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                    `MaND` {user_id_type} NOT NULL,
                    `HanhDong` VARCHAR(80) NOT NULL,
                    `DoiTuong` VARCHAR(50) NOT NULL,
                    `MaDoiTuong` VARCHAR(64) NULL,
                    `ChiTiet` JSON NULL,
                    `DiaChiIP` VARCHAR(45) NULL,
                    `NgayTao` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (`MaNhatKy`),
                    KEY `idx_nhatky_admin_date` (`MaND`, `NgayTao`),
                    KEY `idx_nhatky_entity` (`DoiTuong`, `MaDoiTuong`),
                    KEY `idx_nhatky_date` (`NgayTao`),
                    CONSTRAINT `fk_nhatky_nguoidung`
                        FOREIGN KEY (`MaND`) REFERENCES {user_table_sql} (`MaND`) ON DELETE RESTRICT
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """,
            )
        )
    else:
        add_index_if_missing(
            operations,
            indexes,
            actual("NhatKyQuanTri"),
            "idx_nhatky_admin_date",
            "`MaND`, `NgayTao`",
        )
        add_index_if_missing(
            operations,
            indexes,
            actual("NhatKyQuanTri"),
            "idx_nhatky_entity",
            "`DoiTuong`, `MaDoiTuong`",
        )
        add_index_if_missing(
            operations, indexes, actual("NhatKyQuanTri"), "idx_nhatky_date", "`NgayTao`"
        )

    if "datlaimatkhau" not in tables:
        operations.append(
            Operation(
                "table:datlaimatkhau",
                "Tạo bảng token đặt lại mật khẩu một lần",
                f"""
                CREATE TABLE `datlaimatkhau` (
                    `MaYeuCau` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                    `MaND` {user_id_type} NOT NULL,
                    `TokenHash` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
                    `NgayTao` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    `HetHan` DATETIME NOT NULL,
                    `DaSuDung` TINYINT(1) NOT NULL DEFAULT 0,
                    `DiaChiIP` VARCHAR(45) NULL,
                    PRIMARY KEY (`MaYeuCau`),
                    UNIQUE KEY `uq_reset_token_hash` (`TokenHash`),
                    KEY `idx_reset_user_active` (`MaND`, `DaSuDung`, `HetHan`),
                    KEY `idx_reset_expiry` (`HetHan`),
                    CONSTRAINT `fk_reset_nguoidung`
                        FOREIGN KEY (`MaND`) REFERENCES {user_table_sql} (`MaND`) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """,
            )
        )
    else:
        add_index_if_missing(
            operations, indexes, actual("datlaimatkhau"),
            "uq_reset_token_hash", "`TokenHash`", unique=True,
        )
        add_index_if_missing(
            operations, indexes, actual("datlaimatkhau"),
            "idx_reset_user_active", "`MaND`, `DaSuDung`, `HetHan`",
        )
        add_index_if_missing(
            operations, indexes, actual("datlaimatkhau"),
            "idx_reset_expiry", "`HetHan`",
        )

    if "yeuthich" not in tables:
        operations.append(
            Operation(
                "table:yeuthich",
                "Tạo danh sách sản phẩm yêu thích",
                f"""
                CREATE TABLE `yeuthich` (
                    `MaND` {user_id_type} NOT NULL,
                    `MaSP` {product_id_type} NOT NULL,
                    `NgayThem` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (`MaND`, `MaSP`),
                    KEY `idx_yeuthich_product` (`MaSP`),
                    KEY `idx_yeuthich_user_date` (`MaND`, `NgayThem`),
                    CONSTRAINT `fk_yeuthich_nguoidung`
                        FOREIGN KEY (`MaND`) REFERENCES {user_table_sql} (`MaND`) ON DELETE CASCADE,
                    CONSTRAINT `fk_yeuthich_sanpham`
                        FOREIGN KEY (`MaSP`) REFERENCES {identifier(actual('SanPham'))} (`MaSP`) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """,
            )
        )

    if "sudungvoucher" not in tables:
        operations.append(
            Operation(
                "table:sudungvoucher",
                "Giới hạn mỗi voucher một lần cho mỗi tài khoản",
                f"""
                CREATE TABLE `sudungvoucher` (
                    `MaND` {user_id_type} NOT NULL,
                    `MaVoucher` VARCHAR(20) NOT NULL,
                    `MaDH` {order_id_type} NULL,
                    `NgaySuDung` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (`MaND`, `MaVoucher`),
                    KEY `idx_sudungvoucher_order` (`MaDH`),
                    CONSTRAINT `fk_sudungvoucher_nguoidung`
                        FOREIGN KEY (`MaND`) REFERENCES {user_table_sql} (`MaND`) ON DELETE CASCADE,
                    CONSTRAINT `fk_sudungvoucher_donhang`
                        FOREIGN KEY (`MaDH`) REFERENCES {identifier(actual('DonHang'))} (`MaDH`) ON DELETE SET NULL
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """,
            )
        )

    if "baiviet" not in tables:
        operations.append(
            Operation(
                "table:baiviet",
                "Tạo bảng tin tức và hướng dẫn",
                """
                CREATE TABLE `baiviet` (
                    `MaBV` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                    `Loai` ENUM('TIN_TUC','HUONG_DAN') NOT NULL,
                    `TieuDe` VARCHAR(220) NOT NULL,
                    `TomTat` VARCHAR(500) NULL,
                    `NoiDung` LONGTEXT NOT NULL,
                    `HinhAnh` VARCHAR(500) NULL,
                    `NguonURL` VARCHAR(700) NULL,
                    `TrangThai` TINYINT(1) NOT NULL DEFAULT 1,
                    `NgayDang` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    `NgayCapNhat` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    PRIMARY KEY (`MaBV`),
                    KEY `idx_baiviet_type_status_date` (`Loai`, `TrangThai`, `NgayDang`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """,
            )
        )
    else:
        # Một số database được import từ bản cũ đã có bảng BaiViet nhưng thiếu
        # các trường mà API nội dung hiện đại sử dụng. Bổ sung từng cột theo
        # kiểu additive để không xóa bài viết hiện có.
        for column, definition in (
            ("Loai", "ENUM('TIN_TUC','HUONG_DAN') NOT NULL DEFAULT 'TIN_TUC'"),
            ("TieuDe", "VARCHAR(220) NOT NULL DEFAULT 'Nội dung chưa đặt tên'"),
            ("TomTat", "VARCHAR(500) NULL"),
            ("NoiDung", "LONGTEXT NULL"),
            ("HinhAnh", "VARCHAR(500) NULL"),
            ("NguonURL", "VARCHAR(700) NULL"),
            ("TrangThai", "TINYINT(1) NOT NULL DEFAULT 1"),
            ("NgayDang", "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP"),
            ("NgayCapNhat", "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"),
        ):
            add_column_if_missing(operations, tables, actual("BaiViet"), column, definition)
        add_index_if_missing(
            operations, indexes, actual("BaiViet"),
            "idx_baiviet_type_status_date", "`Loai`, `TrangThai`, `NgayDang`",
        )

    if "pheduyetthaydoi" not in tables:
        operations.append(
            Operation(
                "table:pheduyetthaydoi",
                "Tạo bảng giám sát và hoàn tác thay đổi quản trị",
                f"""
                CREATE TABLE `pheduyetthaydoi` (
                    `MaThayDoi` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                    `MaNhatKy` BIGINT UNSIGNED NULL,
                    `MaAdmin` {user_id_type} NOT NULL,
                    `HanhDong` VARCHAR(80) NOT NULL,
                    `DoiTuong` VARCHAR(50) NOT NULL,
                    `MaDoiTuong` VARCHAR(64) NULL,
                    `DuLieuTruoc` JSON NULL,
                    `DuLieuSau` JSON NULL,
                    `TrangThai` ENUM('CHO_XEM','DA_XAC_NHAN','DA_HOAN_TAC') NOT NULL DEFAULT 'CHO_XEM',
                    `MaSuperAdmin` {user_id_type} NULL,
                    `GhiChu` VARCHAR(500) NULL,
                    `NgayTao` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    `NgayXuLy` DATETIME NULL,
                    PRIMARY KEY (`MaThayDoi`),
                    KEY `idx_pheduyet_status_date` (`TrangThai`, `NgayTao`),
                    KEY `idx_pheduyet_admin_date` (`MaAdmin`, `NgayTao`),
                    KEY `idx_pheduyet_nhatky` (`MaNhatKy`),
                    CONSTRAINT `fk_pheduyet_admin`
                        FOREIGN KEY (`MaAdmin`) REFERENCES {user_table_sql} (`MaND`) ON DELETE RESTRICT,
                    CONSTRAINT `fk_pheduyet_super`
                        FOREIGN KEY (`MaSuperAdmin`) REFERENCES {user_table_sql} (`MaND`) ON DELETE RESTRICT
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """,
            )
        )
    else:
        add_index_if_missing(
            operations, indexes, actual("PheDuyetThayDoi"),
            "idx_pheduyet_status_date", "`TrangThai`, `NgayTao`",
        )
        add_index_if_missing(
            operations, indexes, actual("PheDuyetThayDoi"),
            "idx_pheduyet_admin_date", "`MaAdmin`, `NgayTao`",
        )
        add_index_if_missing(
            operations, indexes, actual("PheDuyetThayDoi"),
            "idx_pheduyet_nhatky", "`MaNhatKy`",
        )

    if "yeucauhotro" not in tables:
        operations.append(
            Operation(
                "table:yeucauhotro",
                "Tạo hộp thư tiếp nhận và xử lý yêu cầu khách hàng",
                f"""
                CREATE TABLE `yeucauhotro` (
                    `MaYeuCau` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                    `HoTen` VARCHAR(120) NOT NULL,
                    `Email` VARCHAR(150) NOT NULL,
                    `SoDienThoai` VARCHAR(20) NULL,
                    `ChuDe` ENUM('TU_VAN_SAN_PHAM','DON_HANG','THANH_TOAN','TAI_KHOAN','BAO_LOI','KHAC') NOT NULL,
                    `MaDonHang` VARCHAR(32) NULL,
                    `KenhPhanHoi` ENUM('EMAIL','DIEN_THOAI') NOT NULL DEFAULT 'EMAIL',
                    `NoiDung` TEXT NOT NULL,
                    `TrangThai` ENUM('MOI','DANG_XU_LY','DA_PHAN_HOI','DA_DONG') NOT NULL DEFAULT 'MOI',
                    `GhiChuAdmin` VARCHAR(1000) NULL,
                    `MaAdminXuLy` {user_id_type} NULL,
                    `DiaChiIP` VARCHAR(45) NULL,
                    `UserAgent` VARCHAR(255) NULL,
                    `NgayTao` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    `NgayCapNhat` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    PRIMARY KEY (`MaYeuCau`),
                    KEY `idx_hotro_status_date` (`TrangThai`, `NgayTao`),
                    KEY `idx_hotro_email_date` (`Email`, `NgayTao`),
                    CONSTRAINT `fk_hotro_admin`
                        FOREIGN KEY (`MaAdminXuLy`) REFERENCES {user_table_sql} (`MaND`) ON DELETE SET NULL
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """,
            )
        )
    else:
        # Database import từ bản thử nghiệm có thể đã có tên bảng nhưng thiếu
        # cột, khiến khách gửi liên hệ thất bại và admin không nhận được phiếu.
        for column, definition in (
            ("HoTen", "VARCHAR(120) NOT NULL DEFAULT 'Khách hàng'"),
            ("Email", "VARCHAR(150) NOT NULL DEFAULT 'unknown@example.invalid'"),
            ("SoDienThoai", "VARCHAR(20) NULL"),
            ("ChuDe", "ENUM('TU_VAN_SAN_PHAM','DON_HANG','THANH_TOAN','TAI_KHOAN','BAO_LOI','KHAC') NOT NULL DEFAULT 'KHAC'"),
            ("MaDonHang", "VARCHAR(32) NULL"),
            ("KenhPhanHoi", "ENUM('EMAIL','DIEN_THOAI') NOT NULL DEFAULT 'EMAIL'"),
            ("NoiDung", "TEXT NULL"),
            ("TrangThai", "ENUM('MOI','DANG_XU_LY','DA_PHAN_HOI','DA_DONG') NOT NULL DEFAULT 'MOI'"),
            ("GhiChuAdmin", "VARCHAR(1000) NULL"),
            ("MaAdminXuLy", f"{user_id_type} NULL"),
            ("DiaChiIP", "VARCHAR(45) NULL"),
            ("UserAgent", "VARCHAR(255) NULL"),
            ("NgayTao", "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP"),
            ("NgayCapNhat", "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"),
        ):
            add_column_if_missing(operations, tables, actual("YeuCauHoTro"), column, definition)
        add_index_if_missing(
            operations, indexes, actual("YeuCauHoTro"),
            "idx_hotro_status_date", "`TrangThai`, `NgayTao`",
        )
        add_index_if_missing(
            operations, indexes, actual("YeuCauHoTro"),
            "idx_hotro_email_date", "`Email`, `NgayTao`",
        )

    add_index_if_missing(
        operations,
        indexes,
        actual("DonHang"),
        "idx_donhang_user_date",
        "`MaND`, `NgayDat`",
    )
    add_index_if_missing(
        operations,
        indexes,
        actual("DonHang"),
        "idx_donhang_status_date",
        "`TrangThai`, `NgayDat`",
    )
    add_index_if_missing(
        operations,
        indexes,
        actual("SanPham"),
        "idx_sanpham_status_category",
        "`TrangThai`, `MaDM`",
    )
    add_index_if_missing(
        operations,
        indexes,
        actual("SanPham"),
        "idx_sanpham_status_created",
        "`TrangThai`, `NgayTao`",
    )
    add_index_if_missing(
        operations,
        indexes,
        actual("SanPham"),
        "idx_sanpham_catalog_price",
        "`TrangThai`, `MaDM`, `GiaBan`",
    )
    add_index_if_missing(
        operations,
        indexes,
        actual("SanPham"),
        "idx_sanpham_suggested",
        "`TrangThai`, `MaDM`, `NgayTao`",
    )
    add_index_if_missing(
        operations,
        indexes,
        actual("DanhGia"),
        "idx_danhgia_product_date",
        "`MaSP`, `NgayDanhGia`",
    )
    add_index_if_missing(
        operations,
        indexes,
        actual("NguoiDung"),
        "idx_nguoidung_role_created",
        "`VaiTro`, `NgayTaoTaiKhoan`",
    )
    add_index_if_missing(
        operations,
        indexes,
        actual("LichSuGiaoDich"),
        "idx_giaodich_user_date",
        "`MaND`, `NgayGD`",
    )

    if "schemamigration" in tables:
        cursor.execute(
            f"SELECT 1 FROM {migration_table_sql} "
            "WHERE `Version` = %s LIMIT 1",
            (MIGRATION_VERSION,),
        )
        version_recorded = cursor.fetchone() is not None
    else:
        version_recorded = False
    if not version_recorded:
        operations.append(
            Operation(
                f"version:{MIGRATION_VERSION}",
                f"Ghi nhận migration {MIGRATION_VERSION}",
                f"INSERT IGNORE INTO {migration_table_sql} (`Version`, `Description`) "
                f"VALUES ('{MIGRATION_VERSION}', 'Support inbox compatibility, contact UX va order contrast fixes')",
            )
        )
    return operations


def print_plan(operations: list[Operation], apply: bool) -> None:
    mode = "APPLY" if apply else "CHECK (không ghi dữ liệu)"
    print(f"Chế độ: {mode}")
    if not operations:
        print(f"Schema đã ở phiên bản {MIGRATION_VERSION}; không có thay đổi cần thực hiện.")
        return
    print(f"Có {len(operations)} thay đổi additive:")
    for number, operation in enumerate(operations, 1):
        print(f"  {number:02d}. {operation.description}")
    if not apply:
        print("Không có câu lệnh ghi nào được chạy. Dùng --apply sau khi đã sao lưu để áp dụng.")


def apply_plan(conn, cursor, database: str) -> None:
    cursor.execute("SELECT GET_LOCK(%s, 15)", (LOCK_NAME,))
    locked = cursor.fetchone()[0]
    if locked != 1:
        raise RuntimeError("Không lấy được khóa migration; có tiến trình khác đang nâng cấp schema.")
    try:
        # Đọc lại dưới khóa để tránh dùng kế hoạch đã cũ.
        operations = build_plan(cursor, database)
        print_plan(operations, apply=True)
        for operation in operations:
            print(f"Đang thực hiện: {operation.description} ...", end=" ", flush=True)
            cursor.execute(operation.sql)
            print("xong")
        # DDL MySQL tự commit; commit này dành cho INSERT ghi phiên bản.
        conn.commit()
        remaining = build_plan(cursor, database)
        if remaining:
            descriptions = ", ".join(item.description for item in remaining)
            raise RuntimeError(f"Migration chưa hoàn tất: {descriptions}")
        print(f"Hoàn tất migration {MIGRATION_VERSION}.")
    finally:
        cursor.execute("SELECT RELEASE_LOCK(%s)", (LOCK_NAME,))
        cursor.fetchone()


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Kiểm tra hoặc áp dụng migration additive cho Badminton Store."
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Thực thi thay đổi. Nếu bỏ qua, script chỉ kiểm tra và in kế hoạch.",
    )
    parser.add_argument(
        "--require-current",
        action="store_true",
        help="Thoát với mã lỗi nếu còn migration chưa áp dụng; phù hợp bước kiểm tra trước deploy.",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    config = db_config()
    conn = None
    cursor = None
    try:
        conn = mysql.connector.connect(**config)
        cursor = conn.cursor()
        plan = build_plan(cursor, config["database"])
        if args.apply and args.require_current:
            raise ValueError("Không dùng đồng thời --apply và --require-current.")
        if args.apply:
            print("Lưu ý: MySQL tự commit từng câu DDL. Script có thể chạy lại an toàn nếu bị gián đoạn.")
            apply_plan(conn, cursor, config["database"])
        else:
            print_plan(plan, apply=False)
            if args.require_current and plan:
                print(
                    "Database chưa ở schema hiện hành; hãy sao lưu rồi chạy migration với --apply.",
                    file=sys.stderr,
                )
                return 3
        return 0
    except (Error, RuntimeError, ValueError) as exc:
        print(f"Lỗi migration: {exc}", file=sys.stderr)
        return 1
    finally:
        if cursor is not None:
            cursor.close()
        if conn is not None and conn.is_connected():
            conn.close()


if __name__ == "__main__":
    raise SystemExit(main())
