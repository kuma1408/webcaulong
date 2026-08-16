"""Tạo kho nội dung và metadata nguồn sản phẩm, có thể chạy lặp lại an toàn."""

from HA.app import get_db_connection


NEWS = [
    ("TIN_TUC", "Vợt cầu lông 6U là gì?", "Tìm hiểu ưu nhược điểm của vợt siêu nhẹ 6U và nhóm người chơi phù hợp.", "Vợt 6U có trọng lượng nhẹ, linh hoạt khi phòng thủ và phản tạt. Người chơi nên cân nhắc độ cứng thân vợt, mức căng cước và kỹ thuật cá nhân trước khi lựa chọn.", "HA/ảnh tin tức/vot6u.png"),
    ("TIN_TUC", "Kinh nghiệm chọn sân cầu lông chất lượng", "Các tiêu chí đánh giá mặt sân, ánh sáng, độ cao trần và tiện ích.", "Một sân cầu lông tốt cần mặt thảm có độ bám phù hợp, ánh sáng không gây chói, trần đủ cao, thông gió tốt và có khu vực nghỉ. Nên kiểm tra giờ đông khách và chính sách đặt sân trước khi đăng ký dài hạn.", "HA/ảnh tin tức/tin2.png"),
    ("TIN_TUC", "Cách nhận biết vợt cầu lông chính hãng", "Kiểm tra mã sản phẩm, tem, nước sơn và chính sách bảo hành.", "Người mua nên đối chiếu mã sản phẩm, tem phân phối, chất lượng hoàn thiện và phiếu bảo hành. Không nên chỉ dựa vào mức giá; hãy mua tại đơn vị có thông tin liên hệ và chính sách đổi trả rõ ràng.", "HA/ảnh tin tức/tin3.png"),
    ("TIN_TUC", "Chọn vợt thiên công trong tầm giá phổ thông", "Gợi ý các thông số cần xem khi chọn vợt thiên công.", "Vợt thiên công thường có điểm cân bằng nặng đầu và thân từ trung bình đến cứng. Người mới nên ưu tiên trọng lượng 4U, mức căng vừa phải để giữ khả năng kiểm soát và hạn chế chấn thương.", "HA/ảnh tin tức/tin4.png"),
    ("TIN_TUC", "Bảo quản vợt và cước sau khi chơi", "Những thói quen giúp vợt, cước và quấn cán bền hơn.", "Sau buổi chơi cần lau khô mồ hôi, tránh để vợt trong cốp xe nóng và kiểm tra các điểm nứt bất thường. Cước bị xô nhiều hoặc giảm lực rõ rệt nên được thay để bảo vệ khung.", "HA/ảnh tin tức/tin5.png"),
    ("TIN_TUC", "Chuẩn bị trang bị cho người mới chơi", "Danh sách trang bị cơ bản, ưu tiên an toàn và vừa ngân sách.", "Người mới cần một cây vợt dễ thuần, giày có độ bám và giảm chấn, quấn cán vừa tay cùng trang phục thoáng. Không nhất thiết mua sản phẩm đắt nhất; độ phù hợp quan trọng hơn thông số cao.", "HA/ảnh tin tức/tin6.png"),
    ("HUONG_DAN", "Hướng dẫn mua hàng và thanh toán", "Quy trình đặt hàng, xác nhận, thanh toán và nhận sản phẩm.", "Chọn sản phẩm và cấu hình phù hợp, thêm vào giỏ hàng rồi kiểm tra số lượng. Điền địa chỉ giao hàng, chọn phương thức thanh toán và xác nhận đơn. Với sản phẩm cần gia công như căng cước, cửa hàng có thể liên hệ xác nhận trước khi xử lý. Luôn kiểm tra thông tin đơn và sản phẩm khi nhận hàng.", None),
    ("HUONG_DAN", "Hướng dẫn chọn vợt theo lối chơi", "Chọn độ cứng, điểm cân bằng và trọng lượng phù hợp.", "Người thiên công có thể chọn vợt hơi nặng đầu; người chơi phản tạt ưu tiên cân bằng hoặc nhẹ đầu. Trọng lượng 4U phù hợp với phần lớn người chơi phong trào. Người mới nên chọn thân dẻo hoặc trung bình và căng cước ở mức an toàn do nhà sản xuất khuyến nghị.", None),
]


def main():
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SHOW COLUMNS FROM SanPham")
        columns = {row["Field"].lower() for row in cursor.fetchall()}
        if "nguonurl" not in columns:
            cursor.execute("ALTER TABLE SanPham ADD COLUMN NguonURL VARCHAR(700) NULL")
        if "nguonten" not in columns:
            cursor.execute("ALTER TABLE SanPham ADD COLUMN NguonTen VARCHAR(120) NULL")
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS BaiViet (
                MaBV BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                Loai ENUM('TIN_TUC','HUONG_DAN') NOT NULL,
                TieuDe VARCHAR(220) NOT NULL,
                TomTat VARCHAR(500) NULL,
                NoiDung LONGTEXT NOT NULL,
                HinhAnh VARCHAR(500) NULL,
                NguonURL VARCHAR(700) NULL,
                TrangThai TINYINT(1) NOT NULL DEFAULT 1,
                NgayDang DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                NgayCapNhat DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (MaBV),
                KEY idx_baiviet_loai_status_date (Loai, TrangThai, NgayDang)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """
        )
        for kind, title, summary, content, image in NEWS:
            cursor.execute("SELECT MaBV FROM BaiViet WHERE TieuDe = %s LIMIT 1", (title,))
            if not cursor.fetchone():
                cursor.execute(
                    "INSERT INTO BaiViet (Loai,TieuDe,TomTat,NoiDung,HinhAnh) VALUES (%s,%s,%s,%s,%s)",
                    (kind, title, summary, content, image),
                )
        conn.commit()
        print("Đã tạo kho Tin tức/Hướng dẫn và metadata nguồn sản phẩm.")
    except Exception:
        conn.rollback()
        raise
    finally:
        cursor.close()
        conn.close()


if __name__ == "__main__":
    main()
