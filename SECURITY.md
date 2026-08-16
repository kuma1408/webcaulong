# Chính sách bảo mật

Không đăng lỗi bảo mật có kèm mật khẩu, token, dữ liệu khách hàng hoặc bản sao
database trong Issues công khai. Hãy gửi báo cáo riêng cho chủ repository và
nêu rõ URL, bước tái hiện, mức ảnh hưởng và bằng chứng đã ẩn dữ liệu nhạy cảm.

## Quy tắc vận hành

- Không commit `.env`, private key SSH, SQL dump hay thư mục `HA/avatars`.
- Tài khoản Super Admin phải dùng mật khẩu riêng mạnh và bật 2FA cho GitHub.
- Chỉ chạy migration sau khi đã sao lưu database.
- Luôn dùng HTTPS, `FLASK_DEBUG=0`, origin CORS cụ thể và secret production khác
  hoàn toàn secret local.
- Thường xuyên cập nhật dependency và xem kết quả workflow `CI` trước khi deploy.

Đây là ứng dụng học tập/MVP; cần pentest, giám sát, sao lưu phục hồi và quy
trình phản ứng sự cố trước khi xử lý thanh toán hoặc dữ liệu thật ở quy mô lớn.
