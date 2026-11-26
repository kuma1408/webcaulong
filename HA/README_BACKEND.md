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
Migration `2026-09-25-payment-proof-approval-v9` bổ sung kho chứng từ riêng tư
cho ảnh chuyển khoản/tệp bằng chứng và chuẩn hóa trạng thái xét duyệt sang
phê duyệt hoặc từ chối. Cần sao lưu database rồi chạy migration trên máy chủ
trước khi dùng các chức năng này; trạng thái hoàn tác cũ chỉ còn để xem lịch sử.

Migration `2026-09-25-customer-notifications-approval-evidence-v10` bổ sung
hộp thông báo khách hàng (trạng thái đã đọc, gửi toàn bộ hoặc theo tài khoản,
thu hồi), thông báo tự động khi xác nhận chuyển khoản/giao hàng/hoàn tất và cờ
biên bản phạt Admin. Migration `2026-09-25-approval-supplement-evidence-v11`
tạo lịch sử yêu cầu bổ sung minh chứng: Super Admin có thể yêu cầu Admin gửi
thêm tệp và lời giải thích; sau khi gửi, thay đổi quay lại hàng chờ phê duyệt.
Lịch sử từ chối/yêu cầu trước đó được giữ nguyên. Tệp chỉ bắt buộc khi lập
biên bản phạt hoặc khi Admin trả lời yêu cầu bổ sung.

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

## 7. Trợ lý AI (nút "Hỏi AI")

- Endpoint `POST /api/ai/chat` gọi Google Gemini từ máy chủ. Nhận JSON
  `{ "message", "history" }` hoặc `multipart/form-data` với `message`,
  `history` (chuỗi JSON) và tối đa 3 tệp `images` (JPG/PNG/WEBP, mỗi ảnh ≤ 4 MB).
  Trả về `reply` (ngắn, có gạch đầu dòng), `products` (thẻ sản phẩm có ảnh, giá,
  giá gốc, còn hàng) và `suggestions` (2-3 câu hỏi gợi ý tiếp theo).
- Đặt `GEMINI_API_KEY` (và tùy chọn `GEMINI_MODEL`) trong `.env`, rồi khởi
  động lại API. Thiếu key thì endpoint trả `503 ai_not_configured` và trang vẫn chạy.
- `GEMINI_MODEL` nhận tối đa 4 model cách nhau dấu phẩy (mặc định
  `gemini-3.6-flash`, `gemini-3.5-flash-lite`, `gemini-3.5-flash`,
  `gemini-flash-lite-latest`). Máy chủ gọi song song 2 model đầu và lấy câu trả lời
  về trước; model nào quá tải (429/503), treo hoặc đã bị Google gỡ thì gọi model kế
  tiếp. Cả lượt tối đa 40 giây.
- Ảnh khách gửi được trình duyệt thu nhỏ trước khi tải lên, máy chủ kiểm tra lại,
  xoay đúng chiều, thu về cạnh dài 1024px, bỏ EXIF (vị trí GPS...) rồi chỉ chuyển
  cho Gemini; ảnh không được lưu trên máy chủ hay database.
- Mỗi câu hỏi, máy chủ chọn sản phẩm đang bán khớp câu hỏi (tên, thương hiệu,
  danh mục, ngân sách như "dưới 1 triệu"); khi có ảnh thì thêm mẫu đều các danh
  mục (tối đa 40 sản phẩm) để AI đối chiếu, nên AI chỉ giới thiệu hàng có thật.
- Không cần đăng nhập; giới hạn 8 câu/phút và 60 câu/giờ cho mỗi IP. Hội thoại AI
  không được lưu vào database, lịch sử chỉ nằm trong tab trình duyệt.
- Gói miễn phí của Gemini có giới hạn số request và Google có thể dùng dữ liệu
  gửi lên (kể cả ảnh) để cải thiện dịch vụ; không đưa thông tin cá nhân vào ngữ cảnh AI.

## 8. Trợ lý AI quản trị (mục "Trợ lý AI" trong admin.html)

- `GET /api/admin/ai/snapshot` (cần quyền admin) trả các KPI 30 ngày và xu hướng
  14 ngày để hiện trên đầu mục.
- `POST /api/admin/ai/analyze` (cần quyền admin) nhận `message`, `history` và tối
  đa 4 ảnh (ảnh sản phẩm, banner, biểu đồ, ảnh chụp màn hình…). Máy chủ gửi cho
  Gemini một bản tóm tắt số liệu tổng hợp: doanh thu/đơn 30 ngày so với kỳ trước,
  tỉ lệ hủy, giá trị đơn trung bình, xu hướng 14 ngày, top bán chạy, hàng tồn
  không bán được 60 ngày, sắp hết hàng, doanh thu theo danh mục, phương thức thanh
  toán, giỏ hàng bỏ dở. Không gửi tên, email, số điện thoại hay địa chỉ khách hàng.
- AI trả lời theo các phần `## Đánh giá nhanh / Phân tích / Đề xuất hành động`,
  dẫn số liệu thật, kèm thẻ sản phẩm được nhắc tới và câu hỏi gợi ý tiếp theo.
- Giới hạn 10 lần/phút và 150 lần/giờ cho mỗi tài khoản admin. Dùng chung
  `GEMINI_API_KEY`/`GEMINI_MODEL` với trợ lý AI của khách hàng.
