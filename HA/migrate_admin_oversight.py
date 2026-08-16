"""Bổ sung hộp phê duyệt và khả năng hoàn tác thao tác của admin thường."""

from HA.app import get_db_connection


def main():
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS PheDuyetThayDoi (
                MaThayDoi BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                MaNhatKy BIGINT UNSIGNED NULL,
                MaAdmin INT NOT NULL,
                HanhDong VARCHAR(80) NOT NULL,
                DoiTuong VARCHAR(50) NOT NULL,
                MaDoiTuong VARCHAR(64) NULL,
                DuLieuTruoc JSON NULL,
                DuLieuSau JSON NULL,
                TrangThai ENUM('CHO_XEM','DA_XAC_NHAN','DA_HOAN_TAC') NOT NULL DEFAULT 'CHO_XEM',
                MaSuperAdmin INT NULL,
                GhiChu VARCHAR(500) NULL,
                NgayTao DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                NgayXuLy DATETIME NULL,
                PRIMARY KEY (MaThayDoi),
                KEY idx_pheduyet_status_date (TrangThai, NgayTao),
                KEY idx_pheduyet_admin_date (MaAdmin, NgayTao),
                KEY idx_pheduyet_nhatky (MaNhatKy),
                CONSTRAINT fk_pheduyet_admin FOREIGN KEY (MaAdmin) REFERENCES NguoiDung(MaND) ON DELETE RESTRICT,
                CONSTRAINT fk_pheduyet_super FOREIGN KEY (MaSuperAdmin) REFERENCES NguoiDung(MaND) ON DELETE RESTRICT
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """
        )
        cursor.execute(
            "SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='PheDuyetThayDoi' AND COLUMN_NAME='MaNhatKy'"
        )
        if cursor.fetchone()[0] == 0:
            cursor.execute("ALTER TABLE PheDuyetThayDoi ADD COLUMN MaNhatKy BIGINT UNSIGNED NULL AFTER MaThayDoi, ADD KEY idx_pheduyet_nhatky (MaNhatKy)")
        cursor.execute(
            """
            UPDATE PheDuyetThayDoi p
            JOIN NhatKyQuanTri nk
              ON nk.MaND=p.MaAdmin AND nk.HanhDong=p.HanhDong
             AND nk.DoiTuong=p.DoiTuong
             AND COALESCE(nk.MaDoiTuong,'')=COALESCE(p.MaDoiTuong,'')
             AND ABS(TIMESTAMPDIFF(SECOND,nk.NgayTao,p.NgayTao))<=3
            SET p.MaNhatKy=nk.MaNhatKy
            WHERE p.MaNhatKy IS NULL
            """
        )
        conn.commit()
        print("Đã sẵn sàng bảng PheDuyetThayDoi.")
    finally:
        cursor.close()
        conn.close()


if __name__ == "__main__":
    main()
