# Backend Badminton Store

## 1. Cấu hình

Tạo môi trường Python, cài `requirements.txt`, sau đó sao chép `.env.example`
thành `.env`. Không commit `.env`.

Tài khoản chạy API chỉ cần quyền dữ liệu:

```sql
CREATE USER 'shop_app'@'localhost' IDENTIFIED BY 'MAT_KHAU_MOI_RAT_MANH';
GRANT SELECT, INSERT, UPDATE, DELETE ON shop_caulong.* TO 'shop_app'@'localhost';
FLUSH PRIVILEGES;
```

Hãy đổi mật khẩu MySQL cũ nếu nó từng xuất hiện trong mã nguồn hoặc lịch sử Git.

## 2. Migration

Migration mặc định chỉ kiểm tra, không ghi dữ liệu:

```powershell
python HA/migrate_database.py
```

Sau khi sao lưu database, dùng tài khoản migration có quyền `CREATE`, `ALTER`,
`INDEX` và `REFERENCES` rồi mới áp dụng:

```powershell
python HA/migrate_database.py --apply
```

Migration không có lệnh `DROP`, `DELETE` hay `TRUNCATE` và có thể chạy lại.

## 3. Tạo admin đầu tiên

Đăng ký một tài khoản bình thường rồi cấp quyền qua CLI tại máy chủ:

```powershell
flask --app HA.app promote-admin TEN_DANG_NHAP
```

Không có tài khoản hoặc mật khẩu admin mặc định trong mã nguồn.

## 4. Chạy API

```powershell
flask --app HA.app run --host 127.0.0.1 --port 5000
```

Khi triển khai thật, đặt HTTPS ở reverse proxy, cấu hình `CORS_ORIGINS` đúng
domain frontend và không bật `FLASK_DEBUG`.

## 5. Cấu hình Alwaysdata

Trong `.env` trên máy chủ, dùng đúng thông tin MySQL do Alwaysdata cấp và giữ
toàn bộ bí mật ngoài Git:

```dotenv
DB_HOST=mysql-TAI_KHOAN.alwaysdata.net
DB_PORT=3306
DB_NAME=TAI_KHOAN_shop_badminton
DB_USER=TAI_KHOAN
DB_PASSWORD=MAT_KHAU_DATABASE
CORS_ORIGINS=https://TAI_KHOAN.alwaysdata.net
SESSION_DAYS=7
TRUST_PROXY_HOPS=1
FLASK_DEBUG=0
```

Ứng dụng WSGI là `wsgi:application`. Thư mục làm việc phải là thư mục chứa
`wsgi.py`. Sau mỗi lần cập nhật:

```bash
cd ~/www/webcaulong
source .venv/bin/activate
python -m pip install -r requirements.txt
python HA/migrate_database.py
python -m unittest HA.smoke_test -v
```

Chỉ chạy `python HA/migrate_database.py --apply` sau khi đã xuất một bản sao
database bằng phpMyAdmin. Sau cùng bấm **Reload/Restart** website trong bảng
điều khiển Alwaysdata và kiểm tra `/api/health`.

## 6. Phạm vi bảo mật hiện tại

- Bearer token ngẫu nhiên được lưu dạng SHA-256 trong database; mật khẩu dùng
  Werkzeug và hash cũ được nâng cấp sau khi đăng nhập thành công.
- API quản trị kiểm tra vai trò ở backend, có nhật ký, snapshot trước/sau và
  quy trình Super Admin xác nhận hoặc hoàn tác.
- Có giới hạn tần suất cho đăng nhập, đăng ký, đánh giá và nạp tiền; giới hạn
  này nằm trong từng tiến trình Python. Khi chạy nhiều máy chủ cần chuyển sang
  Redis hoặc dịch vụ rate-limit dùng chung.
- Ảnh đại diện được giải mã, cắt 512×512 và mã hóa lại thành WebP; không lưu
  nguyên tệp người dùng gửi lên. Mô tả sản phẩm được lọc HTML để chống stored
  XSS; URL ảnh/nguồn bị giới hạn scheme an toàn.
- Header CSP, HSTS, chống iframe/MIME sniffing và cache policy được trả về từ
  Flask. CSP vẫn cho phép inline script/style để tương thích các trang HTML cũ;
  muốn đạt mức nghiêm ngặt hơn cần tách toàn bộ inline code sang tệp riêng và
  dùng nonce/hash.
- Website không thu thập số thẻ, ngày hết hạn hoặc CVV. Thanh toán hiện chỉ là
  COD hoặc số dư nội bộ. Muốn nhận tiền thật phải tích hợp cổng thanh toán có
  hợp đồng và webhook ký số; tuyệt đối không tự lưu thông tin thẻ.

Gói Alwaysdata miễn phí phù hợp học tập/demo, không tự tạo tính sẵn sàng cao,
WAF hay backup ngoài nhà cung cấp. Cần sao lưu database và thư mục `HA/avatars`
định kỳ; GitHub Student không tự bổ sung các lớp vận hành này.
