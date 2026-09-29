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
    ("TIN_TUC", "Chọn giày cầu lông: vừa chân quan trọng hơn mẫu mã", "Các điểm cần thử để giày ôm chân, bám sân và ổn định khi đổi hướng.", "Khi thử giày, hãy mang đúng loại tất thường dùng và thử cả hai chân vào cuối ngày nếu có thể. Gót cần được giữ chắc, mũi chân có khoảng trống nhỏ để không chạm mạnh khi dừng đột ngột, phần ngang không ép gây tê. Thử bước ngang, nhún và đổi hướng trên bề mặt an toàn. Đế giày cầu lông dành cho sân trong không nên mang ra đường thường xuyên vì bụi bẩn làm giảm độ bám. Không có một cỡ giày chung cho mọi hãng; hãy đối chiếu bảng cỡ của đúng mẫu và chính sách đổi cỡ trước khi đặt.", None),
    ("TIN_TUC", "Khởi động trước khi vào sân trong 8–10 phút", "Một trình tự nhẹ nhàng giúp cơ thể sẵn sàng trước buổi cầu lông.", "Bắt đầu bằng vài phút đi bộ nhanh hoặc chạy bước nhỏ, sau đó xoay nhẹ cổ chân, gối, hông, vai và cổ tay. Tiếp tục với bước ngang, bước chéo, nâng gối và mô phỏng động tác vung vợt ở cường độ tăng dần. Hãy bắt đầu đánh cầu bằng các pha nhẹ trước khi đập hoặc lao người. Khởi động không loại bỏ hoàn toàn nguy cơ chấn thương; dừng lại nếu đau nhói, chóng mặt hoặc khó thở bất thường. Cường độ và thời lượng nên điều chỉnh theo thể trạng.", None),
    ("TIN_TUC", "Đánh đôi hiệu quả bắt đầu từ giao tiếp", "Một vài nguyên tắc di chuyển và gọi cầu giúp hai người tránh bỏ trống sân.", "Trước trận, thống nhất cách gọi cầu ở giữa sân và tín hiệu khi đổi vị trí. Khi một người nâng cầu cao từ cuối sân, người đánh thường lùi về sau còn bạn đánh đứng trước để chặn lưới; khi phòng thủ cú đập, hai người thường đứng song song và giữ khoảng cách vừa đủ. Đây là nguyên tắc tham khảo chứ không phải vị trí cố định: hãy điều chỉnh theo hướng cầu, sở trường và khả năng di chuyển của cả đôi. Nói ngắn gọn, gọi sớm và di chuyển có trách nhiệm thường hữu ích hơn cố với theo mọi quả cầu.", None),
    ("TIN_TUC", "Bao lâu nên thay cước và quấn cán vợt?", "Nhận biết dấu hiệu hao mòn thay vì chỉ dựa vào lịch cố định.", "Cước có thể mất độ nảy và độ ổn định theo thời gian, tần suất chơi, mức căng và cách bảo quản. Hãy quan sát cước bị tưa, sờn hoặc xô lệch; nếu lực đánh thay đổi rõ, cân nhắc thay cước. Quấn cán nên thay khi trơn, bẩn hoặc không còn thấm mồ hôi tốt. Khi đứt cước, tránh cắt một bên duy nhất vì lực kéo lệch có thể ảnh hưởng khung; nhờ người đan cước tháo đều các dây. Luôn tuân thủ mức căng tối đa ghi cho đúng phiên bản vợt.", None),
    ("HUONG_DAN", "Theo dõi đơn hàng và đọc thông báo tài khoản", "Tìm trạng thái đơn, tin nhắn cửa hàng và cập nhật thanh toán trong tài khoản.", "Đăng nhập đúng tài khoản đã dùng khi đặt hàng. Mở mục Tài khoản → Đơn hàng để xem mã đơn và trạng thái xử lý; mở mục Thông báo để xem cập nhật thanh toán, bàn giao vận chuyển hoặc tin cửa hàng gửi riêng. Chuông trên trang chủ hiển thị một phần thông báo gần đây; chọn Xem thêm để đến danh sách đầy đủ. Nếu trạng thái chưa đổi, bấm Làm mới hoặc kiểm tra lại sau. Nếu thanh toán đã trừ tiền nhưng đơn chưa xuất hiện, lưu biên nhận/mã giao dịch và liên hệ cửa hàng để đối soát, không thanh toán lặp ngay.", None),
    ("HUONG_DAN", "Thanh toán trực tuyến an toàn trên Badminton Store", "Chỉ dùng phương thức và thông tin thanh toán được tạo tại bước đặt hàng.", "Tại giỏ hàng, kiểm tra tổng tiền và chọn phương thức đang được website hiển thị cho đơn của bạn. Nếu chọn chuyển khoản VietQR, quét mã được tạo ngay trong quy trình thanh toán và đối chiếu số tiền, nội dung chuyển khoản, người nhận trước khi xác nhận. Không chuyển tiền theo số tài khoản trong bài viết cũ, ảnh chụp hoặc tin nhắn không xác minh. Giữ lại biên nhận cho đến khi đơn được cập nhật. Nếu có sai lệch, dừng giao dịch tiếp theo và liên hệ cửa hàng qua trang Liên hệ.", None),
    ("HUONG_DAN", "Kiểm tra gói hàng khi nhận và yêu cầu hỗ trợ", "Những thông tin nên chuẩn bị nếu kiện hàng hoặc sản phẩm có vấn đề.", "Đối chiếu mã đơn và số lượng trước khi bỏ bao bì. Kiểm tra sản phẩm, phiên bản, phụ kiện đi kèm và tình trạng bên ngoài. Nếu phát hiện thiếu, sai mẫu hoặc hư hỏng, giữ nguyên bao bì và chụp ảnh/video rõ hiện trạng, nhãn vận chuyển cùng mã đơn. Gửi nội dung qua trang Liên hệ hoặc kênh nhắn cửa hàng. Đổi trả, bảo hành và thời hạn xử lý phụ thuộc điều kiện áp dụng cho từng sản phẩm; hãy chờ cửa hàng xác nhận hướng dẫn tiếp theo thay vì tự gửi hàng.", None),
    ("HUONG_DAN", "Bảo quản vợt cầu lông sau mỗi buổi chơi", "Cách giữ khung, dây và cán vợt khỏi nhiệt, ẩm và va đập không cần thiết.", "Dùng khăn mềm lau mồ hôi trên khung và cán, sau đó để vợt khô ở nơi thoáng. Tránh để vợt trong cốp xe nóng, gần nguồn nhiệt hoặc nơi ẩm lâu ngày. Không tự tăng mức căng vượt giới hạn của nhà sản xuất. Sau va chạm mạnh, kiểm tra khung và gen; nếu thấy nứt hoặc biến dạng, ngừng sử dụng và nhờ cửa hàng/đơn vị đan cước kiểm tra. Dùng bao vợt để giảm trầy xước khi di chuyển và tránh đặt vật nặng lên mặt vợt.", None),
    ("HUONG_DAN", "Chọn mức căng cước phù hợp", "Không có mức căng cao nhất nào phù hợp cho mọi người chơi.", "Mức căng ảnh hưởng cảm giác tiếp xúc cầu và vùng đánh hiệu quả. Người mới hoặc người chưa có lực cổ tay ổn định thường nên bắt đầu ở mức vừa phải theo hướng dẫn của nhà sản xuất, rồi điều chỉnh dần sau khi đã thuần kỹ thuật. Mức căng cao hơn đòi hỏi tiếp xúc cầu chính xác và có thể tăng nguy cơ đứt dây hoặc hư khung nếu dùng sai thông số. Luôn kiểm tra giới hạn cho đúng mã vợt/phiên bản; nhờ thợ đan tư vấn loại dây, mức căng và nút thắt phù hợp.", None),
    ("HUONG_DAN", "Danh sách trang bị cơ bản cho người mới chơi", "Bắt đầu vừa đủ, ưu tiên độ vừa vặn và an toàn khi di chuyển.", "Một bộ cơ bản gồm vợt dễ điều khiển, giày chuyên dụng có độ bám phù hợp mặt sân, tất thể thao, trang phục thoáng và bình nước cá nhân. Có thể bổ sung quấn cán hoặc khăn tùy nhu cầu. Trước khi mua, xác định ngân sách, tần suất chơi và nơi sử dụng; kiểm tra cỡ giày, cỡ cán, thông số vợt và chính sách áp dụng. Không cần chọn mẫu đắt nhất hay thông số cao nhất ngay từ đầu — đồ vừa chân, vừa tay và phù hợp thể lực sẽ hữu ích hơn.", None),
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
