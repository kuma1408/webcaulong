# Đưa Badminton Store lên GitHub Student và Alwaysdata

## 1. Hiểu đúng hai dịch vụ

GitHub Student cung cấp GitHub Pro và các ưu đãi học sinh/sinh viên. Repository
GitHub lưu mã nguồn, chạy kiểm thử và có thể điều khiển triển khai. GitHub Pages
chỉ phù hợp phần web tĩnh; API Flask, MySQL, đăng nhập, giỏ hàng và admin của dự
án vẫn cần chạy trên Alwaysdata (hoặc một máy chủ Python tương đương).

Repository của máy này đã nối với:

```text
https://github.com/kuma1408/webcaulong.git
```

## 2. Kiểm tra trước khi đưa mã lên

Mở PowerShell tại `F:\webcaulong\webcaulong-main`:

```powershell
git remote -v
git status
git check-ignore -v .env HA/avatars
git ls-files .env HA/avatars
```

Lệnh cuối không được in ra `.env` hay ảnh khách hàng. Không bao giờ đưa mật
khẩu MySQL, SMTP, SSH private key hoặc file SQL lên repository.

Chạy kiểm thử:

```powershell
.\.venv\Scripts\python.exe -m unittest HA.smoke_test -v
.\.venv\Scripts\python.exe -m py_compile HA\app.py HA\migrate_database.py wsgi.py
npm run check
npm run build
```

## 3. Đưa phiên bản lên repository

Vì remote `origin` đã có, không cần tạo lại. Kiểm tra kỹ danh sách file rồi:

```powershell
git add .
git status
git commit -m "Hoan thien Badminton Store production"
git push origin main
```

Nếu GitHub yêu cầu đăng nhập, dùng GitHub Desktop hoặc đăng nhập trình duyệt mà
Git Credential Manager mở ra. Không dùng mật khẩu GitHub làm mật khẩu `git`.

Sau push, mở repository > **Actions** > workflow **CI**. Chỉ triển khai khi tất
cả bước có dấu xanh.

## 4. Tạo SSH key riêng cho GitHub Actions

Không dùng lại private key cá nhân. Trên PowerShell:

```powershell
ssh-keygen -t ed25519 -C "github-actions-webcaulong" -f "$env:USERPROFILE\.ssh\webcaulong_actions"
Get-Content "$env:USERPROFILE\.ssh\webcaulong_actions.pub"
```

Đăng nhập SSH Alwaysdata rồi thêm **public key** vừa hiện vào
`~/.ssh/authorized_keys`. Có thể dùng lệnh sau từ PowerShell (thay đúng host):

```powershell
Get-Content "$env:USERPROFILE\.ssh\webcaulong_actions.pub" | ssh haianh@ssh-haianh.alwaysdata.net "umask 077; mkdir -p ~/.ssh; cat >> ~/.ssh/authorized_keys"
```

Lấy fingerprint máy chủ để GitHub Actions không kết nối nhầm máy:

```powershell
ssh-keyscan ssh-haianh.alwaysdata.net
```

Đối chiếu fingerprint với thông tin SSH trong bảng điều khiển Alwaysdata trước
khi lưu kết quả.

## 5. Tạo GitHub Actions secrets

Vào repository > **Settings** > **Secrets and variables** > **Actions** >
**New repository secret**, tạo đúng 5 secret:

| Tên | Giá trị |
| --- | --- |
| `ALWAYSDATA_SSH_HOST` | `ssh-haianh.alwaysdata.net` |
| `ALWAYSDATA_SSH_USER` | `haianh` |
| `ALWAYSDATA_APP_PATH` | `/home/haianh/www/webcaulong` |
| `ALWAYSDATA_SSH_KEY` | toàn bộ nội dung file `webcaulong_actions` (private key) |
| `ALWAYSDATA_KNOWN_HOSTS` | toàn bộ dòng đúng từ `ssh-keyscan` |

Tạo environment tên `production` trong **Settings > Environments**. Nếu tài
khoản hỗ trợ, bật required reviewer để một lần bấm nhầm không deploy ngay.

## 6. Cấu hình production trên Alwaysdata

File `/home/haianh/www/webcaulong/.env` phải tồn tại trực tiếp trên server và
không nằm trong Git. Dùng `.env.example` làm mẫu, tối thiểu điền DB, CORS và URL:

```dotenv
DB_HOST=mysql-haianh.alwaysdata.net
DB_PORT=3306
DB_NAME=haianh_shop_badminton
DB_USER=ten-user-mysql-cua-ban
DB_PASSWORD=mat-khau-mysql-rieng
CORS_ORIGINS=https://haianh.alwaysdata.net
PUBLIC_BASE_URL=https://haianh.alwaysdata.net
TRUST_PROXY_HOPS=1
FLASK_DEBUG=0
```

Điền SMTP nếu muốn chức năng quên mật khẩu gửi email. Không có SMTP, API vẫn
trả thông báo chung để tránh lộ tài khoản nhưng email sẽ không được gửi.

Trong Alwaysdata > **Web > Sites**, ứng dụng phải dùng WSGI và entry point:

```text
wsgi:application
```

Thư mục làm việc là `/home/haianh/www/webcaulong` và Python virtualenv là
`/home/haianh/www/webcaulong/.venv`.

## 7. Sao lưu và migration lần đầu

Trước khi đổi schema, export MySQL bằng phpMyAdmin/Administration của
Alwaysdata. Sau đó SSH vào server:

```bash
cd ~/www/webcaulong
. .venv/bin/activate
python HA/migrate_database.py
python HA/migrate_database.py --apply
python -m unittest HA.smoke_test -v
```

Lệnh đầu chỉ in kế hoạch; `--apply` mới ghi schema. Migration hiện tại là
additive, tạo phiên đăng nhập, reset mật khẩu, yêu thích, dùng voucher, nội dung,
nhật ký và phê duyệt quản trị mà không xóa dữ liệu bán hàng.

## 8. Triển khai các lần sau

1. Push code lên nhánh `main` và chờ workflow **CI** xanh.
2. Vào **Actions > Deploy Alwaysdata > Run workflow**.
3. Giữ `apply_migration` tắt nếu không có thay đổi database.
4. Nếu CI báo có migration mới: sao lưu MySQL, chạy lại và bật tùy chọn đó.
5. Mở `https://haianh.alwaysdata.net/api/health`, sau đó thử đăng nhập, giỏ hàng,
   đặt đơn, admin và tải ảnh.

Workflow giải nén vào thư mục tạm và chạy kiểm thử trước khi thay website đang
hoạt động. Nó giữ nguyên `.env`, `.venv`, `HA/avatars`, `HA/uploads`, chỉ lưu ba
bản sao code gần nhất và sẽ dừng nếu database còn migration chưa áp dụng.

## 9. Tạo bảo trì tự động miễn phí

Vào Alwaysdata > **Advanced > Scheduled tasks**, tạo tác vụ chạy mỗi ngày một
lần với lệnh:

```bash
cd /home/haianh/www/webcaulong && .venv/bin/python -m HA.maintenance --apply
```

Tác vụ chỉ dọn phiên đăng nhập và token đặt lại mật khẩu đã vô hiệu ít nhất 7
ngày. Nó không xóa tài khoản, đơn hàng, giao dịch hoặc nhật ký quản trị.

## 10. Khi đăng nhập báo “Không thể đăng nhập lúc này”

SSH vào server và chạy:

```bash
cd ~/www/webcaulong
. .venv/bin/activate
python HA/migrate_database.py
python HA/migrate_database.py --apply
python -m unittest HA.smoke_test -v
```

Sau đó xem log website trong Alwaysdata. Lỗi thường gặp là `.env` dùng sai
database/user hoặc các bảng phiên đăng nhập chưa được migration. Mã hiện tại tự
chuẩn hóa tên bảng MySQL sang chữ thường để hoạt động ổn định trên Linux.
