"""Bổ sung đường dẫn ảnh đại diện cho tài khoản."""

from HA.app import get_db_connection


def main():
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='NguoiDung' AND COLUMN_NAME='Avatar'")
        if cursor.fetchone()[0] == 0:
            cursor.execute("ALTER TABLE NguoiDung ADD COLUMN Avatar VARCHAR(255) NULL AFTER DiaChi")
        conn.commit()
        print("Đã sẵn sàng cột Avatar.")
    finally:
        cursor.close()
        conn.close()


if __name__ == "__main__":
    main()
