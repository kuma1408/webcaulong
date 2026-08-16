"""Nâng cấp mật khẩu dạng plain text còn sót lại sang hash Werkzeug.

Tên file được giữ để không làm hỏng lệnh cũ. Mặc định script chỉ kiểm tra.
Mật khẩu SHA-256 legacy 64 ký tự được API nâng cấp lười khi người dùng đăng
nhập thành công, vì không thể chuyển hash đó mà không biết mật khẩu gốc.
"""

from __future__ import annotations

import argparse
import os
import re

import mysql.connector
from dotenv import load_dotenv
from werkzeug.security import generate_password_hash


load_dotenv()


def db_config() -> dict:
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


def is_plaintext(value: str) -> bool:
    if not value:
        return False
    if re.fullmatch(r"[0-9a-fA-F]{64}", value):
        return False
    known_hash_prefixes = (
        "scrypt:",
        "pbkdf2:",
        "pbkdf2_sha256$",
        "argon2:",
        "$argon2",
        "$2a$",
        "$2b$",
        "$2y$",
    )
    return not value.startswith(known_hash_prefixes)


def migrate(apply: bool = False) -> int:
    conn = mysql.connector.connect(**db_config())
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT MaND, MatKhau FROM NguoiDung")
        candidates = [row for row in cursor.fetchall() if is_plaintext(str(row.get("MatKhau") or ""))]
        if not candidates:
            print("Không có mật khẩu plain text cần nâng cấp.")
            return 0
        print(f"Phát hiện {len(candidates)} mật khẩu plain text.")
        if not apply:
            print("Không có dữ liệu bị thay đổi. Dùng --apply sau khi đã sao lưu để nâng cấp.")
            return 0
        updated = 0
        for user in candidates:
            cursor.execute(
                "UPDATE NguoiDung SET MatKhau = %s WHERE MaND = %s AND MatKhau = %s",
                (
                    generate_password_hash(str(user["MatKhau"])),
                    user["MaND"],
                    user["MatKhau"],
                ),
            )
            updated += cursor.rowcount
        conn.commit()
        print(f"Đã nâng cấp {updated} mật khẩu.")
        return 0
    except Exception:
        conn.rollback()
        raise
    finally:
        cursor.close()
        conn.close()


def main() -> int:
    parser = argparse.ArgumentParser(description="Kiểm tra/nâng cấp mật khẩu plain text.")
    parser.add_argument("--apply", action="store_true", help="Cho phép ghi hash mới vào database.")
    args = parser.parse_args()
    return migrate(args.apply)


if __name__ == "__main__":
    raise SystemExit(main())
