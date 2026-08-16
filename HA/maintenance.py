"""Bảo trì dữ liệu ngắn hạn, phù hợp Scheduled tasks của Alwaysdata.

Mặc định chỉ thống kê. Truyền ``--apply`` để xóa phiên/token đã vô hiệu ít nhất
7 ngày; dữ liệu người dùng, đơn hàng, giao dịch và nhật ký không bị đụng tới.
"""

from __future__ import annotations

import argparse
import sys

from mysql.connector import Error

from HA.app import get_db_connection


QUERIES = (
    (
        "phiên đăng nhập hết hạn/đã thu hồi",
        "PhienDangNhap",
        "(HetHan < NOW() - INTERVAL 7 DAY) OR "
        "(DaThuHoi = 1 AND LanHoatDongCuoi < NOW() - INTERVAL 7 DAY)",
    ),
    (
        "token đặt lại mật khẩu hết hạn/đã dùng",
        "DatLaiMatKhau",
        "(HetHan < NOW() - INTERVAL 7 DAY) OR "
        "(DaSuDung = 1 AND NgayTao < NOW() - INTERVAL 7 DAY)",
    ),
)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Bảo trì dữ liệu tạm của Badminton Store.")
    parser.add_argument("--apply", action="store_true", help="Thực hiện xóa dữ liệu tạm cũ.")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    connection = None
    cursor = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor()
        total = 0
        for label, table, condition in QUERIES:
            cursor.execute(f"SELECT COUNT(*) FROM {table} WHERE {condition}")
            count = int(cursor.fetchone()[0])
            total += count
            print(f"{label}: {count}")
            if args.apply and count:
                cursor.execute(f"DELETE FROM {table} WHERE {condition}")
        if args.apply:
            connection.commit()
            print(f"Đã dọn {total} bản ghi tạm cũ.")
        else:
            print("Chế độ kiểm tra; dùng --apply để thực hiện.")
        return 0
    except Error as exc:
        if connection is not None:
            connection.rollback()
        print(f"Bảo trì thất bại: {exc}", file=sys.stderr)
        return 1
    finally:
        if cursor is not None:
            cursor.close()
        if connection is not None and connection.is_connected():
            connection.close()


if __name__ == "__main__":
    raise SystemExit(main())
