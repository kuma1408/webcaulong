"""Bổ sung vai trò superadmin và chọn admin đầu tiên làm chủ hệ thống."""

from HA.app import get_db_connection


def main():
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            "ALTER TABLE NguoiDung MODIFY VaiTro "
            "ENUM('user','admin','superadmin') NOT NULL DEFAULT 'user'"
        )
        cursor.execute("SELECT MaND FROM NguoiDung WHERE VaiTro = 'superadmin' LIMIT 1")
        if not cursor.fetchone():
            cursor.execute(
                "SELECT MaND, TenDangNhap FROM NguoiDung "
                "WHERE VaiTro = 'admin' AND TrangThai = 1 ORDER BY MaND LIMIT 1"
            )
            owner = cursor.fetchone()
            if not owner:
                raise RuntimeError("Không có admin hoạt động để chọn làm superadmin.")
            cursor.execute("UPDATE NguoiDung SET VaiTro = 'superadmin' WHERE MaND = %s", (owner["MaND"],))
            print(f"Đã đặt @{owner['TenDangNhap']} làm quản trị viên cấp cao.")
        else:
            print("Cơ sở dữ liệu đã có quản trị viên cấp cao.")
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        cursor.close()
        conn.close()


if __name__ == "__main__":
    main()
