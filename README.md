# Badminton Store

Website bán dụng cụ cầu lông với giao diện đỏ–cam, khu vực tài khoản cá nhân,
giỏ hàng và bảng quản trị. Frontend là HTML/CSS/JavaScript thuần; API dùng
Flask + MySQL.

## Chức năng hiện có

- Tài khoản: đăng ký/đăng nhập bằng phiên token hash, khóa thử sai, hồ sơ, cắt
  ảnh đại diện, đổi/quên mật khẩu, quản lý thiết bị đăng nhập.
- Cửa hàng: danh mục động từ MySQL, tìm kiếm gợi ý, một trang chi tiết dùng
  chung, gallery kéo/thả, yêu thích, đánh giá của khách đã mua.
- Bán hàng: giỏ hàng, kiểm tra tồn kho trong transaction, voucher một lần mỗi
  tài khoản, COD hoặc số dư, VietQR nạp ví theo đúng số tiền/mã đối soát,
  hủy/hoàn tiền và lịch sử đơn.
- Quản trị: sản phẩm, tải/nén ảnh và nhiều ảnh Swiper trực tiếp từ máy, sale,
  đơn hàng và mặt hàng trong đơn, người dùng,
  nội dung tin tức/hướng dẫn, voucher, nạp tiền, nhật ký trước/sau và cơ chế
  Super Admin xác nhận/hoàn tác.
- Vận hành: migration additive, WSGI, header bảo mật, rate limit, kiểm tra upload,
  CI GitHub và workflow triển khai Alwaysdata qua SSH.
- Trải nghiệm: chế độ sáng/tối thống nhất, hiệu ứng sương có thể tắt, chuyển
  cảnh khi cuộn, phản hồi nút bấm, dashboard quản trị và hạng thành viên dùng
  số liệu thật từ MySQL.

## Chạy frontend

```powershell
python -m http.server 8000 --bind 127.0.0.1
```

Mở `http://127.0.0.1:8000/trangchu.html`.

## Chạy backend

Tạo `.env` từ `.env.example`, sau đó:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\flask.exe --app HA.app run --host 127.0.0.1 --port 5000
```

Quy trình migration, tạo admin đầu tiên và cấu hình quyền MySQL được mô tả tại
[`HA/README_BACKEND.md`](HA/README_BACKEND.md).

## Kiểm tra và build

```powershell
pnpm run check
pnpm run build
.\.venv\Scripts\python.exe -m unittest HA.smoke_test -v
```

Migration luôn ở chế độ chỉ đọc nếu không truyền `--apply`. Không chạy
`populate_db.py` trên dữ liệu thật nếu chưa sao lưu; script này thay toàn bộ
danh mục sản phẩm và yêu cầu hai cờ xác nhận rõ ràng.

## Triển khai

Điểm vào WSGI là `wsgi:application`. Cấu hình Alwaysdata, biến môi trường,
quy trình sao lưu/migration và phạm vi bảo mật được ghi tại
[`HA/README_BACKEND.md`](HA/README_BACKEND.md#5-cấu-hình-alwaysdata).

Không đưa `.env`, `.venv`, database dump, `dist`, `node_modules` hoặc ảnh đại
diện khách hàng trong `HA/avatars` vào gói phát hành công khai.

Repository đã có hai GitHub Actions:

- `CI`: kiểm tra Python, API smoke test, HTML/CSS/JavaScript và bản build sau
  mỗi lần push/pull request.
- `Deploy Alwaysdata`: triển khai thủ công qua SSH sau khi CI đạt yêu cầu.

Hướng dẫn từng bước cho tài khoản GitHub Student và Alwaysdata nằm tại
[`docs/GITHUB_STUDENT_DEPLOY.md`](docs/GITHUB_STUDENT_DEPLOY.md). GitHub Pages
không chạy được API Flask/MySQL; trong kiến trúc này GitHub giữ mã nguồn và
chạy CI/CD, còn Alwaysdata chạy ứng dụng thật.

Với phương án hiện tại, GitHub Student được dùng cho repository riêng, Actions,
Dependabot và ưu đãi domain; Alwaysdata chạy Flask/MySQL. Không cần đăng ký Azure
và không có cơ chế tự tiêu 100 USD credit. Một nền tảng cloud khác chỉ là phương
án tùy chọn trong tương lai, không phải điều kiện để website hoạt động.

### Cấp Super Admin an toàn

Không có mã bí mật hoặc cửa hậu trong thanh tìm kiếm. Khi thật sự cần khởi tạo
quản trị cấp cao, đăng nhập SSH vào máy chủ rồi chạy một lần:

```bash
cd ~/www/webcaulong
. .venv/bin/activate
ALLOW_SUPERADMIN_BOOTSTRAP=1 flask --app HA.app promote-superadmin TEN_DANG_NHAP
```

Lệnh yêu cầu mật khẩu hiện tại của chính tài khoản đích, xác nhận lần cuối,
thu hồi mọi phiên đăng nhập cũ và ghi nhật ký `BOOTSTRAP_SUPERADMIN`. Biến môi
trường chỉ tồn tại trong câu lệnh trên, không lưu vào `.env`.
