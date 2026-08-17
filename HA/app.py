"""API cho Badminton Store.

Phiên bản này giữ tương thích với các URL API cũ nhưng không còn tin vào
``username`` do trình duyệt gửi lên. Mọi API riêng tư đều lấy danh tính từ
Bearer token được lưu dạng hash trong bảng PhienDangNhap.
"""

from __future__ import annotations

import hashlib
import io
import json
import os
import re
import secrets
import smtplib
import ssl
import threading
import time
import unicodedata
from collections import defaultdict, deque
from datetime import datetime, timedelta
from decimal import Decimal
from difflib import SequenceMatcher
from email.message import EmailMessage
from functools import wraps
from urllib.parse import urlsplit

import bleach
import click
import mysql.connector
from flask import Flask, abort, g, jsonify, request, send_from_directory
from flask_cors import CORS
from mysql.connector import IntegrityError
from PIL import Image, ImageOps, UnidentifiedImageError
from dotenv import load_dotenv
from werkzeug.middleware.proxy_fix import ProxyFix
from werkzeug.security import check_password_hash, generate_password_hash


load_dotenv()
from HA.media_storage import (
    MediaStorageError,
    delete_avatar,
    save_avatar,
    save_public_image,
)

app = Flask(__name__)
app.json.ensure_ascii = False
app.config.update(
    JSON_SORT_KEYS=False,
    # Chừa phần header multipart; từng ảnh vẫn được kiểm tra riêng ở backend.
    MAX_CONTENT_LENGTH=4 * 1024 * 1024,
    MAX_FORM_MEMORY_SIZE=4 * 1024 * 1024,
    MAX_FORM_PARTS=20,
)

TRUST_PROXY_HOPS = max(0, min(int(os.getenv("TRUST_PROXY_HOPS", "0")), 3))
if TRUST_PROXY_HOPS:
    # Alwaysdata chuyển tiếp HTTPS/IP qua reverse proxy. Chỉ bật khi biết chính xác
    # số proxy phía trước; nếu để 0 ứng dụng tuyệt đối không tin X-Forwarded-*.
    app.wsgi_app = ProxyFix(
        app.wsgi_app,
        x_for=TRUST_PROXY_HOPS,
        x_proto=TRUST_PROXY_HOPS,
        x_host=TRUST_PROXY_HOPS,
    )

LOCAL_ORIGINS = [
    "http://127.0.0.1:8000",
    "http://localhost:8000",
    "http://127.0.0.1:5500",
    "http://localhost:5500",
]
allowed_origins = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", ",".join(LOCAL_ORIGINS)).split(",")
    if origin.strip()
]
CORS(
    app,
    resources={r"/api/*": {"origins": allowed_origins}},
    supports_credentials=False,
    allow_headers=["Content-Type", "Authorization"],
)

DB_CONFIG = {
    "host": os.getenv("DB_HOST", "127.0.0.1"),
    "port": int(os.getenv("DB_PORT", "3306")),
    "user": os.getenv("DB_USER", "shop_app"),
    "password": os.getenv("DB_PASSWORD", ""),
    "database": os.getenv("DB_NAME", "shop_caulong"),
    "charset": "utf8mb4",
    "use_unicode": True,
    "autocommit": False,
    "connection_timeout": 8,
}

# Khi MySQL cloud yêu cầu TLS, CA được dùng để xác minh cả certificate và
# hostname, tránh kết nối tới máy chủ giả mạo.
DB_SSL_CA = os.getenv("DB_SSL_CA", "").strip()
if DB_SSL_CA:
    if not os.path.isfile(DB_SSL_CA):
        raise RuntimeError("DB_SSL_CA không trỏ tới một tệp CA hợp lệ.")
    DB_CONFIG.update(
        ssl_ca=DB_SSL_CA,
        ssl_verify_cert=True,
        ssl_verify_identity=True,
        tls_versions=["TLSv1.2", "TLSv1.3"],
    )

SESSION_DAYS = max(1, min(int(os.getenv("SESSION_DAYS", "7")), 30))
PASSWORD_RESET_MINUTES = max(10, min(int(os.getenv("PASSWORD_RESET_MINUTES", "30")), 120))
LOGIN_MAX_ATTEMPTS = 5
LOGIN_LOCK_MINUTES = 15
LEGACY_PASSWORD_SALT = "shop_caulong_2024"
EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
PHONE_RE = re.compile(r"^(0|\+84)[3-9]\d{8}$")
USERNAME_RE = re.compile(r"^[a-zA-Z0-9_]{3,30}$")
ORDER_STATES = {"CHO_XAC_NHAN", "DANG_GIAO", "HOAN_THANH", "DA_HUY"}
DUMMY_PASSWORD_HASH = generate_password_hash("invalid-login-placeholder")
PRODUCT_PRICE_MAX = Decimal("9999999999.99")
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AVATAR_MAX_BYTES = 2 * 1024 * 1024
AVATAR_SIZE = (512, 512)
PUBLIC_IMAGE_MAX_BYTES = 3 * 1024 * 1024
PUBLIC_IMAGE_MAX_SIZE = (1800, 1800)
PUBLIC_FILE_EXTENSIONS = {
    ".html", ".css", ".js", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".ico", ".avif"
}

RICH_TEXT_TAGS = {
    "p", "br", "ul", "ol", "li", "strong", "b", "em", "i", "u",
    "h2", "h3", "h4", "blockquote", "code", "pre", "a", "span",
    "table", "thead", "tbody", "tr", "th", "td",
}
RICH_TEXT_ATTRIBUTES = {
    "a": ["href", "title", "target", "rel"],
    "th": ["colspan", "rowspan"],
    "td": ["colspan", "rowspan"],
}


class SlidingWindowLimiter:
    """Rate limiter nhẹ cho một tiến trình WSGI.

    Đây là lớp bảo vệ đầu tiên phù hợp gói Alwaysdata nhỏ. Khi mở rộng nhiều
    máy chủ, thay lớp này bằng Redis/shared store mà không cần đổi các route.
    """

    def __init__(self):
        self._events: dict[tuple[str, str], deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()
        self._operations = 0

    def check(self, bucket: str, identifier: str, limit: int, window_seconds: int) -> tuple[bool, int]:
        now = time.monotonic()
        cutoff = now - window_seconds
        key = (bucket, identifier[:160])
        with self._lock:
            events = self._events[key]
            while events and events[0] <= cutoff:
                events.popleft()
            if len(events) >= limit:
                retry_after = max(1, int(window_seconds - (now - events[0])) + 1)
                return False, retry_after
            events.append(now)
            self._operations += 1
            if self._operations % 500 == 0:
                # Không dùng ``cutoff`` của request hiện tại để dọn bucket khác:
                # login có cửa sổ 60 giây nhưng đăng ký có thể là 1 giờ.
                stale_before = now - 86_400
                stale = [
                    stored_key
                    for stored_key, values in self._events.items()
                    if not values or values[-1] <= stale_before
                ]
                for stored_key in stale[:2000]:
                    self._events.pop(stored_key, None)
            return True, 0


RATE_LIMITER = SlidingWindowLimiter()


# MySQL trên Windows thường không phân biệt chữ hoa/thường của tên bảng, trong
# khi MariaDB/Linux (Alwaysdata) có thể phân biệt. Bản dump lịch sử của dự án
# dùng tên bảng chữ thường, vì vậy chuẩn hóa đúng phần identifier đứng sau các
# từ khóa SQL. Giá trị chuỗi như DoiTuong='NguoiDung' không bị thay đổi.
DATABASE_TABLE_NAMES = {
    "baiviet", "chitietdonhang", "danhgia", "danhmuc", "donhang", "giohang",
    "lichsugiaodich", "nhatkyquantri", "nguoidung", "pheduyetthaydoi",
    "phiendangnhap", "sanpham", "schemamigration", "voucher", "yeucaunaptien",
    "datlaimatkhau", "sudungvoucher", "yeuthich", "yeucauhotro",
}
_TABLE_REFERENCE_RE = re.compile(
    r"\b(FROM|JOIN|UPDATE|INTO|TABLE|REFERENCES)\s+`?("
    + "|".join(sorted(DATABASE_TABLE_NAMES, key=len, reverse=True))
    + r")`?(?![A-Za-z0-9_])",
    re.IGNORECASE,
)


def normalize_sql_table_names(statement: str) -> str:
    """Chuẩn hóa identifier bảng mà không chạm vào dữ liệu/literal SQL."""
    if not isinstance(statement, str):
        return statement
    return _TABLE_REFERENCE_RE.sub(
        lambda match: f"{match.group(1)} `{match.group(2).lower()}`",
        statement,
    )


class CaseSafeCursor:
    def __init__(self, cursor):
        self._cursor = cursor

    def execute(self, operation, params=None, *args, **kwargs):
        return self._cursor.execute(
            normalize_sql_table_names(operation), params, *args, **kwargs
        )

    def executemany(self, operation, seq_params, *args, **kwargs):
        return self._cursor.executemany(
            normalize_sql_table_names(operation), seq_params, *args, **kwargs
        )

    def __iter__(self):
        return iter(self._cursor)

    def __getattr__(self, name):
        return getattr(self._cursor, name)


class CaseSafeConnection:
    def __init__(self, connection):
        self._connection = connection

    def cursor(self, *args, **kwargs):
        return CaseSafeCursor(self._connection.cursor(*args, **kwargs))

    def __getattr__(self, name):
        return getattr(self._connection, name)


def get_db_connection():
    """Tạo kết nối mới; caller luôn phải đóng kết nối trong finally."""
    return CaseSafeConnection(mysql.connector.connect(**DB_CONFIG))


def body_json() -> dict:
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}


def api_error(message: str, status: int = 400, code: str = "bad_request"):
    return jsonify({"success": False, "message": message, "code": code}), status


@app.errorhandler(413)
def request_too_large(_error):
    if request.path.startswith("/api/"):
        return api_error("Dữ liệu tải lên vượt quá giới hạn cho phép.", 413, "payload_too_large")
    return "Dữ liệu tải lên vượt quá giới hạn cho phép.", 413


@app.errorhandler(405)
def method_not_allowed(_error):
    if request.path.startswith("/api/"):
        return api_error("Phương thức yêu cầu không được hỗ trợ.", 405, "method_not_allowed")
    return "Phương thức yêu cầu không được hỗ trợ.", 405


@app.errorhandler(500)
def internal_server_error(error):
    app.logger.error("Lỗi máy chủ chưa được xử lý: %s", error)
    if request.path.startswith("/api/"):
        return api_error("Máy chủ gặp lỗi tạm thời. Vui lòng thử lại sau.", 500, "internal_error")
    return "Máy chủ gặp lỗi tạm thời. Vui lòng thử lại sau.", 500


def client_ip() -> str:
    """IP đã được ProxyFix xác minh hoặc IP socket trực tiếp."""
    return (request.remote_addr or "unknown")[:45]


def enforce_rate_limit(bucket: str, identifier: str, limit: int, window_seconds: int):
    allowed, retry_after = RATE_LIMITER.check(bucket, identifier, limit, window_seconds)
    if allowed:
        return None
    response = jsonify(
        {
            "success": False,
            "message": "Bạn thao tác quá nhanh. Vui lòng thử lại sau.",
            "code": "rate_limited",
            "retry_after": retry_after,
        }
    )
    response.status_code = 429
    response.headers["Retry-After"] = str(retry_after)
    return response


def sanitize_rich_text(value) -> str:
    """Giữ định dạng mô tả cơ bản nhưng loại script/event handler nguy hiểm."""
    return bleach.clean(
        str(value or ""),
        tags=RICH_TEXT_TAGS,
        attributes=RICH_TEXT_ATTRIBUTES,
        protocols={"http", "https", "mailto"},
        strip=True,
        strip_comments=True,
    ).strip()


def normalize_public_url(value, *, allow_relative: bool, max_length: int = 700) -> str | None:
    candidate = str(value or "").strip()[:max_length]
    if not candidate or any(ord(character) < 32 for character in candidate):
        return None
    parsed = urlsplit(candidate)
    if parsed.scheme:
        if parsed.scheme.lower() not in {"http", "https"} or not parsed.netloc:
            return None
        return candidate
    if not allow_relative or candidate.startswith(("//", "\\", "/")) or "\\" in candidate:
        return None
    normalized = os.path.normpath(candidate).replace("\\", "/")
    if normalized == ".." or normalized.startswith("../"):
        return None
    return normalized


def normalized_avatar(uploaded) -> bytes:
    """Xác thực bằng bộ giải mã ảnh rồi chuẩn hóa thành WebP 512x512.

    Việc giải mã và mã hóa lại loại metadata, nội dung nối thêm và các tệp chỉ
    giả chữ ký JPG/PNG/WebP. Ảnh cũng được cắt giữa để không phá khung avatar.
    """
    raw = uploaded.read(AVATAR_MAX_BYTES + 1)
    if len(raw) > AVATAR_MAX_BYTES:
        raise ValueError("avatar_too_large")
    if not raw:
        raise ValueError("avatar_empty")
    try:
        Image.MAX_IMAGE_PIXELS = 20_000_000
        with Image.open(io.BytesIO(raw)) as probe:
            if (probe.format or "").upper() not in {"JPEG", "PNG", "WEBP"}:
                raise ValueError("avatar_type_not_supported")
            probe.verify()
        with Image.open(io.BytesIO(raw)) as source:
            source = ImageOps.exif_transpose(source)
            if source.width < 32 or source.height < 32:
                raise ValueError("avatar_too_small")
            source.seek(0)
            frame = source.convert("RGB")
            frame = ImageOps.fit(frame, AVATAR_SIZE, method=Image.Resampling.LANCZOS)
            output = io.BytesIO()
            frame.save(output, format="WEBP", quality=88, method=6, exif=b"")
            return output.getvalue()
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError, SyntaxError) as exc:
        raise ValueError("avatar_invalid") from exc


def normalized_public_image(uploaded) -> bytes:
    """Xác thực và nén ảnh admin tải lên, giữ nguyên tỉ lệ sản phẩm."""
    if not uploaded or not getattr(uploaded, "filename", ""):
        raise ValueError("image_missing")
    raw = uploaded.read(PUBLIC_IMAGE_MAX_BYTES + 1)
    if len(raw) > PUBLIC_IMAGE_MAX_BYTES:
        raise ValueError("image_too_large")
    if not raw:
        raise ValueError("image_invalid")
    try:
        Image.MAX_IMAGE_PIXELS = 24_000_000
        with Image.open(io.BytesIO(raw)) as probe:
            if (probe.format or "").upper() not in {"JPEG", "PNG", "WEBP"}:
                raise ValueError("image_type")
            probe.verify()
        with Image.open(io.BytesIO(raw)) as source:
            source = ImageOps.exif_transpose(source)
            if source.width < 64 or source.height < 64:
                raise ValueError("image_too_small")
            frame = source.convert("RGBA")
            frame.thumbnail(PUBLIC_IMAGE_MAX_SIZE, Image.Resampling.LANCZOS)
            background = Image.new("RGB", frame.size, "white")
            background.paste(frame, mask=frame.getchannel("A"))
            output = io.BytesIO()
            background.save(output, "WEBP", quality=86, method=6, exif=b"")
            result = output.getvalue()
            if not result or len(result) > PUBLIC_IMAGE_MAX_BYTES:
                raise ValueError("image_invalid")
            return result
    except ValueError:
        raise
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError, SyntaxError) as exc:
        raise ValueError("image_invalid") from exc


def public_image_validation_error(error: ValueError):
    code = str(error)
    messages = {
        "image_missing": ("Vui lòng chọn ảnh cần tải lên.", 400),
        "image_too_large": ("Ảnh không được vượt quá 3 MB.", 413),
        "image_type": ("Chỉ chấp nhận ảnh JPG, PNG hoặc WebP.", 415),
        "image_too_small": ("Ảnh cần có kích thước tối thiểu 64×64 px.", 400),
        "image_invalid": ("Tệp đã chọn không phải ảnh hợp lệ.", 415),
    }
    message, status = messages.get(code, messages["image_invalid"])
    return api_error(message, status, code if code in messages else "image_invalid")


def avatar_validation_error(error: ValueError):
    code = str(error)
    messages = {
        "avatar_too_large": ("Ảnh đại diện không được lớn hơn 2 MB.", 413),
        "avatar_empty": ("Tệp ảnh đang trống.", 400),
        "avatar_too_small": ("Ảnh đại diện phải có kích thước tối thiểu 32×32 pixel.", 400),
        "avatar_type_not_supported": ("Chỉ hỗ trợ ảnh JPG, PNG hoặc WebP.", 415),
        "avatar_invalid": ("Tệp đã chọn không phải ảnh hợp lệ hoặc đã bị hỏng.", 415),
    }
    message, status = messages.get(code, messages["avatar_invalid"])
    return api_error(message, status, code if code in messages else "avatar_invalid")


def clamp_int(value, default: int, minimum: int, maximum: int) -> int:
    try:
        return max(minimum, min(int(value), maximum))
    except (TypeError, ValueError):
        return default


def decimal_number(value, default: Decimal | None = None) -> Decimal | None:
    try:
        return Decimal(str(value))
    except (TypeError, ValueError, ArithmeticError):
        return default


def json_value(value):
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, datetime):
        return value.isoformat(timespec="seconds")
    return value


def serialize_row(row: dict | None) -> dict | None:
    if row is None:
        return None
    return {key: json_value(value) for key, value in row.items()}


def parse_images(value) -> list[str]:
    if isinstance(value, list):
        return [str(item) for item in value if str(item).strip()]
    if not value:
        return []
    try:
        parsed = json.loads(value)
        return [str(item) for item in parsed] if isinstance(parsed, list) else []
    except (TypeError, ValueError, json.JSONDecodeError):
        return []


def normalized_image_list(value) -> list[str]:
    images = []
    for item in parse_images(value)[:30]:
        url = normalize_public_url(item, allow_relative=True, max_length=700)
        if url and url not in images:
            images.append(url)
    return images


def serialize_product(row: dict) -> dict:
    product = serialize_row(row)
    product["HinhAnh"] = normalize_public_url(row.get("HinhAnh"), allow_relative=True, max_length=255) or "HA/cc-removebg-preview.png"
    product["AnhChiTiet"] = normalized_image_list(row.get("AnhChiTiet"))
    product["NguonURL"] = normalize_public_url(row.get("NguonURL"), allow_relative=False, max_length=700)
    product["MoTa"] = sanitize_rich_text(row.get("MoTa"))
    return product


def normalize_search_text(value) -> str:
    """Chuẩn hóa tiếng Việt để tìm không dấu và so khớp gần đúng."""
    text = str(value or "").strip().lower().replace("đ", "d")
    text = "".join(
        character for character in unicodedata.normalize("NFD", text)
        if unicodedata.category(character) != "Mn"
    )
    return " ".join(re.sub(r"[^a-z0-9]+", " ", text).split())


def fuzzy_product_score(keyword: str, product: dict) -> float:
    """Điểm 0..1 cho tên, thương hiệu và danh mục; chịu được lỗi gõ ngắn."""
    query = normalize_search_text(keyword)
    if not query:
        return 1.0
    name = normalize_search_text(product.get("TenSP"))
    brand = normalize_search_text(product.get("ThuongHieu"))
    category = normalize_search_text(product.get("TenDM"))
    searchable = " ".join(part for part in (name, brand, category) if part)
    if not searchable:
        return 0.0
    if query == name:
        return 1.0
    exact_score = 0.96 if query in name else 0.9 if query in searchable else 0.0
    sequence_score = SequenceMatcher(None, query, name or searchable).ratio() * 0.9
    field_tokens = searchable.split()
    token_scores = []
    for token in query.split():
        best = 0.0
        for candidate in field_tokens:
            ratio = SequenceMatcher(None, token, candidate).ratio()
            if candidate.startswith(token) or token.startswith(candidate):
                ratio = max(ratio, 0.92)
            elif token in candidate or candidate in token:
                ratio = max(ratio, 0.86)
            best = max(best, ratio)
        token_scores.append(best)
    token_score = (sum(token_scores) / len(token_scores) * 0.94) if token_scores else 0.0
    prefix_score = 0.88 if name.startswith(query) else 0.0
    return round(min(1.0, max(exact_score, sequence_score, token_score, prefix_score)), 4)


SEARCH_CATEGORY_ALIASES = {
    "vot": ("vot cau long",),
    "racket": ("vot cau long",),
    "giay": ("giay cau long",),
    "shoe": ("giay cau long",),
    "ao": ("ao cau long", "trang phuc"),
    "quan": ("quan cau long", "trang phuc"),
    "vay": ("vay cau long", "trang phuc"),
    "balo": ("balo", "tui va balo"),
    "tui": ("tui vot", "tui va balo"),
    "phu kien": ("phu kien",),
}


def product_category_intent(keyword: str, product: dict) -> int:
    """Ưu tiên danh mục người dùng gọi tên rõ ràng trong truy vấn.

    Ví dụ ``vợt lining`` phải xếp vợt Lining trước dây cước có chữ "vợt".
    Hàm trả về 2 cho khớp danh mục rõ ràng, 1 cho khớp tên và 0 nếu không có
    ý định danh mục. Điểm này đứng trước điểm fuzzy khi sắp xếp.
    """
    query = normalize_search_text(keyword)
    category = normalize_search_text(product.get("TenDM"))
    name = normalize_search_text(product.get("TenSP"))
    if not query:
        return 0

    # Sau khi bỏ dấu, "quấn cán" và "quần cán" đều gần thành "quan can".
    # Cụm hai từ này trong ngữ cảnh cầu lông luôn chỉ phụ kiện quấn cán;
    # không được diễn giải từ đầu tiên thành danh mục quần áo.
    if "quan can" in query:
        is_grip = "phu kien" in category or "quan can" in name or "cuon can" in name
        return 2 if is_grip else 0
    matched_aliases = []
    for alias, category_names in SEARCH_CATEGORY_ALIASES.items():
        if alias in query.split() or (" " in alias and alias in query):
            matched_aliases.extend(category_names)
    if not matched_aliases:
        return 0
    if any(expected in category or category in expected for expected in matched_aliases if category):
        return 2
    if any(name.startswith(expected) or f" {expected} " in f" {name} " for expected in matched_aliases):
        return 1
    return 0


def validate_password(password: str) -> tuple[bool, str]:
    if len(password) < 8:
        return False, "Mật khẩu phải có ít nhất 8 ký tự."
    if len(password) > 128:
        return False, "Mật khẩu không được dài quá 128 ký tự."
    if not re.search(r"[A-Za-zÀ-ỹ]", password) or not re.search(r"\d", password):
        return False, "Mật khẩu cần có ít nhất một chữ cái và một chữ số."
    return True, ""


def legacy_password_hash(password: str) -> str:
    return hashlib.sha256((password + LEGACY_PASSWORD_SALT).encode("utf-8")).hexdigest()


def verify_password(stored_hash: str, password: str) -> tuple[bool, bool]:
    """Trả về (hợp lệ, cần nâng cấp hash)."""
    if not stored_hash:
        return False, False
    if re.fullmatch(r"[0-9a-fA-F]{64}", stored_hash):
        valid = secrets.compare_digest(stored_hash.lower(), legacy_password_hash(password))
        return valid, valid
    try:
        return check_password_hash(stored_hash, password), False
    except (ValueError, TypeError):
        return False, False


def env_enabled(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def send_password_reset_email(recipient: str, display_name: str, token: str) -> None:
    """Gửi liên kết một lần; không bao giờ ghi token vào database dạng thô."""
    host = os.getenv("SMTP_HOST", "").strip()
    sender = os.getenv("SMTP_FROM", "").strip()
    if not host or not sender:
        raise RuntimeError("SMTP chưa được cấu hình")
    try:
        port = int(os.getenv("SMTP_PORT", "587"))
    except ValueError as exc:
        raise RuntimeError("SMTP_PORT không hợp lệ") from exc
    base_url = normalize_public_url(
        os.getenv("PUBLIC_BASE_URL", request.url_root).rstrip("/"),
        allow_relative=False,
    )
    if not base_url:
        raise RuntimeError("PUBLIC_BASE_URL không hợp lệ")
    reset_url = f"{base_url}/datlaimatkhau.html?token={token}"
    message = EmailMessage()
    message["Subject"] = "Đặt lại mật khẩu Badminton Store"
    message["From"] = sender
    message["To"] = recipient
    greeting = display_name.strip() or "bạn"
    message.set_content(
        f"Xin chào {greeting},\n\n"
        f"Mở liên kết sau để đặt lại mật khẩu (hết hạn sau {PASSWORD_RESET_MINUTES} phút):\n"
        f"{reset_url}\n\n"
        "Nếu bạn không yêu cầu thao tác này, hãy bỏ qua email. "
        "Không chia sẻ liên kết cho bất kỳ ai.\n"
    )
    username = os.getenv("SMTP_USERNAME", os.getenv("SMTP_USER", "")).strip()
    password = os.getenv("SMTP_PASSWORD", "")
    timeout = 12
    if env_enabled("SMTP_USE_SSL", env_enabled("SMTP_SSL")):
        with smtplib.SMTP_SSL(host, port, timeout=timeout, context=ssl.create_default_context()) as smtp:
            if username:
                smtp.login(username, password)
            smtp.send_message(message)
    else:
        with smtplib.SMTP(host, port, timeout=timeout) as smtp:
            smtp.ehlo()
            if env_enabled("SMTP_USE_STARTTLS", env_enabled("SMTP_STARTTLS", True)):
                smtp.starttls(context=ssl.create_default_context())
                smtp.ehlo()
            if username:
                smtp.login(username, password)
            smtp.send_message(message)
def bearer_token() -> str:
    header = request.headers.get("Authorization", "")
    if not header.lower().startswith("bearer "):
        return ""
    return header.split(" ", 1)[1].strip()


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_session(cursor, user_id: int) -> tuple[str, datetime]:
    token = secrets.token_urlsafe(48)
    expires_at = datetime.now() + timedelta(days=SESSION_DAYS)
    cursor.execute(
        """
        INSERT INTO PhienDangNhap
            (MaND, TokenHash, HetHan, DiaChiIP, UserAgent)
        VALUES (%s, %s, %s, %s, %s)
        """,
        (
            user_id,
            token_hash(token),
            expires_at,
            client_ip(),
            request.headers.get("User-Agent", "")[:255],
        ),
    )
    audit_id = cursor.lastrowid
    return token, expires_at


ADMIN_ROLES = {"admin", "superadmin"}


def _protected(required_role: str | None = None):
    def decorator(view):
        @wraps(view)
        def wrapped(*args, **kwargs):
            token = bearer_token()
            if not token:
                return api_error("Phiên đăng nhập không hợp lệ.", 401, "unauthorized")

            conn = get_db_connection()
            cursor = conn.cursor(dictionary=True)
            try:
                cursor.execute(
                    """
                    SELECT p.MaPhien, p.MaND, p.HetHan,
                           nd.TenDangNhap, nd.HoTen, nd.Email, nd.SoDienThoai,
                           nd.DiaChi, nd.Avatar, nd.SoDu, nd.VaiTro, nd.TrangThai,
                           nd.NgayTaoTaiKhoan
                    FROM PhienDangNhap p
                    JOIN NguoiDung nd ON nd.MaND = p.MaND
                    WHERE p.TokenHash = %s
                      AND p.DaThuHoi = 0
                      AND p.HetHan > NOW()
                      AND nd.TrangThai = 1
                    LIMIT 1
                    """,
                    (token_hash(token),),
                )
                user = cursor.fetchone()
                if not user:
                    return api_error("Phiên đăng nhập đã hết hạn.", 401, "session_expired")
                user_role = user.get("VaiTro") or "user"
                has_required_role = (
                    user_role in ADMIN_ROLES if required_role == "admin" else user_role == required_role
                )
                if required_role and not has_required_role:
                    return api_error("Bạn không có quyền thực hiện thao tác này.", 403, "forbidden")

                # Không ghi DB ở mọi request; cập nhật tối đa một lần mỗi 5 phút.
                cursor.execute(
                    """UPDATE PhienDangNhap SET LanHoatDongCuoi = NOW()
                       WHERE MaPhien = %s
                         AND LanHoatDongCuoi < NOW() - INTERVAL 5 MINUTE""",
                    (user["MaPhien"],),
                )
                conn.commit()
                g.current_user = user
                g.session_id = user["MaPhien"]
                g.current_token_hash = token_hash(token)
            except mysql.connector.Error:
                conn.rollback()
                app.logger.exception("Không thể xác thực phiên đăng nhập")
                return api_error(
                    "Cơ sở dữ liệu chưa sẵn sàng. Hãy chạy migration mới.",
                    503,
                    "database_not_ready",
                )
            finally:
                cursor.close()
                conn.close()
            return view(*args, **kwargs)

        return wrapped

    return decorator


auth_required = _protected()
admin_required = _protected("admin")
superadmin_required = _protected("superadmin")


def is_superadmin() -> bool:
    return bool(getattr(g, "current_user", None)) and g.current_user.get("VaiTro") == "superadmin"


def audit_admin(cursor, action: str, entity: str, entity_id=None, details=None, before=None, after=None):
    cursor.execute(
        """
        INSERT INTO NhatKyQuanTri (MaND, HanhDong, DoiTuong, MaDoiTuong, ChiTiet, DiaChiIP)
        VALUES (%s, %s, %s, %s, %s, %s)
        """,
        (
            g.current_user["MaND"],
            action[:80],
            entity[:50],
            str(entity_id)[:64] if entity_id is not None else None,
            json.dumps(details or {}, ensure_ascii=False, default=str),
            client_ip(),
        ),
    )
    audit_id = cursor.lastrowid
    # Luôn lưu snapshot trước/sau. Admin thường cần Super Admin xem xét; thao tác do
    # Super Admin thực hiện được đánh dấu đã xác nhận ngay nhưng vẫn có lịch sử đối chiếu.
    if before is not None or after is not None or details:
        superadmin_action = is_superadmin()
        cursor.execute(
            """
            INSERT INTO PheDuyetThayDoi
                (MaNhatKy,MaAdmin,HanhDong,DoiTuong,MaDoiTuong,DuLieuTruoc,DuLieuSau,
                 TrangThai,MaSuperAdmin,GhiChu,NgayXuLy)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            """,
            (
                audit_id, g.current_user["MaND"], action[:80], entity[:50],
                str(entity_id)[:64] if entity_id is not None else None,
                json.dumps(before, ensure_ascii=False, default=str) if before is not None else None,
                json.dumps(after if after is not None else details or {}, ensure_ascii=False, default=str),
                "DA_XAC_NHAN" if superadmin_action else "CHO_XEM",
                g.current_user["MaND"] if superadmin_action else None,
                "Thao tác được thực hiện trực tiếp bởi Super Admin." if superadmin_action else None,
                datetime.now() if superadmin_action else None,
            ),
        )


def slugify(value: str) -> str:
    normalized = unicodedata.normalize("NFD", value)
    ascii_text = "".join(char for char in normalized if unicodedata.category(char) != "Mn")
    ascii_text = ascii_text.replace("đ", "d").replace("Đ", "D").lower()
    return re.sub(r"[^a-z0-9]+", "-", ascii_text).strip("-")[:160]


# Phục vụ giao diện và API trên cùng một cổng để dùng được qua một tunnel.
@app.get("/")
def storefront_index():
    return send_from_directory(PROJECT_ROOT, "trangchu.html")


@app.get("/<path:public_path>")
def storefront_file(public_path: str):
    normalized = public_path.replace("\\", "/").lstrip("/")
    extension = os.path.splitext(normalized)[1].lower()
    if extension not in PUBLIC_FILE_EXTENSIONS:
        abort(404)
    # Chỉ công khai trang HTML ở thư mục gốc và tài nguyên trong css/ hoặc HA/.
    if "/" in normalized and not normalized.startswith(("css/", "HA/")):
        abort(404)
    return send_from_directory(PROJECT_ROOT, normalized)


@app.after_request
def security_headers(response):
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "SAMEORIGIN")
    response.headers.setdefault("X-Permitted-Cross-Domain-Policies", "none")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
    response.headers.setdefault("Cross-Origin-Opener-Policy", "same-origin")
    response.headers.setdefault("Cross-Origin-Resource-Policy", "same-origin")

    connect_sources = "'self'"
    if not request.is_secure:
        connect_sources += " http://127.0.0.1:5000 http://localhost:5000"
    csp = (
        "default-src 'self'; "
        "base-uri 'self'; object-src 'none'; frame-ancestors 'self'; form-action 'self'; "
        "script-src 'self' 'unsafe-inline' https://unpkg.com; "
        "style-src 'self' 'unsafe-inline' https://unpkg.com; "
        "img-src 'self' data: blob: https:; font-src 'self' data:; "
        f"connect-src {connect_sources}; frame-src 'none'"
    )
    if request.is_secure:
        csp += "; upgrade-insecure-requests"
    response.headers.setdefault("Content-Security-Policy", csp)

    path = request.path.lower()
    if path.startswith("/api/") or request.headers.get("Authorization"):
        # Không để proxy/trình duyệt lưu dữ liệu tài khoản, admin hoặc đơn hàng.
        response.headers["Cache-Control"] = "no-store"
        response.headers["Pragma"] = "no-cache"
    elif path == "/" or path.endswith(".html"):
        response.headers["Cache-Control"] = "no-cache, max-age=0, must-revalidate"
    elif path.endswith((".css", ".js")):
        response.headers["Cache-Control"] = "public, max-age=3600, stale-while-revalidate=86400"
    elif path.endswith((".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".ico", ".avif")):
        response.headers["Cache-Control"] = "public, max-age=86400, stale-while-revalidate=604800"
    if request.is_secure:
        response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
    return response


@app.get("/api/health")
def health():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT 1")
        cursor.fetchone()
        return jsonify({"success": True, "status": "ok"})
    except mysql.connector.Error:
        return api_error("Không thể kết nối cơ sở dữ liệu.", 503, "database_unavailable")
    finally:
        if "cursor" in locals():
            cursor.close()
        if "conn" in locals() and conn.is_connected():
            conn.close()


# ---------------------------------------------------------------------------
# Xác thực và tài khoản
# ---------------------------------------------------------------------------


@app.post("/api/dang-nhap")
def login():
    data = body_json()
    identity = str(data.get("username", "")).strip()
    password = str(data.get("password", ""))
    if not identity or not password:
        return api_error("Vui lòng nhập tài khoản và mật khẩu.")
    limited = enforce_rate_limit("login-ip", client_ip(), 20, 60)
    if limited:
        return limited
    identity_key = hashlib.sha256(identity.casefold().encode("utf-8")).hexdigest()
    limited = enforce_rate_limit("login-identity", identity_key, 10, 15 * 60)
    if limited:
        return limited

    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            """
            SELECT MaND, TenDangNhap, MatKhau, HoTen, Email, Avatar, VaiTro, TrangThai,
                   SoLanDangNhapSai, KhoaDen
            FROM NguoiDung
            WHERE LOWER(TenDangNhap) = LOWER(%s) OR LOWER(Email) = LOWER(%s)
            LIMIT 1
            """,
            (identity, identity),
        )
        user = cursor.fetchone()
        generic_error = "Tài khoản hoặc mật khẩu không chính xác."
        if not user:
            # Cân bằng phần lớn chi phí kiểm tra để giảm lộ tài khoản qua timing.
            check_password_hash(DUMMY_PASSWORD_HASH, password)
            return api_error(generic_error, 401, "invalid_credentials")
        if not user.get("TrangThai"):
            return api_error("Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên.", 423, "account_locked")

        now = datetime.now()
        if user.get("KhoaDen") and user["KhoaDen"] > now:
            seconds = max(1, int((user["KhoaDen"] - now).total_seconds()))
            return (
                jsonify(
                    {
                        "success": False,
                        "message": "Tài khoản tạm khóa do đăng nhập sai nhiều lần.",
                        "code": "too_many_attempts",
                        "retry_after": seconds,
                    }
                ),
                429,
            )

        valid, needs_upgrade = verify_password(user["MatKhau"], password)
        if not valid:
            attempts = int(user.get("SoLanDangNhapSai") or 0) + 1
            lock_until = now + timedelta(minutes=LOGIN_LOCK_MINUTES) if attempts >= LOGIN_MAX_ATTEMPTS else None
            cursor.execute(
                "UPDATE NguoiDung SET SoLanDangNhapSai = %s, KhoaDen = %s WHERE MaND = %s",
                (attempts, lock_until, user["MaND"]),
            )
            conn.commit()
            return api_error(generic_error, 401, "invalid_credentials")

        if needs_upgrade:
            cursor.execute(
                "UPDATE NguoiDung SET MatKhau = %s WHERE MaND = %s",
                (generate_password_hash(password), user["MaND"]),
            )
        cursor.execute(
            """
            UPDATE NguoiDung
            SET SoLanDangNhapSai = 0, KhoaDen = NULL, LanDangNhapCuoi = NOW()
            WHERE MaND = %s
            """,
            (user["MaND"],),
        )
        token, expires_at = create_session(cursor, user["MaND"])
        conn.commit()
        return jsonify(
            {
                "success": True,
                "message": "Đăng nhập thành công.",
                "access_token": token,
                "expires_at": expires_at.isoformat(timespec="seconds"),
                "user": {
                    "id": user["MaND"],
                    "username": user["TenDangNhap"],
                    "fullname": user.get("HoTen") or user["TenDangNhap"],
                    "email": user.get("Email"),
                    "avatar": user.get("Avatar") or "",
                    "role": user.get("VaiTro") or "user",
                },
                # Các khóa cũ được giữ để frontend cũ không vỡ.
                "username": user["TenDangNhap"],
                "role": user.get("VaiTro") or "user",
            }
        )
    except mysql.connector.Error:
        conn.rollback()
        app.logger.exception("Lỗi đăng nhập")
        return api_error("Không thể đăng nhập lúc này.", 503, "database_error")
    finally:
        cursor.close()
        conn.close()


@app.post("/api/quen-mat-khau")
def forgot_password():
    limited = enforce_rate_limit("forgot_password_ip", client_ip(), 6, 3600)
    if limited:
        return limited
    email = str(body_json().get("email", "")).strip().lower()[:120]
    generic_message = (
        "Nếu email tồn tại, hệ thống đã gửi liên kết đặt lại mật khẩu. "
        "Vui lòng kiểm tra cả thư mục spam."
    )
    if not EMAIL_RE.fullmatch(email):
        # Phản hồi giống tài khoản tồn tại để tránh dò email đăng ký.
        return jsonify({"success": True, "message": generic_message}), 202
    identity_key = hashlib.sha256(email.encode("utf-8")).hexdigest()
    limited = enforce_rate_limit("forgot_password_identity", identity_key, 3, 3600)
    if limited:
        return limited

    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    stored_hash = ""
    try:
        cursor.execute(
            "SELECT MaND,HoTen,Email FROM NguoiDung WHERE LOWER(Email)=LOWER(%s) "
            "AND TrangThai=1 LIMIT 1",
            (email,),
        )
        user = cursor.fetchone()
        if user:
            raw_token = secrets.token_urlsafe(48)
            stored_hash = token_hash(raw_token)
            cursor.execute(
                "UPDATE DatLaiMatKhau SET DaSuDung=1 WHERE MaND=%s AND DaSuDung=0",
                (user["MaND"],),
            )
            cursor.execute(
                """INSERT INTO DatLaiMatKhau
                   (MaND,TokenHash,HetHan,DiaChiIP)
                   VALUES (%s,%s,DATE_ADD(NOW(), INTERVAL %s MINUTE),%s)""",
                (user["MaND"], stored_hash, PASSWORD_RESET_MINUTES, client_ip()),
            )
            conn.commit()
            try:
                send_password_reset_email(user["Email"], user.get("HoTen") or "", raw_token)
            except Exception:
                app.logger.exception("Không thể gửi email đặt lại mật khẩu")
                cursor.execute("DELETE FROM DatLaiMatKhau WHERE TokenHash=%s", (stored_hash,))
                conn.commit()
    except mysql.connector.Error:
        conn.rollback()
        app.logger.exception("Lỗi tạo yêu cầu đặt lại mật khẩu")
    finally:
        cursor.close()
        conn.close()
    return jsonify({"success": True, "message": generic_message}), 202


@app.post("/api/dat-lai-mat-khau")
def reset_password():
    limited = enforce_rate_limit("reset_password_ip", client_ip(), 10, 3600)
    if limited:
        return limited
    data = body_json()
    raw_token = str(data.get("token", "")).strip()
    password = str(data.get("password", ""))
    if len(raw_token) < 40 or len(raw_token) > 200:
        return api_error("Liên kết đặt lại mật khẩu không hợp lệ.", 400, "invalid_reset_token")
    valid_password, password_message = validate_password(password)
    if not valid_password:
        return api_error(password_message)

    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        conn.start_transaction()
        cursor.execute(
            """SELECT dl.MaYeuCau,dl.MaND
               FROM DatLaiMatKhau dl JOIN NguoiDung nd ON nd.MaND=dl.MaND
               WHERE dl.TokenHash=%s AND dl.DaSuDung=0 AND dl.HetHan>NOW()
                 AND nd.TrangThai=1
               LIMIT 1 FOR UPDATE""",
            (token_hash(raw_token),),
        )
        reset_request = cursor.fetchone()
        if not reset_request:
            conn.rollback()
            return api_error(
                "Liên kết đã hết hạn hoặc đã được sử dụng.",
                410,
                "reset_token_expired",
            )
        cursor.execute(
            """UPDATE NguoiDung
               SET MatKhau=%s,SoLanDangNhapSai=0,KhoaDen=NULL
               WHERE MaND=%s""",
            (generate_password_hash(password), reset_request["MaND"]),
        )
        cursor.execute(
            "UPDATE DatLaiMatKhau SET DaSuDung=1 WHERE MaND=%s AND DaSuDung=0",
            (reset_request["MaND"],),
        )
        cursor.execute(
            "UPDATE PhienDangNhap SET DaThuHoi=1 WHERE MaND=%s AND DaThuHoi=0",
            (reset_request["MaND"],),
        )
        conn.commit()
        return jsonify(
            {
                "success": True,
                "message": "Đã đặt lại mật khẩu. Bạn có thể đăng nhập bằng mật khẩu mới.",
            }
        )
    except mysql.connector.Error:
        conn.rollback()
        app.logger.exception("Lỗi đặt lại mật khẩu")
        return api_error("Không thể đặt lại mật khẩu lúc này.", 503, "database_error")
    finally:
        cursor.close()
        conn.close()


@app.post("/api/dang-ky")
def register():
    data = body_json()
    username = str(data.get("username", "")).strip()
    password = str(data.get("password", ""))
    fullname = str(data.get("fullname", "")).strip()
    email = str(data.get("email", "")).strip().lower()
    phone = str(data.get("phone", "")).strip()

    if not USERNAME_RE.fullmatch(username):
        return api_error("Tên đăng nhập cần 3–30 ký tự, chỉ gồm chữ, số hoặc dấu gạch dưới.")
    if len(fullname) < 2 or len(fullname) > 100:
        return api_error("Họ tên cần từ 2 đến 100 ký tự.")
    if len(email) > 100 or not EMAIL_RE.fullmatch(email):
        return api_error("Email không hợp lệ.")
    if phone and not PHONE_RE.fullmatch(phone):
        return api_error("Số điện thoại Việt Nam không hợp lệ.")
    password_ok, password_message = validate_password(password)
    if not password_ok:
        return api_error(password_message)
    limited = enforce_rate_limit("register-ip", client_ip(), 5, 60 * 60)
    if limited:
        return limited

    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            """
            INSERT INTO NguoiDung
                (TenDangNhap, MatKhau, HoTen, Email, SoDienThoai, VaiTro, TrangThai)
            VALUES (%s, %s, %s, %s, %s, 'user', 1)
            """,
            (username, generate_password_hash(password), fullname, email, phone or None),
        )
        conn.commit()
        return jsonify({"success": True, "message": "Tạo tài khoản thành công."}), 201
    except IntegrityError:
        conn.rollback()
        return api_error("Tên đăng nhập hoặc email đã được sử dụng.", 409, "duplicate_account")
    except mysql.connector.Error:
        conn.rollback()
        app.logger.exception("Lỗi đăng ký")
        return api_error("Không thể tạo tài khoản lúc này.", 503, "database_error")
    finally:
        cursor.close()
        conn.close()


@app.post("/api/dang-xuat")
@auth_required
def logout():
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("UPDATE PhienDangNhap SET DaThuHoi = 1 WHERE MaPhien = %s", (g.session_id,))
        conn.commit()
        return jsonify({"success": True, "message": "Đã đăng xuất."})
    finally:
        cursor.close()
        conn.close()


@app.post("/api/dang-xuat-tat-ca")
@auth_required
def logout_all():
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("UPDATE PhienDangNhap SET DaThuHoi = 1 WHERE MaND = %s", (g.current_user["MaND"],))
        conn.commit()
        return jsonify({"success": True, "message": "Đã đăng xuất khỏi tất cả thiết bị."})
    finally:
        cursor.close()
        conn.close()


@app.route("/api/me", methods=["GET", "POST"])
@app.route("/api/thong-tin-user", methods=["GET", "POST"])
@auth_required
def current_user_info():
    user_id = g.current_user["MaND"]
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            """
            SELECT COUNT(*) AS TongDon,
                   SUM(TrangThai IN ('CHO_XAC_NHAN','DANG_GIAO')) AS DonDangXuLy,
                   COALESCE(SUM(CASE WHEN TrangThai = 'HOAN_THANH' THEN TongTien ELSE 0 END), 0) AS TongDaMua
            FROM DonHang WHERE MaND = %s
            """,
            (user_id,),
        )
        stats = cursor.fetchone()
        user = g.current_user
        payload = {
            "isLoggedIn": True,
            "id": user_id,
            "username": user["TenDangNhap"],
            "fullname": user.get("HoTen") or user["TenDangNhap"],
            "email": user.get("Email") or "",
            "phone": user.get("SoDienThoai") or "",
            "address": user.get("DiaChi") or "",
            "avatar": user.get("Avatar") or "",
            "balance": float(user.get("SoDu") or 0),
            "role": user.get("VaiTro") or "user",
            "created_at": json_value(user.get("NgayTaoTaiKhoan")),
            "stats": {
                "orders": int(stats.get("TongDon") or 0),
                "processing": int(stats.get("DonDangXuLy") or 0),
                "spent": float(stats.get("TongDaMua") or 0),
            },
        }
        return jsonify({"success": True, **payload, "user": payload})
    finally:
        cursor.close()
        conn.close()


@app.post("/api/cap-nhat-thong-tin")
@auth_required
def update_profile():
    data = body_json()
    fullname = str(data.get("fullname", "")).strip()
    email = str(data.get("email", "")).strip().lower()
    phone = str(data.get("phone", "")).strip()
    address = str(data.get("address", "")).strip()
    if len(fullname) < 2 or len(fullname) > 100:
        return api_error("Họ tên cần từ 2 đến 100 ký tự.")
    if len(email) > 100 or not EMAIL_RE.fullmatch(email):
        return api_error("Email không hợp lệ.")
    if phone and not PHONE_RE.fullmatch(phone):
        return api_error("Số điện thoại không hợp lệ.")
    if len(address) > 500:
        return api_error("Địa chỉ không được dài quá 500 ký tự.")

    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            """
            UPDATE NguoiDung SET HoTen = %s, Email = %s, SoDienThoai = %s, DiaChi = %s
            WHERE MaND = %s
            """,
            (fullname, email, phone or None, address or None, g.current_user["MaND"]),
        )
        conn.commit()
        return jsonify({"success": True, "message": "Đã cập nhật hồ sơ."})
    except IntegrityError:
        conn.rollback()
        return api_error("Email đã được một tài khoản khác sử dụng.", 409, "duplicate_email")
    finally:
        cursor.close()
        conn.close()


@app.post("/api/cap-nhat-anh-dai-dien")
@auth_required
def update_avatar():
    uploaded = request.files.get("avatar")
    if not uploaded or not uploaded.filename:
        return api_error("Vui lòng chọn một ảnh đại diện.")
    try:
        image_data = normalized_avatar(uploaded)
    except ValueError as error:
        return avatar_validation_error(error)
    try:
        relative_path = save_avatar(g.current_user["MaND"], image_data)
    except MediaStorageError:
        app.logger.exception("Không thể lưu ảnh đại diện")
        return api_error("Kho ảnh đang tạm thời không khả dụng.", 503, "media_storage_unavailable")
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT Avatar FROM NguoiDung WHERE MaND=%s FOR UPDATE", (g.current_user["MaND"],))
        old_avatar = (cursor.fetchone() or {}).get("Avatar")
        cursor.execute("UPDATE NguoiDung SET Avatar=%s WHERE MaND=%s", (relative_path, g.current_user["MaND"]))
        conn.commit()
    except Exception:
        conn.rollback()
        delete_avatar(relative_path)
        raise
    finally:
        cursor.close()
        conn.close()
    delete_avatar(old_avatar)
    return jsonify({"success": True, "message": "Đã cập nhật ảnh đại diện.", "avatar": relative_path})


@app.post("/api/doi-mat-khau")
@auth_required
def change_password():
    data = body_json()
    old_password = str(data.get("old_password", ""))
    new_password = str(data.get("new_password", ""))
    valid, message = validate_password(new_password)
    if not valid:
        return api_error(message)
    if old_password == new_password:
        return api_error("Mật khẩu mới phải khác mật khẩu hiện tại.")

    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT MatKhau FROM NguoiDung WHERE MaND = %s FOR UPDATE", (g.current_user["MaND"],))
        user = cursor.fetchone()
        password_ok, _ = verify_password(user["MatKhau"], old_password)
        if not password_ok:
            return api_error("Mật khẩu hiện tại không chính xác.", 401, "invalid_password")
        cursor.execute(
            "UPDATE NguoiDung SET MatKhau = %s WHERE MaND = %s",
            (generate_password_hash(new_password), g.current_user["MaND"]),
        )
        cursor.execute(
            "UPDATE PhienDangNhap SET DaThuHoi = 1 WHERE MaND = %s AND MaPhien <> %s",
            (g.current_user["MaND"], g.session_id),
        )
        conn.commit()
        return jsonify({"success": True, "message": "Đã đổi mật khẩu và đăng xuất các thiết bị khác."})
    finally:
        cursor.close()
        conn.close()


@app.get("/api/phien-dang-nhap")
@auth_required
def list_sessions():
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            """
            SELECT MaPhien, NgayTao, HetHan, LanHoatDongCuoi, DiaChiIP, UserAgent
            FROM PhienDangNhap
            WHERE MaND = %s AND DaThuHoi = 0 AND HetHan > NOW()
            ORDER BY LanHoatDongCuoi DESC
            """,
            (g.current_user["MaND"],),
        )
        sessions = []
        for row in cursor.fetchall():
            item = serialize_row(row)
            item["is_current"] = row["MaPhien"] == g.session_id
            sessions.append(item)
        return jsonify({"success": True, "sessions": sessions})
    finally:
        cursor.close()
        conn.close()


@app.delete("/api/phien-dang-nhap/<int:session_id>")
@auth_required
def revoke_session(session_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "UPDATE PhienDangNhap SET DaThuHoi = 1 WHERE MaPhien = %s AND MaND = %s",
            (session_id, g.current_user["MaND"]),
        )
        conn.commit()
        return jsonify({"success": True, "message": "Đã thu hồi phiên đăng nhập."})
    finally:
        cursor.close()
        conn.close()


# ---------------------------------------------------------------------------
# Ví, giỏ hàng và đơn hàng
# ---------------------------------------------------------------------------


@app.route("/api/nap-tien", methods=["POST"])
@app.route("/api/nap-tien/tao-yeu-cau", methods=["POST"])
@auth_required
def create_deposit_request():
    data = body_json()
    amount = decimal_number(data.get("amount"))
    if amount is None or amount < Decimal("10000") or amount > Decimal("50000000"):
        return api_error("Số tiền yêu cầu phải từ 10.000 ₫ đến 50.000.000 ₫.")
    limited = enforce_rate_limit("deposit-user", str(g.current_user["MaND"]), 5, 60 * 60)
    if limited:
        return limited
    reference = f"NAP-{g.current_user['MaND']}-{secrets.token_hex(4).upper()}"
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "SELECT COUNT(*) FROM YeuCauNapTien WHERE MaND = %s AND TrangThai = 'CHO_DUYET'",
            (g.current_user["MaND"],),
        )
        if int(cursor.fetchone()[0]) >= 3:
            return api_error(
                "Bạn đang có 3 yêu cầu chờ duyệt. Vui lòng chờ admin đối soát.",
                429,
                "too_many_pending_deposits",
            )
        cursor.execute(
            """
            INSERT INTO YeuCauNapTien (MaND, SoTien, MaThamChieu, TrangThai)
            VALUES (%s, %s, %s, 'CHO_DUYET')
            """,
            (g.current_user["MaND"], amount, reference),
        )
        request_id = cursor.lastrowid
        conn.commit()
        return (
            jsonify(
                {
                    "success": True,
                    "message": "Đã gửi yêu cầu. Số dư chỉ được cộng sau khi admin đối soát.",
                    "request": {"id": request_id, "reference": reference, "amount": float(amount), "status": "CHO_DUYET"},
                }
            ),
            201,
        )
    finally:
        cursor.close()
        conn.close()


@app.get("/api/yeu-cau-nap-tien")
@auth_required
def user_deposit_requests():
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            """
            SELECT MaYeuCau, SoTien, MaThamChieu, TrangThai, NgayTao, NgayXuLy, GhiChuAdmin
            FROM YeuCauNapTien WHERE MaND = %s ORDER BY NgayTao DESC LIMIT 50
            """,
            (g.current_user["MaND"],),
        )
        return jsonify({"success": True, "requests": [serialize_row(row) for row in cursor.fetchall()]})
    finally:
        cursor.close()
        conn.close()


@app.get("/api/lich-su-giao-dich")
@auth_required
def transaction_history():
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            """
            SELECT MaGD, LoaiGiaoDich, SoTien, MoTa, NgayGD
            FROM LichSuGiaoDich WHERE MaND = %s ORDER BY NgayGD DESC LIMIT 100
            """,
            (g.current_user["MaND"],),
        )
        return jsonify({"success": True, "transactions": [serialize_row(row) for row in cursor.fetchall()]})
    finally:
        cursor.close()
        conn.close()


@app.post("/api/gio-hang/them")
@auth_required
def add_to_cart():
    data = body_json()
    product_id = clamp_int(data.get("ma_san_pham"), 0, 0, 2_000_000_000)
    quantity = clamp_int(data.get("so_luong"), 1, 1, 99)
    if not product_id:
        return api_error("Sản phẩm không hợp lệ.")

    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT TonKho, TrangThai FROM SanPham WHERE MaSP = %s", (product_id,))
        product = cursor.fetchone()
        if not product or not product["TrangThai"]:
            return api_error("Sản phẩm không tồn tại hoặc đang tạm ẩn.", 404, "product_not_found")
        cursor.execute(
            "SELECT SoLuong FROM GioHang WHERE MaND = %s AND MaSP = %s",
            (g.current_user["MaND"], product_id),
        )
        current = cursor.fetchone()
        desired = quantity + (int(current["SoLuong"]) if current else 0)
        if desired > int(product["TonKho"]):
            return api_error("Số lượng trong giỏ vượt quá tồn kho.", 409, "insufficient_stock")
        cursor.execute(
            """
            INSERT INTO GioHang (MaND, MaSP, SoLuong)
            VALUES (%s, %s, %s)
            ON DUPLICATE KEY UPDATE SoLuong = VALUES(SoLuong)
            """,
            (g.current_user["MaND"], product_id, desired),
        )
        conn.commit()
        return jsonify({"success": True, "message": "Đã thêm sản phẩm vào giỏ hàng.", "quantity": desired})
    finally:
        cursor.close()
        conn.close()


@app.post("/api/gio-hang/cap-nhat")
@auth_required
def update_cart():
    data = body_json()
    product_id = clamp_int(data.get("ma_san_pham"), 0, 0, 2_000_000_000)
    quantity = clamp_int(data.get("so_luong"), 0, 0, 99)
    if not product_id:
        return api_error("Sản phẩm không hợp lệ.")
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        if quantity == 0:
            cursor.execute("DELETE FROM GioHang WHERE MaND = %s AND MaSP = %s", (g.current_user["MaND"], product_id))
        else:
            cursor.execute("SELECT TonKho, TrangThai FROM SanPham WHERE MaSP = %s", (product_id,))
            product = cursor.fetchone()
            if not product or not product["TrangThai"]:
                return api_error("Sản phẩm không tồn tại.", 404, "product_not_found")
            if quantity > int(product["TonKho"]):
                return api_error("Số lượng vượt quá tồn kho.", 409, "insufficient_stock")
            cursor.execute(
                """
                INSERT INTO GioHang (MaND, MaSP, SoLuong) VALUES (%s, %s, %s)
                ON DUPLICATE KEY UPDATE SoLuong = VALUES(SoLuong)
                """,
                (g.current_user["MaND"], product_id, quantity),
            )
        conn.commit()
        return jsonify({"success": True, "message": "Đã cập nhật giỏ hàng."})
    finally:
        cursor.close()
        conn.close()


@app.post("/api/gio-hang")
@auth_required
def view_cart():
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            """
            SELECT g.MaSP, sp.TenSP, sp.GiaBan, sp.HinhAnh, sp.TonKho,
                   g.SoLuong, (sp.GiaBan * g.SoLuong) AS ThanhTien
            FROM GioHang g
            JOIN SanPham sp ON sp.MaSP = g.MaSP
            WHERE g.MaND = %s AND sp.TrangThai = 1
            ORDER BY g.NgayThem DESC
            """,
            (g.current_user["MaND"],),
        )
        items = [serialize_row(row) for row in cursor.fetchall()]
        total = sum(Decimal(str(item["ThanhTien"])) for item in items)
        return jsonify({"success": True, "items": items, "total": float(total)})
    finally:
        cursor.close()
        conn.close()


@app.get("/api/yeu-thich")
@auth_required
def wishlist():
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            """SELECT sp.*,dm.TenDM,yt.NgayThem
               FROM YeuThich yt
               JOIN SanPham sp ON sp.MaSP=yt.MaSP
               LEFT JOIN DanhMuc dm ON dm.MaDM=sp.MaDM
               WHERE yt.MaND=%s AND sp.TrangThai=1
               ORDER BY yt.NgayThem DESC""",
            (g.current_user["MaND"],),
        )
        return jsonify(
            {"success": True, "products": [serialize_product(row) for row in cursor.fetchall()]}
        )
    finally:
        cursor.close()
        conn.close()


@app.post("/api/yeu-thich/<int:product_id>")
@auth_required
def add_wishlist_item(product_id):
    limited = enforce_rate_limit(
        "wishlist_user", str(g.current_user["MaND"]), 60, 60
    )
    if limited:
        return limited
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "SELECT 1 FROM SanPham WHERE MaSP=%s AND TrangThai=1 LIMIT 1",
            (product_id,),
        )
        if not cursor.fetchone():
            return api_error("Sản phẩm không tồn tại hoặc đang tạm ẩn.", 404, "product_not_found")
        cursor.execute(
            "INSERT IGNORE INTO YeuThich (MaND,MaSP) VALUES (%s,%s)",
            (g.current_user["MaND"], product_id),
        )
        conn.commit()
        return jsonify({"success": True, "liked": True, "message": "Đã lưu sản phẩm yêu thích."})
    finally:
        cursor.close()
        conn.close()


@app.delete("/api/yeu-thich/<int:product_id>")
@auth_required
def remove_wishlist_item(product_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "DELETE FROM YeuThich WHERE MaND=%s AND MaSP=%s",
            (g.current_user["MaND"], product_id),
        )
        conn.commit()
        return jsonify({"success": True, "liked": False, "message": "Đã bỏ khỏi danh sách yêu thích."})
    finally:
        cursor.close()
        conn.close()


def voucher_discount(
    cursor, code: str, subtotal: Decimal, user_id: int | None = None
) -> tuple[Decimal, dict | None]:
    if not code:
        return Decimal("0"), None
    cursor.execute(
        """
        SELECT * FROM Voucher
        WHERE MaVoucher = %s AND TrangThai = 1
          AND (NgayBatDau IS NULL OR NgayBatDau <= NOW())
          AND (NgayHetHan IS NULL OR NgayHetHan >= NOW())
          AND DaSuDung < SoLuong
        FOR UPDATE
        """,
        (code.upper(),),
    )
    voucher = cursor.fetchone()
    if not voucher or subtotal < Decimal(voucher.get("DonToiThieu") or 0):
        return Decimal("0"), None
    if user_id is not None:
        cursor.execute(
            "SELECT 1 FROM SuDungVoucher WHERE MaND=%s AND MaVoucher=%s LIMIT 1",
            (user_id, voucher["MaVoucher"]),
        )
        if cursor.fetchone():
            return Decimal("0"), None
    if voucher["LoaiGiam"] == "PHAN_TRAM":
        discount = subtotal * Decimal(voucher["GiaTri"]) / Decimal("100")
        if voucher.get("GiamToiDa") is not None:
            discount = min(discount, Decimal(voucher["GiamToiDa"]))
    else:
        discount = Decimal(voucher["GiaTri"])
    return min(subtotal, discount.quantize(Decimal("0.01"))), voucher


@app.post("/api/voucher/kiem-tra")
@auth_required
def validate_voucher():
    code = str(body_json().get("voucher", "")).strip().upper()
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            """SELECT COALESCE(SUM(sp.GiaBan * gh.SoLuong), 0) AS subtotal
               FROM GioHang gh JOIN SanPham sp ON sp.MaSP=gh.MaSP
               WHERE gh.MaND=%s AND sp.TrangThai=1""",
            (g.current_user["MaND"],),
        )
        subtotal = Decimal(cursor.fetchone()["subtotal"] or 0)
        if subtotal <= 0:
            return api_error("Giỏ hàng đang trống.", 409, "empty_cart")
        discount, voucher = voucher_discount(cursor, code, subtotal, g.current_user["MaND"])
        conn.rollback()
        if not voucher:
            return api_error("Voucher không tồn tại, đã hết hạn, hết lượt hoặc chưa đủ giá trị đơn hàng.", 404, "invalid_voucher")
        return jsonify({
            "success": True, "voucher": voucher["MaVoucher"],
            "subtotal": float(subtotal), "discount": float(discount),
            "total": float(subtotal - discount),
            "message": f"Áp dụng {voucher['MaVoucher']} thành công, giảm {float(discount):,.0f} ₫.",
        })
    finally:
        cursor.close(); conn.close()


@app.route("/api/admin/vouchers", methods=["GET", "POST"])
@admin_required
def admin_vouchers():
    conn = get_db_connection(); cursor = conn.cursor(dictionary=True)
    try:
        if request.method == "GET":
            cursor.execute("SELECT * FROM Voucher ORDER BY TrangThai DESC, NgayHetHan DESC, MaVoucher")
            return jsonify({"success": True, "items": [serialize_row(row) for row in cursor.fetchall()]})
        data = body_json(); code = str(data.get("code", "")).strip().upper()
        kind = str(data.get("type", "PHAN_TRAM")).upper()
        value = decimal_number(data.get("value")); minimum = decimal_number(data.get("minimum", 0)) or Decimal(0)
        maximum = decimal_number(data.get("maximum")); quantity = int(data.get("quantity", 100) or 0)
        if not re.fullmatch(r"[A-Z0-9_-]{3,20}", code): return api_error("Mã voucher cần 3–20 ký tự A-Z, số, _ hoặc -.")
        if kind not in {"PHAN_TRAM", "SO_TIEN"} or value is None or value <= 0: return api_error("Giá trị giảm không hợp lệ.")
        if kind == "PHAN_TRAM" and value > 100: return api_error("Mức giảm phần trăm không được vượt quá 100%.")
        if quantity < 1: return api_error("Số lượt phát hành phải lớn hơn 0.")
        cursor.execute("""INSERT INTO Voucher
            (MaVoucher,LoaiGiam,GiaTri,GiamToiDa,DonToiThieu,SoLuong,DaSuDung,NgayBatDau,NgayHetHan,TrangThai)
            VALUES (%s,%s,%s,%s,%s,%s,0,%s,%s,%s)""",
            (code,kind,value,maximum,minimum,quantity,data.get("starts_at") or None,data.get("expires_at") or None,int(bool(data.get("active", True)))))
        audit_admin(cursor,"CREATE","Voucher",code,{"value":str(value),"type":kind}); conn.commit()
        return jsonify({"success": True, "message": "Đã tạo voucher mới."}), 201
    except mysql.connector.IntegrityError:
        conn.rollback(); return api_error("Mã voucher đã tồn tại.", 409, "duplicate_voucher")
    finally: cursor.close(); conn.close()


@app.patch("/api/admin/vouchers/<string:code>")
@admin_required
def admin_update_voucher(code):
    data=body_json(); fields=[]; params=[]
    mapping={"active":"TrangThai","quantity":"SoLuong","expires_at":"NgayHetHan","starts_at":"NgayBatDau","minimum":"DonToiThieu","maximum":"GiamToiDa","value":"GiaTri"}
    for key,column in mapping.items():
        if key in data:
            value=data[key]
            if key=="active": value=int(bool(value))
            elif key in {"quantity"}: value=int(value)
            elif key in {"minimum","maximum","value"}: value=decimal_number(value)
            elif value=="": value=None
            fields.append(f"{column}=%s"); params.append(value)
    if not fields: return api_error("Không có thay đổi để lưu.")
    conn=get_db_connection();cursor=conn.cursor()
    try:
        params.append(code.upper());cursor.execute(f"UPDATE Voucher SET {', '.join(fields)} WHERE MaVoucher=%s",params)
        if cursor.rowcount<1: return api_error("Không tìm thấy voucher.",404,"voucher_not_found")
        audit_admin(cursor,"UPDATE","Voucher",code,data);conn.commit();return jsonify({"success":True,"message":"Đã cập nhật voucher."})
    finally:cursor.close();conn.close()


@app.post("/api/mua-hang")
@auth_required
def checkout():
    data = body_json()
    address = str(data.get("dia_chi_giao", "")).strip()
    note = str(data.get("ghi_chu", "")).strip()[:500]
    voucher_code = str(data.get("voucher", data.get("ma_voucher", ""))).strip()
    payment_method = str(data.get("phuong_thuc", "SO_DU")).upper()
    if len(address) < 8 or len(address) > 500:
        return api_error("Vui lòng nhập địa chỉ giao hàng đầy đủ.")
    if payment_method not in {"SO_DU", "COD"}:
        return api_error("Phương thức thanh toán chưa được hỗ trợ.")

    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        conn.start_transaction()
        cursor.execute("SELECT SoDu FROM NguoiDung WHERE MaND = %s FOR UPDATE", (g.current_user["MaND"],))
        user = cursor.fetchone()
        cursor.execute(
            """
            SELECT g.MaSP, sp.TenSP, sp.GiaBan, g.SoLuong, sp.TonKho
            FROM GioHang g JOIN SanPham sp ON sp.MaSP = g.MaSP
            WHERE g.MaND = %s AND sp.TrangThai = 1
            ORDER BY g.MaSP FOR UPDATE
            """,
            (g.current_user["MaND"],),
        )
        items = cursor.fetchall()
        if not items:
            conn.rollback()
            return api_error("Giỏ hàng đang trống.", 409, "empty_cart")
        for item in items:
            if int(item["SoLuong"]) <= 0 or int(item["TonKho"]) < int(item["SoLuong"]):
                conn.rollback()
                return api_error(f"Sản phẩm '{item['TenSP']}' không đủ tồn kho.", 409, "insufficient_stock")

        subtotal = sum(Decimal(item["GiaBan"]) * int(item["SoLuong"]) for item in items)
        discount, voucher = voucher_discount(
            cursor, voucher_code, subtotal, g.current_user["MaND"]
        )
        if voucher_code and not voucher:
            conn.rollback()
            return api_error("Voucher không còn hợp lệ hoặc đơn hàng chưa đạt điều kiện áp dụng.", 409, "invalid_voucher")
        total = subtotal - discount
        if payment_method == "SO_DU" and Decimal(user["SoDu"] or 0) < total:
            conn.rollback()
            return api_error("Số dư tài khoản không đủ để thanh toán.", 409, "insufficient_balance")

        cursor.execute(
            """
            INSERT INTO DonHang (MaND, TongTien, DiaChiGiao, GhiChu, TrangThai, PhuongThuc)
            VALUES (%s, %s, %s, %s, 'CHO_XAC_NHAN', %s)
            """,
            (g.current_user["MaND"], total, address, note or None, payment_method),
        )
        order_id = cursor.lastrowid
        for item in items:
            cursor.execute(
                "INSERT INTO ChiTietDonHang (MaDH, MaSP, SoLuong, GiaBan) VALUES (%s, %s, %s, %s)",
                (order_id, item["MaSP"], item["SoLuong"], item["GiaBan"]),
            )
            cursor.execute(
                """
                UPDATE SanPham
                SET TonKho = TonKho - %s, SoLuotMua = COALESCE(SoLuotMua, 0) + %s
                WHERE MaSP = %s AND TonKho >= %s
                """,
                (item["SoLuong"], item["SoLuong"], item["MaSP"], item["SoLuong"]),
            )
            if cursor.rowcount != 1:
                raise RuntimeError("Tồn kho thay đổi trong lúc thanh toán")

        if payment_method == "SO_DU":
            cursor.execute("UPDATE NguoiDung SET SoDu = SoDu - %s WHERE MaND = %s", (total, g.current_user["MaND"]))
            cursor.execute(
                """
                INSERT INTO LichSuGiaoDich (MaND, LoaiGiaoDich, SoTien, MoTa)
                VALUES (%s, 'MUA', %s, %s)
                """,
                (g.current_user["MaND"], total, f"Thanh toán đơn hàng #{order_id}"),
            )
        if voucher:
            cursor.execute("UPDATE Voucher SET DaSuDung = DaSuDung + 1 WHERE MaVoucher = %s", (voucher["MaVoucher"],))
            cursor.execute(
                "INSERT INTO SuDungVoucher (MaND,MaVoucher,MaDH) VALUES (%s,%s,%s)",
                (g.current_user["MaND"], voucher["MaVoucher"], order_id),
            )
        cursor.execute("DELETE FROM GioHang WHERE MaND = %s", (g.current_user["MaND"],))
        conn.commit()
        return jsonify(
            {
                "success": True,
                "message": f"Đặt hàng thành công. Mã đơn #{order_id}.",
                "ma_don_hang": order_id,
                "subtotal": float(subtotal),
                "discount": float(discount),
                "tong_tien": float(total),
            }
        )
    except Exception:
        conn.rollback()
        app.logger.exception("Lỗi thanh toán")
        return api_error("Không thể hoàn tất đơn hàng. Vui lòng thử lại.", 409, "checkout_failed")
    finally:
        cursor.close()
        conn.close()


@app.post("/api/lich-su-don-hang")
@auth_required
def order_history():
    data = body_json()
    page = clamp_int(data.get("trang"), 1, 1, 100000)
    limit = 10
    offset = (page - 1) * limit
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            """
            SELECT dh.MaDH, dh.TongTien, dh.TrangThai, dh.PhuongThuc,
                   dh.NgayDat, dh.DiaChiGiao, COUNT(ct.MaSP) AS SoLoaiSP
            FROM DonHang dh
            LEFT JOIN ChiTietDonHang ct ON ct.MaDH = dh.MaDH
            WHERE dh.MaND = %s
            GROUP BY dh.MaDH
            ORDER BY dh.NgayDat DESC LIMIT %s OFFSET %s
            """,
            (g.current_user["MaND"], limit, offset),
        )
        orders = [serialize_row(row) for row in cursor.fetchall()]
        cursor.execute("SELECT COUNT(*) AS total FROM DonHang WHERE MaND = %s", (g.current_user["MaND"],))
        total = cursor.fetchone()["total"]
        return jsonify({"success": True, "orders": orders, "total": total, "page": page})
    finally:
        cursor.close()
        conn.close()


@app.get("/api/don-hang/<int:order_id>")
@auth_required
def order_detail(order_id):
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            "SELECT * FROM DonHang WHERE MaDH = %s AND MaND = %s",
            (order_id, g.current_user["MaND"]),
        )
        order = cursor.fetchone()
        if not order:
            return api_error("Không tìm thấy đơn hàng.", 404, "order_not_found")
        cursor.execute(
            """
            SELECT ct.MaSP, ct.SoLuong, ct.GiaBan, sp.TenSP, sp.HinhAnh
            FROM ChiTietDonHang ct LEFT JOIN SanPham sp ON sp.MaSP = ct.MaSP
            WHERE ct.MaDH = %s
            """,
            (order_id,),
        )
        return jsonify(
            {"success": True, "order": serialize_row(order), "items": [serialize_row(row) for row in cursor.fetchall()]}
        )
    finally:
        cursor.close()
        conn.close()


def cancel_order_transaction(cursor, order_id: int, owner_id: int | None = None):
    query = "SELECT * FROM DonHang WHERE MaDH = %s"
    params = [order_id]
    if owner_id is not None:
        query += " AND MaND = %s"
        params.append(owner_id)
    query += " FOR UPDATE"
    cursor.execute(query, params)
    order = cursor.fetchone()
    if not order:
        return None, "Không tìm thấy đơn hàng."
    if order["TrangThai"] != "CHO_XAC_NHAN":
        return None, "Chỉ có thể hủy đơn đang chờ xác nhận."
    cursor.execute(
        "UPDATE DonHang SET TrangThai = 'DA_HUY', NgayCapNhat = NOW() WHERE MaDH = %s AND TrangThai = 'CHO_XAC_NHAN'",
        (order_id,),
    )
    if cursor.rowcount != 1:
        return None, "Trạng thái đơn hàng vừa thay đổi."
    cursor.execute("SELECT MaSP, SoLuong FROM ChiTietDonHang WHERE MaDH = %s", (order_id,))
    for item in cursor.fetchall():
        cursor.execute(
            """
            UPDATE SanPham
            SET TonKho = TonKho + %s,
                SoLuotMua = GREATEST(COALESCE(SoLuotMua, 0) - %s, 0)
            WHERE MaSP = %s
            """,
            (item["SoLuong"], item["SoLuong"], item["MaSP"]),
        )
    if order.get("PhuongThuc") == "SO_DU":
        cursor.execute("UPDATE NguoiDung SET SoDu = SoDu + %s WHERE MaND = %s", (order["TongTien"], order["MaND"]))
        cursor.execute(
            "INSERT INTO LichSuGiaoDich (MaND, LoaiGiaoDich, SoTien, MoTa) VALUES (%s, 'HOAN_TIEN', %s, %s)",
            (order["MaND"], order["TongTien"], f"Hoàn tiền đơn hàng #{order_id}"),
        )
    return order, ""


@app.post("/api/don-hang/huy")
@auth_required
def cancel_order():
    order_id = clamp_int(body_json().get("ma_don_hang"), 0, 0, 2_000_000_000)
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        conn.start_transaction()
        order, error = cancel_order_transaction(cursor, order_id, g.current_user["MaND"])
        if error:
            conn.rollback()
            return api_error(error, 409, "invalid_order_state")
        conn.commit()
        return jsonify({"success": True, "message": f"Đã hủy đơn hàng #{order_id}."})
    except mysql.connector.Error:
        conn.rollback()
        return api_error("Không thể hủy đơn hàng.", 409, "cancel_failed")
    finally:
        cursor.close()
        conn.close()


@app.post("/api/don-hang/hoan-thanh")
@auth_required
def confirm_received():
    order_id = clamp_int(body_json().get("ma_don_hang"), 0, 0, 2_000_000_000)
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            """
            UPDATE DonHang SET TrangThai = 'HOAN_THANH', NgayCapNhat = NOW()
            WHERE MaDH = %s AND MaND = %s AND TrangThai = 'DANG_GIAO'
            """,
            (order_id, g.current_user["MaND"]),
        )
        if cursor.rowcount != 1:
            conn.rollback()
            return api_error("Chỉ xác nhận được đơn đang giao.", 409, "invalid_order_state")
        conn.commit()
        return jsonify({"success": True, "message": f"Đã xác nhận nhận đơn hàng #{order_id}."})
    finally:
        cursor.close()
        conn.close()


# ---------------------------------------------------------------------------
# Sản phẩm và đánh giá công khai
# ---------------------------------------------------------------------------


@app.post("/api/lien-he")
def create_support_request():
    limited = enforce_rate_limit("support-ip", client_ip(), 5, 10 * 60)
    if limited:
        return limited
    data = body_json()
    fullname = str(data.get("fullname", "")).strip()[:120]
    email = str(data.get("email", "")).strip().lower()[:150]
    phone = re.sub(r"[\s.()-]+", "", str(data.get("phone", "")).strip())[:20]
    subject = str(data.get("subject", "")).strip().upper()
    order_code = str(data.get("order_code", "")).strip().upper()[:32]
    reply_channel = str(data.get("reply_channel", "EMAIL")).strip().upper()
    message = str(data.get("message", "")).strip()[:2000]
    allowed_subjects = {"TU_VAN_SAN_PHAM", "DON_HANG", "THANH_TOAN", "TAI_KHOAN", "BAO_LOI", "KHAC"}
    if len(fullname) < 2 or not EMAIL_RE.fullmatch(email):
        return api_error("Họ tên hoặc email chưa hợp lệ.", 400, "invalid_contact")
    if phone and not PHONE_RE.fullmatch(phone):
        return api_error("Số điện thoại chưa đúng định dạng Việt Nam.", 400, "invalid_phone")
    if subject not in allowed_subjects or reply_channel not in {"EMAIL", "DIEN_THOAI"}:
        return api_error("Chủ đề hoặc kênh phản hồi chưa hợp lệ.", 400, "invalid_support_type")
    if reply_channel == "DIEN_THOAI" and not phone:
        return api_error("Vui lòng nhập số điện thoại để được gọi lại.", 400, "phone_required")
    if order_code and not re.fullmatch(r"#?[A-Z0-9_-]{1,31}", order_code):
        return api_error("Mã đơn hàng chưa hợp lệ.", 400, "invalid_order_code")
    if len(message) < 20:
        return api_error("Nội dung cần có ít nhất 20 ký tự.", 400, "message_too_short")
    if data.get("privacy_accepted") is not True:
        return api_error("Bạn cần đồng ý để cửa hàng xử lý thông tin liên hệ.", 400, "privacy_required")

    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            """
            INSERT INTO YeuCauHoTro
                (HoTen,Email,SoDienThoai,ChuDe,MaDonHang,KenhPhanHoi,NoiDung,DiaChiIP,UserAgent)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
            """,
            (
                fullname, email, phone or None, subject, order_code.lstrip("#") or None,
                reply_channel, message, client_ip(), str(request.user_agent)[:255] or None,
            ),
        )
        support_id = cursor.lastrowid
        conn.commit()
        return jsonify({
            "success": True,
            "message": "Cửa hàng đã tiếp nhận yêu cầu của bạn.",
            "ticket": f"HT-{support_id:06d}",
        }), 201
    except mysql.connector.Error:
        conn.rollback()
        app.logger.exception("Không thể lưu yêu cầu hỗ trợ")
        return api_error("Chưa thể tiếp nhận yêu cầu lúc này.", 503, "support_unavailable")
    finally:
        cursor.close()
        conn.close()


@app.get("/api/tim-kiem")
def search_products():
    keyword = request.args.get("q", "").strip()[:120]
    category = request.args.get("danh_muc", "").strip()
    min_price = max(0, request.args.get("gia_min", 0, type=float))
    max_price = max(min_price, request.args.get("gia_max", 999_999_999, type=float))
    sort = request.args.get("sap_xep", "phu_hop")
    page = clamp_int(request.args.get("trang"), 1, 1, 100000)
    limit = clamp_int(request.args.get("limit"), 20, 1, 50)
    sale_only = str(request.args.get("sale", "")).lower() in {"1", "true", "yes"}
    order_map = {
        "ten_asc": "sp.TenSP ASC",
        "ten_desc": "sp.TenSP DESC",
        "gia_asc": "sp.GiaBan ASC",
        "gia_desc": "sp.GiaBan DESC",
        "moi_nhat": "sp.NgayTao DESC",
    }
    where = ["sp.GiaBan BETWEEN %s AND %s", "sp.TrangThai = 1"]
    params = [min_price, max_price]
    if category:
        if category.isdigit():
            where.append("sp.MaDM = %s")
            params.append(int(category))
        else:
            where.append("(LOWER(dm.TenDM) = LOWER(%s) OR LOWER(dm.Slug) = LOWER(%s))")
            params.extend([category, category])
    if sale_only:
        where.append("sp.GiaGoc IS NOT NULL AND sp.GiaGoc > sp.GiaBan")
    where_sql = " AND ".join(where)
    offset = (page - 1) * limit
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        if keyword:
            # Danh mục cửa hàng nhỏ: xếp hạng tập ứng viên đã lọc tại ứng dụng
            # chính xác hơn LIKE, đồng thời giới hạn để bảo vệ tài nguyên host.
            cursor.execute(
                f"""
                SELECT sp.*, dm.TenDM FROM SanPham sp
                LEFT JOIN DanhMuc dm ON dm.MaDM = sp.MaDM
                WHERE {where_sql}
                ORDER BY sp.NgayTao DESC LIMIT 2000
                """,
                params,
            )
            ranked = []
            threshold = 0.5 if len(normalize_search_text(keyword)) <= 3 else 0.36
            for row in cursor.fetchall():
                score = fuzzy_product_score(keyword, row)
                if score >= threshold:
                    product = serialize_product(row)
                    product["DoPhuHop"] = score
                    product["UuTienDanhMuc"] = product_category_intent(keyword, row)
                    ranked.append((product["UuTienDanhMuc"], score, product))

            if sort in {"gia_asc", "gia_desc"}:
                ranked.sort(key=lambda item: float(item[2].get("GiaBan") or 0), reverse=sort == "gia_desc")
                ranked.sort(key=lambda item: (item[0], item[1]), reverse=True)
            else:
                # Trong cùng mức khớp danh mục và từ khóa, sản phẩm vừa được
                # cập nhật sẽ đứng trước. Điều này giúp gợi ý luôn phản ánh dữ
                # liệu quản trị mới nhất thay vì phá hòa bằng A-Z.
                ranked.sort(
                    key=lambda item: (
                        item[0],
                        item[1],
                        str(item[2].get("NgayCapNhat") or item[2].get("NgayTao") or ""),
                        int(item[2].get("MaSP") or 0),
                    ),
                    reverse=True,
                )
            total = len(ranked)
            products = [item[2] for item in ranked[offset:offset + limit]]
            return jsonify({"success": True, "products": products, "total": total, "trang_hien_tai": page, "tim_kiem_gan_dung": True})

        cursor.execute(
            f"""
            SELECT sp.*, dm.TenDM FROM SanPham sp
            LEFT JOIN DanhMuc dm ON dm.MaDM = sp.MaDM
            WHERE {where_sql} ORDER BY {order_map.get(sort, order_map['ten_asc'])}
            LIMIT %s OFFSET %s
            """,
            params + [limit, offset],
        )
        products = [serialize_product(row) for row in cursor.fetchall()]
        cursor.execute(
            f"""SELECT COUNT(*) AS total FROM SanPham sp
            LEFT JOIN DanhMuc dm ON dm.MaDM = sp.MaDM WHERE {where_sql}""",
            params,
        )
        total = cursor.fetchone()["total"]
        return jsonify({"success": True, "products": products, "total": total, "trang_hien_tai": page})
    finally:
        cursor.close()
        conn.close()


@app.get("/api/san-pham/<int:product_id>")
def product_detail(product_id):
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            """
            SELECT sp.*, dm.TenDM FROM SanPham sp
            LEFT JOIN DanhMuc dm ON dm.MaDM = sp.MaDM
            WHERE sp.MaSP = %s AND sp.TrangThai = 1
            """,
            (product_id,),
        )
        product = cursor.fetchone()
        if not product:
            return api_error("Sản phẩm không tồn tại hoặc đang tạm ẩn.", 404, "product_not_found")
        cursor.execute("UPDATE SanPham SET SoLuotXem = COALESCE(SoLuotXem, 0) + 1 WHERE MaSP = %s", (product_id,))
        cursor.execute(
            """
            SELECT dg.Diem, dg.NoiDung, dg.NgayDanhGia, nd.TenDangNhap, nd.HoTen,
                   EXISTS(
                       SELECT 1 FROM ChiTietDonHang ct JOIN DonHang dh ON dh.MaDH=ct.MaDH
                       WHERE dh.MaND=dg.MaND AND ct.MaSP=dg.MaSP AND dh.TrangThai='HOAN_THANH'
                   ) AS DaMuaXacThuc
            FROM DanhGia dg JOIN NguoiDung nd ON nd.MaND = dg.MaND
            WHERE dg.MaSP = %s ORDER BY dg.NgayDanhGia DESC
            """,
            (product_id,),
        )
        reviews = [serialize_row(row) for row in cursor.fetchall()]
        conn.commit()
        return jsonify({"success": True, "product": serialize_product(product), "reviews": reviews})
    finally:
        cursor.close()
        conn.close()


@app.get("/api/noi-dung")
def public_content_list():
    kind = str(request.args.get("loai", "TIN_TUC")).upper()
    if kind not in {"TIN_TUC", "HUONG_DAN"}:
        return api_error("Loại nội dung không hợp lệ.")
    limit = clamp_int(request.args.get("limit"), 20, 1, 100)
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            "SELECT MaBV,Loai,TieuDe,TomTat,HinhAnh,NguonURL,NgayDang "
            "FROM BaiViet WHERE Loai=%s AND TrangThai=1 ORDER BY NgayDang DESC LIMIT %s",
            (kind, limit),
        )
        return jsonify({"success": True, "items": [serialize_row(row) for row in cursor.fetchall()]})
    except mysql.connector.Error:
        app.logger.exception("Không thể tải danh sách nội dung")
        return api_error(
            "Kho nội dung đang được đồng bộ. Quản trị viên cần áp dụng migration mới.",
            503,
            "content_schema_unavailable",
        )
    finally:
        cursor.close()
        conn.close()


@app.get("/api/noi-dung/<int:content_id>")
def public_content_detail(content_id):
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT * FROM BaiViet WHERE MaBV=%s AND TrangThai=1", (content_id,))
        item = cursor.fetchone()
        if not item:
            return api_error("Không tìm thấy nội dung.", 404, "content_not_found")
        return jsonify({"success": True, "item": serialize_row(item)})
    except mysql.connector.Error:
        app.logger.exception("Không thể tải chi tiết nội dung")
        return api_error(
            "Kho nội dung đang được đồng bộ. Vui lòng thử lại sau.",
            503,
            "content_schema_unavailable",
        )
    finally:
        cursor.close()
        conn.close()


@app.get("/api/san-pham/goi-y")
def suggested_products():
    current_id = request.args.get("ma_sp", type=int)
    category = request.args.get("danh_muc", type=int)
    limit = clamp_int(request.args.get("limit"), 8, 1, 20)
    where = ["sp.TrangThai = 1"]
    params = []
    if category:
        where.append("sp.MaDM = %s")
        params.append(category)
    if current_id:
        where.append("sp.MaSP <> %s")
        params.append(current_id)
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            f"""
            SELECT sp.*, dm.TenDM FROM SanPham sp
            LEFT JOIN DanhMuc dm ON dm.MaDM = sp.MaDM
            WHERE {' AND '.join(where)}
            ORDER BY sp.NgayTao DESC, sp.SoLuotMua DESC LIMIT %s
            """,
            params + [limit],
        )
        return jsonify({"success": True, "products": [serialize_product(row) for row in cursor.fetchall()]})
    finally:
        cursor.close()
        conn.close()


@app.get("/api/danhmuc")
def categories():
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT * FROM DanhMuc ORDER BY TenDM")
        return jsonify({"success": True, "categories": [serialize_row(row) for row in cursor.fetchall()]})
    finally:
        cursor.close()
        conn.close()


@app.post("/api/danh-gia")
@auth_required
def review_product():
    data = body_json()
    product_id = clamp_int(data.get("ma_san_pham"), 0, 0, 2_000_000_000)
    rating = clamp_int(data.get("diem"), 0, 0, 5)
    content = str(data.get("noi_dung", "")).strip()[:1000]
    if not product_id or rating < 1:
        return api_error("Đánh giá cần từ 1 đến 5 sao.")
    if len(content) < 5:
        return api_error("Nội dung đánh giá cần ít nhất 5 ký tự.")
    limited = enforce_rate_limit("review-user", str(g.current_user["MaND"]), 20, 60 * 60)
    if limited:
        return limited
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT TrangThai FROM SanPham WHERE MaSP=%s", (product_id,))
        product = cursor.fetchone()
        if not product or not product.get("TrangThai"):
            return api_error("Sản phẩm không tồn tại hoặc đã ngừng bán.", 404, "product_not_found")
        cursor.execute(
            """
            INSERT INTO DanhGia (MaND, MaSP, Diem, NoiDung)
            VALUES (%s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE Diem = VALUES(Diem), NoiDung = VALUES(NoiDung), NgayDanhGia = NOW()
            """,
            (g.current_user["MaND"], product_id, rating, content or None),
        )
        cursor.execute(
            "UPDATE SanPham SET DanhGiaTrungBinh = (SELECT AVG(Diem) FROM DanhGia WHERE MaSP = %s) WHERE MaSP = %s",
            (product_id, product_id),
        )
        conn.commit()
        return jsonify({"success": True, "message": "Cảm ơn bạn đã đánh giá."})
    finally:
        cursor.close()
        conn.close()


# ---------------------------------------------------------------------------
# Quản trị
# ---------------------------------------------------------------------------


@app.post("/api/admin/media")
@admin_required
def admin_upload_media():
    """Tải một ảnh sản phẩm/nội dung lên kho bền vững của website."""
    limited = enforce_rate_limit(
        "admin-media", str(g.current_user["MaND"]), 80, 60 * 60
    )
    if limited:
        return limited
    purpose = str(request.form.get("purpose", "products")).strip().lower()
    if purpose not in {"products", "content"}:
        return api_error("Nhóm ảnh không hợp lệ.", 400, "invalid_media_purpose")
    try:
        image_data = normalized_public_image(request.files.get("image"))
    except ValueError as error:
        return public_image_validation_error(error)
    try:
        public_path = save_public_image(purpose, image_data)
    except MediaStorageError:
        app.logger.exception("Không thể lưu ảnh quản trị tải lên")
        return api_error(
            "Kho ảnh đang tạm thời không khả dụng.",
            503,
            "media_storage_unavailable",
        )
    return (
        jsonify(
            {
                "success": True,
                "message": "Đã tải và tối ưu ảnh.",
                "path": public_path,
            }
        ),
        201,
    )


@app.get("/api/admin/tong-quan")
@app.get("/api/admin/dashboard")
@admin_required
def admin_dashboard():
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            """
            SELECT COUNT(*) AS TongDon,
                   SUM(TrangThai = 'CHO_XAC_NHAN') AS DonCho,
                   COALESCE(SUM(CASE WHEN TrangThai = 'HOAN_THANH' THEN TongTien ELSE 0 END), 0) AS DoanhThu
            FROM DonHang
            """
        )
        orders = cursor.fetchone()
        cursor.execute("SELECT COUNT(*) AS TongUser, SUM(TrangThai = 1) AS UserHoatDong FROM NguoiDung")
        users = cursor.fetchone()
        cursor.execute("SELECT COUNT(*) AS SapHet FROM SanPham WHERE TrangThai = 1 AND TonKho <= 5")
        stock = cursor.fetchone()
        cursor.execute("SELECT COUNT(*) AS ChoDuyet FROM YeuCauNapTien WHERE TrangThai = 'CHO_DUYET'")
        deposits = cursor.fetchone()
        cursor.execute(
            """
            SELECT dh.MaDH, dh.TongTien, dh.TrangThai, dh.NgayDat,
                   nd.TenDangNhap, nd.HoTen, nd.Avatar
            FROM DonHang dh JOIN NguoiDung nd ON nd.MaND = dh.MaND
            ORDER BY dh.NgayDat DESC LIMIT 8
            """
        )
        recent = [serialize_row(row) for row in cursor.fetchall()]
        cursor.execute(
            "SELECT MaSP, TenSP, TonKho, HinhAnh FROM SanPham WHERE TrangThai = 1 AND TonKho <= 5 ORDER BY TonKho ASC LIMIT 8"
        )
        low_stock = [serialize_row(row) for row in cursor.fetchall()]
        return jsonify(
            {
                "success": True,
                "metrics": {
                    "orders": int(orders.get("TongDon") or 0),
                    "pending_orders": int(orders.get("DonCho") or 0),
                    "revenue": float(orders.get("DoanhThu") or 0),
                    "users": int(users.get("TongUser") or 0),
                    "active_users": int(users.get("UserHoatDong") or 0),
                    "low_stock": int(stock.get("SapHet") or 0),
                    "pending_deposits": int(deposits.get("ChoDuyet") or 0),
                },
                "recent_orders": recent,
                "low_stock_products": low_stock,
            }
        )
    finally:
        cursor.close()
        conn.close()


@app.route("/api/admin/san-pham", methods=["GET", "POST"])
@app.route("/api/admin/products", methods=["GET", "POST"])
@admin_required
def admin_products():
    if request.method == "GET":
        keyword = request.args.get("q", "").strip()[:120]
        status = request.args.get("status", "all")
        category = request.args.get("category", type=int)
        page = clamp_int(request.args.get("page"), 1, 1, 100000)
        limit = clamp_int(request.args.get("limit"), 20, 1, 100)
        numeric_keyword = keyword.lstrip("#").strip()
        if numeric_keyword.isdigit():
            where = ["(sp.TenSP LIKE %s OR sp.MaSP = %s)"]
            params = [f"%{keyword}%", int(numeric_keyword)]
        else:
            where = ["sp.TenSP LIKE %s"]
            params = [f"%{keyword}%"]
        if status in {"active", "hidden"}:
            where.append("sp.TrangThai = %s")
            params.append(1 if status == "active" else 0)
        if category:
            where.append("sp.MaDM = %s")
            params.append(category)
        where_sql = " AND ".join(where)
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        try:
            cursor.execute(
                f"""
                SELECT sp.*, dm.TenDM FROM SanPham sp LEFT JOIN DanhMuc dm ON dm.MaDM = sp.MaDM
                WHERE {where_sql} ORDER BY sp.NgayTao DESC LIMIT %s OFFSET %s
                """,
                params + [limit, (page - 1) * limit],
            )
            products = [serialize_product(row) for row in cursor.fetchall()]
            cursor.execute(f"SELECT COUNT(*) AS total FROM SanPham sp WHERE {where_sql}", params)
            total = cursor.fetchone()["total"]
            return jsonify({"success": True, "products": products, "total": total, "page": page})
        finally:
            cursor.close()
            conn.close()

    data = body_json()
    name = str(data.get("name", "")).strip()
    category_id = clamp_int(data.get("category_id"), 0, 0, 2_000_000_000)
    price = decimal_number(data.get("price"))
    original_price = decimal_number(data.get("original_price"))
    stock = clamp_int(data.get("stock"), 0, 0, 1_000_000)
    active = data.get("active", True)
    if (
        len(name) < 3
        or len(name) > 200
        or not category_id
        or price is None
        or price < 0
        or price > PRODUCT_PRICE_MAX
        or (original_price is not None and (original_price < 0 or original_price > PRODUCT_PRICE_MAX))
        or (original_price is not None and original_price <= price)
        or not isinstance(active, bool)
    ):
        return api_error("Tên, danh mục và giá sản phẩm chưa hợp lệ.")
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            """
            INSERT INTO SanPham
                (MaDM, TenSP, MoTa, GiaBan, GiaGoc, TonKho, HinhAnh, ThuongHieu, AnhChiTiet, TrangThai, NguonURL, NguonTen)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                category_id,
                name,
                sanitize_rich_text(str(data.get("description", ""))[:5000]) or None,
                price,
                original_price,
                stock,
                normalize_public_url(data.get("image"), allow_relative=True, max_length=255),
                str(data.get("brand", "")).strip()[:100] or None,
                json.dumps(normalized_image_list(data.get("detail_images")), ensure_ascii=False),
                1 if active else 0,
                normalize_public_url(data.get("source_url"), allow_relative=False, max_length=700),
                str(data.get("source_name", "")).strip()[:120] or None,
            ),
        )
        product_id = cursor.lastrowid
        audit_admin(cursor, "CREATE", "SanPham", product_id, {"name": name})
        conn.commit()
        return jsonify({"success": True, "message": "Đã tạo sản phẩm.", "id": product_id}), 201
    except mysql.connector.Error:
        conn.rollback()
        return api_error("Không thể tạo sản phẩm. Kiểm tra lại danh mục.", 409, "product_create_failed")
    finally:
        cursor.close()
        conn.close()


@app.route("/api/admin/san-pham/<int:product_id>", methods=["PUT", "PATCH", "DELETE"])
@app.route("/api/admin/products/<int:product_id>", methods=["PUT", "PATCH", "DELETE"])
@admin_required
def admin_update_product(product_id):
    if request.method == "DELETE":
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        try:
            cursor.execute("SELECT * FROM SanPham WHERE MaSP=%s FOR UPDATE", (product_id,))
            previous = cursor.fetchone()
            if not previous:
                conn.rollback()
                return api_error("Không tìm thấy sản phẩm.", 404, "product_not_found")
            cursor.execute("UPDATE SanPham SET TrangThai=0, TonKho=0, NgayCapNhat=NOW() WHERE MaSP=%s", (product_id,))
            if cursor.rowcount != 1:
                conn.rollback()
                return api_error("Không tìm thấy sản phẩm.", 404, "product_not_found")
            audit_admin(cursor, "DELETE", "SanPham", product_id, {"mode": "soft_delete"}, serialize_row(previous), {"TrangThai": 0, "TonKho": 0})
            conn.commit()
            return jsonify({"success": True, "message": "Đã ngừng bán sản phẩm. Dữ liệu đơn hàng vẫn được bảo toàn."})
        finally:
            cursor.close()
            conn.close()

    data = body_json()
    mapping = {
        "name": ("TenSP", lambda value: str(value).strip()[:200]),
        "category_id": ("MaDM", lambda value: clamp_int(value, 0, 0, 2_000_000_000)),
        "description": ("MoTa", lambda value: sanitize_rich_text(str(value)[:5000]) or None),
        "price": ("GiaBan", lambda value: decimal_number(value)),
        "original_price": ("GiaGoc", lambda value: decimal_number(value)),
        "stock": ("TonKho", lambda value: clamp_int(value, 0, 0, 1_000_000)),
        "image": ("HinhAnh", lambda value: normalize_public_url(value, allow_relative=True, max_length=255)),
        "brand": ("ThuongHieu", lambda value: str(value).strip()[:100] or None),
        "active": ("TrangThai", lambda value: 1 if value else 0),
        "detail_images": ("AnhChiTiet", lambda value: json.dumps(normalized_image_list(value), ensure_ascii=False)),
        "source_url": ("NguonURL", lambda value: normalize_public_url(value, allow_relative=False, max_length=700)),
        "source_name": ("NguonTen", lambda value: str(value).strip()[:120] or None),
    }
    updates = []
    values = []
    changed = {}
    for key, (column, converter) in mapping.items():
        if key not in data:
            continue
        value = converter(data[key])
        if value is None and key in {"price", "category_id"}:
            return api_error(f"Trường {key} không hợp lệ.")
        if key == "name" and not 3 <= len(value) <= 200:
            return api_error("Tên sản phẩm cần từ 3 đến 200 ký tự.")
        if key == "category_id" and value <= 0:
            return api_error("Danh mục không hợp lệ.")
        if key in {"price", "original_price"} and value is not None:
            if value < 0 or value > PRODUCT_PRICE_MAX:
                return api_error("Giá sản phẩm nằm ngoài phạm vi cho phép.")
        if key == "active" and not isinstance(data[key], bool):
            return api_error("Trạng thái sản phẩm không hợp lệ.")
        updates.append(f"{column} = %s")
        values.append(value)
        changed[key] = value
    resulting_price = next((values[index] for index, update in enumerate(updates) if update.startswith("GiaBan")), None)
    resulting_original = next((values[index] for index, update in enumerate(updates) if update.startswith("GiaGoc")), None)
    if resulting_original is not None:
        if resulting_price is None:
            conn_check = get_db_connection()
            cursor_check = conn_check.cursor(dictionary=True)
            try:
                cursor_check.execute("SELECT GiaBan FROM SanPham WHERE MaSP=%s", (product_id,))
                row_check = cursor_check.fetchone()
                resulting_price = decimal_number(row_check["GiaBan"]) if row_check else None
            finally:
                cursor_check.close()
                conn_check.close()
        if resulting_price is None or resulting_original <= resulting_price:
            return api_error("Sản phẩm Sale Off cần có giá gốc lớn hơn giá bán.")
    if not updates:
        return api_error("Không có dữ liệu cần cập nhật.")
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT * FROM SanPham WHERE MaSP=%s FOR UPDATE", (product_id,))
        previous = cursor.fetchone()
        if not previous:
            conn.rollback()
            return api_error("Không tìm thấy sản phẩm.", 404, "product_not_found")
        cursor.execute(
            f"UPDATE SanPham SET {', '.join(updates)}, NgayCapNhat = NOW() WHERE MaSP = %s",
            values + [product_id],
        )
        if cursor.rowcount != 1:
            conn.rollback()
            return api_error("Không tìm thấy sản phẩm.", 404, "product_not_found")
        cursor.execute("SELECT * FROM SanPham WHERE MaSP=%s", (product_id,))
        current = cursor.fetchone()
        audit_admin(cursor, "UPDATE", "SanPham", product_id, changed, serialize_row(previous), serialize_row(current))
        conn.commit()
        return jsonify({"success": True, "message": "Đã cập nhật sản phẩm."})
    finally:
        cursor.close()
        conn.close()


@app.get("/api/admin/don-hang")
@app.get("/api/admin/orders")
@admin_required
def admin_orders():
    status = request.args.get("status", "all")
    keyword = request.args.get("q", "").strip()[:100]
    page = clamp_int(request.args.get("page"), 1, 1, 100000)
    limit = clamp_int(request.args.get("limit"), 20, 1, 100)
    where = ["(nd.TenDangNhap LIKE %s OR nd.HoTen LIKE %s OR CAST(dh.MaDH AS CHAR) LIKE %s)"]
    params = [f"%{keyword}%", f"%{keyword}%", f"%{keyword}%"]
    if status in ORDER_STATES:
        where.append("dh.TrangThai = %s")
        params.append(status)
    where_sql = " AND ".join(where)
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            f"""
            SELECT dh.*, nd.TenDangNhap, nd.HoTen, nd.Email, nd.SoDienThoai, nd.Avatar
            FROM DonHang dh JOIN NguoiDung nd ON nd.MaND = dh.MaND
            WHERE {where_sql} ORDER BY dh.NgayDat DESC LIMIT %s OFFSET %s
            """,
            params + [limit, (page - 1) * limit],
        )
        orders = [serialize_row(row) for row in cursor.fetchall()]
        order_ids = [order["MaDH"] for order in orders]
        if order_ids:
            placeholders = ",".join(["%s"] * len(order_ids))
            cursor.execute(
                f"""SELECT ct.MaDH,ct.MaSP,ct.SoLuong,ct.GiaBan,sp.TenSP,sp.HinhAnh,
                           sp.ThuongHieu,sp.GiaGoc,sp.TrangThai AS TrangThaiSanPham,
                           sp.MaDM,dm.TenDM
                FROM ChiTietDonHang ct
                LEFT JOIN SanPham sp ON sp.MaSP=ct.MaSP
                LEFT JOIN DanhMuc dm ON dm.MaDM=sp.MaDM
                WHERE ct.MaDH IN ({placeholders}) ORDER BY ct.MaDH,ct.MaSP""",
                order_ids,
            )
            items_by_order = {}
            for item in cursor.fetchall():
                items_by_order.setdefault(item["MaDH"], []).append(serialize_row(item))
            for order in orders:
                order["SanPham"] = items_by_order.get(order["MaDH"], [])
            cursor.execute(
                f"""SELECT nk.MaDoiTuong,nk.HanhDong,nk.ChiTiet,nk.NgayTao,
                           nd.TenDangNhap,nd.HoTen
                    FROM NhatKyQuanTri nk
                    JOIN NguoiDung nd ON nd.MaND=nk.MaND
                    WHERE nk.DoiTuong=%s AND nk.MaDoiTuong IN ({placeholders})
                    ORDER BY nk.NgayTao ASC""",
                ["DonHang"] + [str(order_id) for order_id in order_ids],
            )
            history_by_order = {}
            for event in cursor.fetchall():
                history_by_order.setdefault(int(event["MaDoiTuong"]), []).append(serialize_row(event))
            for order in orders:
                order["LichSuXuLy"] = history_by_order.get(order["MaDH"], [])
        cursor.execute(
            f"SELECT COUNT(*) AS total FROM DonHang dh JOIN NguoiDung nd ON nd.MaND = dh.MaND WHERE {where_sql}",
            params,
        )
        return jsonify({"success": True, "orders": orders, "total": cursor.fetchone()["total"], "page": page})
    finally:
        cursor.close()
        conn.close()


@app.patch("/api/admin/don-hang/<int:order_id>/trang-thai")
@app.patch("/api/admin/orders/<int:order_id>/status")
@admin_required
def admin_update_order(order_id):
    new_status = str(body_json().get("status", "")).upper()
    if new_status not in ORDER_STATES:
        return api_error("Trạng thái đơn hàng không hợp lệ.")
    allowed = {
        "CHO_XAC_NHAN": {"DANG_GIAO", "DA_HUY"},
        "DANG_GIAO": {"HOAN_THANH"},
        "HOAN_THANH": set(),
        "DA_HUY": set(),
    }
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        conn.start_transaction()
        cursor.execute("SELECT * FROM DonHang WHERE MaDH = %s FOR UPDATE", (order_id,))
        order = cursor.fetchone()
        if not order:
            conn.rollback()
            return api_error("Không tìm thấy đơn hàng.", 404, "order_not_found")
        if new_status not in allowed.get(order["TrangThai"], set()):
            conn.rollback()
            return api_error("Không thể chuyển sang trạng thái này.", 409, "invalid_order_transition")
        if new_status == "DA_HUY":
            _, error = cancel_order_transaction(cursor, order_id)
            if error:
                conn.rollback()
                return api_error(error, 409, "cancel_failed")
        else:
            cursor.execute(
                "UPDATE DonHang SET TrangThai = %s, NgayCapNhat = NOW() WHERE MaDH = %s",
                (new_status, order_id),
            )
        audit_admin(cursor, "STATUS", "DonHang", order_id, {"from": order["TrangThai"], "to": new_status})
        conn.commit()
        return jsonify({"success": True, "message": "Đã cập nhật trạng thái đơn hàng."})
    except mysql.connector.Error:
        conn.rollback()
        return api_error("Không thể cập nhật đơn hàng.", 409, "order_update_failed")
    finally:
        cursor.close()
        conn.close()


@app.route("/api/admin/nguoi-dung", methods=["GET", "POST"])
@app.route("/api/admin/users", methods=["GET", "POST"])
@admin_required
def admin_users():
    if request.method == "POST":
        data = body_json()
        username = str(data.get("username", "")).strip()
        password = str(data.get("password", ""))
        fullname = str(data.get("fullname", "")).strip()[:100]
        email = str(data.get("email", "")).strip().lower()[:150]
        phone = str(data.get("phone", "")).strip()[:20]
        address = str(data.get("address", "")).strip()[:500]
        role = str(data.get("role", "user"))
        active = data.get("active", True)
        balance = decimal_number(data.get("balance", 0), Decimal("0"))
        valid_password, password_message = validate_password(password)
        if not USERNAME_RE.fullmatch(username):
            return api_error("Tên đăng nhập cần 3–30 ký tự, chỉ gồm chữ, số hoặc dấu gạch dưới.")
        if not valid_password:
            return api_error(password_message)
        if not fullname or (email and not EMAIL_RE.fullmatch(email)) or (phone and not PHONE_RE.fullmatch(phone)):
            return api_error("Họ tên, email hoặc số điện thoại chưa hợp lệ.")
        if role not in {"user", "admin"} or not isinstance(active, bool) or balance is None or balance < 0:
            return api_error("Vai trò, trạng thái hoặc số dư chưa hợp lệ.")
        if role == "admin" and not is_superadmin():
            return api_error("Chỉ quản trị viên cấp cao mới được cấp quyền admin.", 403, "superadmin_required")
        conn = get_db_connection()
        cursor = conn.cursor()
        try:
            cursor.execute(
                """INSERT INTO NguoiDung
                   (TenDangNhap,MatKhau,HoTen,Email,SoDienThoai,DiaChi,SoDu,VaiTro,TrangThai)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                (username, generate_password_hash(password), fullname, email or None, phone or None,
                 address or None, balance, role, 1 if active else 0),
            )
            user_id = cursor.lastrowid
            audit_admin(cursor, "CREATE", "NguoiDung", user_id, {"username": username, "role": role})
            conn.commit()
            return jsonify({"success": True, "message": "Đã tạo tài khoản người dùng.", "id": user_id}), 201
        except IntegrityError:
            conn.rollback()
            return api_error("Tên đăng nhập hoặc email đã tồn tại.", 409, "user_exists")
        finally:
            cursor.close()
            conn.close()

    keyword = request.args.get("q", "").strip()[:100]
    role = request.args.get("role", "all")
    page = clamp_int(request.args.get("page"), 1, 1, 100000)
    limit = clamp_int(request.args.get("limit"), 20, 1, 100)
    numeric_keyword = keyword.lstrip("#").strip()
    if numeric_keyword.isdigit():
        where = ["(TenDangNhap LIKE %s OR HoTen LIKE %s OR Email LIKE %s OR MaND = %s)"]
        params = [f"%{keyword}%", f"%{keyword}%", f"%{keyword}%", int(numeric_keyword)]
    else:
        where = ["(TenDangNhap LIKE %s OR HoTen LIKE %s OR Email LIKE %s)"]
        params = [f"%{keyword}%", f"%{keyword}%", f"%{keyword}%"]
    if role == "user":
        where.append("VaiTro = 'user'")
    elif role == "admin":
        where.append("VaiTro IN ('admin', 'superadmin')")
    where_sql = " AND ".join(where)
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            f"""
            SELECT MaND, TenDangNhap, HoTen, Email, SoDienThoai, DiaChi, Avatar, SoDu, VaiTro,
                   TrangThai, NgayTaoTaiKhoan, LanDangNhapCuoi
            FROM NguoiDung WHERE {where_sql}
            ORDER BY
                CASE VaiTro WHEN 'superadmin' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END ASC,
                CASE WHEN VaiTro IN ('superadmin', 'admin') THEN NgayTaoTaiKhoan END ASC,
                CASE WHEN VaiTro = 'user' THEN NgayTaoTaiKhoan END DESC,
                MaND ASC
            LIMIT %s OFFSET %s
            """,
            params + [limit, (page - 1) * limit],
        )
        users = [serialize_row(row) for row in cursor.fetchall()]
        cursor.execute(f"SELECT COUNT(*) AS total FROM NguoiDung WHERE {where_sql}", params)
        return jsonify({"success": True, "users": users, "total": cursor.fetchone()["total"], "page": page})
    finally:
        cursor.close()
        conn.close()


@app.patch("/api/admin/nguoi-dung/<int:user_id>")
@app.patch("/api/admin/users/<int:user_id>")
@admin_required
def admin_update_user(user_id):
    data = body_json()
    role = data.get("role")
    active = data.get("active")
    if role is not None and role not in {"user", "admin"}:
        return api_error("Vai trò không hợp lệ.")
    if active is not None and not isinstance(active, bool):
        return api_error("Trạng thái tài khoản không hợp lệ.")
    if user_id == g.current_user["MaND"] and ((role in {"user", "admin"}) or active is False):
        return api_error("Bạn không thể tự hạ quyền hoặc khóa chính mình.", 409, "self_protection")

    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        conn.start_transaction()
        cursor.execute(
            """SELECT MaND, TenDangNhap, HoTen, Email, SoDienThoai, DiaChi, Avatar,
                      SoDu, VaiTro, TrangThai
               FROM NguoiDung WHERE MaND = %s FOR UPDATE""",
            (user_id,),
        )
        target = cursor.fetchone()
        if not target:
            conn.rollback()
            return api_error("Không tìm thấy người dùng.", 404, "user_not_found")
        target_role = target.get("VaiTro") or "user"
        if target_role == "superadmin":
            conn.rollback()
            return api_error("Tài khoản quản trị viên cấp cao được bảo vệ và không thể sửa tại đây.", 403, "protected_superadmin")
        if not is_superadmin():
            if target_role in ADMIN_ROLES:
                conn.rollback()
                return api_error("Admin thường không thể sửa hoặc khóa quản trị viên khác.", 403, "admin_peer_protected")
            if role is not None and role != target_role:
                conn.rollback()
                return api_error("Chỉ quản trị viên cấp cao mới được thay đổi vai trò.", 403, "superadmin_required")
        updates = []
        values = []
        profile_fields = {
            "fullname": ("HoTen", lambda value: str(value).strip()[:100]),
            "email": ("Email", lambda value: str(value).strip().lower()[:150] or None),
            "phone": ("SoDienThoai", lambda value: str(value).strip()[:20] or None),
            "address": ("DiaChi", lambda value: str(value).strip()[:500] or None),
            "balance": ("SoDu", lambda value: decimal_number(value)),
        }
        changed = {}
        for key, (column, converter) in profile_fields.items():
            if key not in data:
                continue
            value = converter(data[key])
            if key == "fullname" and not value:
                conn.rollback()
                return api_error("Họ tên không được để trống.")
            if key == "email" and value and not EMAIL_RE.fullmatch(value):
                conn.rollback()
                return api_error("Email không hợp lệ.")
            if key == "phone" and value and not PHONE_RE.fullmatch(value):
                conn.rollback()
                return api_error("Số điện thoại không hợp lệ.")
            if key == "balance" and (value is None or value < 0):
                conn.rollback()
                return api_error("Số dư không hợp lệ.")
            current_value = target.get(column)
            values_equal = (
                Decimal(str(current_value or 0)) == Decimal(str(value or 0))
                if key == "balance"
                else (current_value or None) == (value or None)
            )
            if values_equal:
                continue
            updates.append(f"{column} = %s")
            values.append(value)
            changed[key] = value
        if "password" in data and str(data["password"]):
            valid, message = validate_password(str(data["password"]))
            if not valid:
                conn.rollback()
                return api_error(message)
            updates.append("MatKhau = %s")
            values.append(generate_password_hash(str(data["password"])))
            changed["password_reset"] = True
        if role is not None and role != target_role:
            updates.append("VaiTro = %s")
            values.append(role)
            changed["role"] = role
        if active is not None and active != bool(target.get("TrangThai")):
            updates.append("TrangThai = %s")
            values.append(1 if active else 0)
            changed["active"] = active
        if not updates:
            conn.rollback()
            return jsonify({"success": True, "message": "Hồ sơ không có thông tin nào thay đổi.", "unchanged": True})
        cursor.execute(f"UPDATE NguoiDung SET {', '.join(updates)} WHERE MaND = %s", values + [user_id])
        if active is False:
            cursor.execute("UPDATE PhienDangNhap SET DaThuHoi = 1 WHERE MaND = %s", (user_id,))
        cursor.execute(
            """SELECT MaND, TenDangNhap, HoTen, Email, SoDienThoai, DiaChi, Avatar,
                      SoDu, VaiTro, TrangThai
               FROM NguoiDung WHERE MaND = %s""",
            (user_id,),
        )
        current = cursor.fetchone()
        audit_action = "UPDATE"
        if role is not None and role != target_role:
            audit_action = "PROMOTE_ADMIN" if role == "admin" else "DEMOTE_ADMIN"
            changed.update({"TaiKhoan": target.get("TenDangNhap"), "VaiTroTruoc": target_role, "VaiTroSau": role})
        elif active is not None and bool(target.get("TrangThai")) != active:
            audit_action = "UNLOCK_USER" if active else "LOCK_USER"
        audit_admin(
            cursor, audit_action, "NguoiDung", user_id, changed,
            serialize_row(target), serialize_row(current),
        )
        conn.commit()
        return jsonify({"success": True, "message": "Đã cập nhật người dùng."})
    except mysql.connector.Error:
        conn.rollback()
        return api_error("Không thể cập nhật người dùng.", 409, "user_update_failed")
    finally:
        cursor.close()
        conn.close()


@app.post("/api/admin/users/<int:user_id>/avatar")
@app.post("/api/admin/nguoi-dung/<int:user_id>/anh-dai-dien")
@admin_required
def admin_update_user_avatar(user_id):
    uploaded = request.files.get("avatar")
    if not uploaded or not uploaded.filename:
        return api_error("Vui lòng chọn ảnh đại diện cho người dùng.")
    try:
        image_data = normalized_avatar(uploaded)
    except ValueError as error:
        return avatar_validation_error(error)

    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    relative_path = None
    try:
        conn.start_transaction()
        cursor.execute(
            """SELECT MaND, TenDangNhap, HoTen, Email, SoDienThoai, DiaChi, Avatar,
                      SoDu, VaiTro, TrangThai FROM NguoiDung WHERE MaND=%s FOR UPDATE""",
            (user_id,),
        )
        target = cursor.fetchone()
        if not target:
            conn.rollback()
            return api_error("Không tìm thấy người dùng.", 404, "user_not_found")
        if target.get("VaiTro") == "superadmin" or (target.get("VaiTro") == "admin" and not is_superadmin()):
            conn.rollback()
            return api_error("Bạn không có quyền đổi ảnh của quản trị viên này.", 403, "protected_admin")
        try:
            relative_path = save_avatar(user_id, image_data)
        except MediaStorageError:
            conn.rollback()
            app.logger.exception("Không thể lưu ảnh đại diện do quản trị viên tải lên")
            return api_error("Kho ảnh đang tạm thời không khả dụng.", 503, "media_storage_unavailable")
        cursor.execute("UPDATE NguoiDung SET Avatar=%s WHERE MaND=%s", (relative_path, user_id))
        current = dict(target)
        current["Avatar"] = relative_path
        audit_admin(cursor, "UPDATE", "NguoiDung", user_id, {"Avatar": relative_path}, serialize_row(target), serialize_row(current))
        conn.commit()
    except Exception:
        conn.rollback()
        delete_avatar(relative_path)
        raise
    finally:
        cursor.close()
        conn.close()
    # Giữ ảnh cũ để Super Admin có thể hoàn tác thay đổi này.
    return jsonify({"success": True, "message": "Đã cập nhật ảnh đại diện người dùng.", "avatar": relative_path})


@app.get("/api/admin/ho-tro")
@admin_required
def admin_support_requests():
    status = str(request.args.get("status", "all")).strip().upper()
    query = str(request.args.get("q", "")).strip()[:120]
    page = clamp_int(request.args.get("page"), 1, 1, 100000)
    limit = clamp_int(request.args.get("limit"), 20, 1, 50)
    allowed_statuses = {"MOI", "DANG_XU_LY", "DA_PHAN_HOI", "DA_DONG"}
    where, params = [], []
    if status in allowed_statuses:
        where.append("ht.TrangThai=%s")
        params.append(status)
    if query:
        where.append("(ht.HoTen LIKE %s OR ht.Email LIKE %s OR ht.MaDonHang LIKE %s OR ht.NoiDung LIKE %s)")
        pattern = f"%{query}%"
        params.extend([pattern, pattern, pattern, pattern])
    where_sql = f"WHERE {' AND '.join(where)}" if where else ""
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(f"SELECT COUNT(*) AS total FROM YeuCauHoTro ht {where_sql}", params)
        total = int(cursor.fetchone()["total"])
        cursor.execute(
            f"""
            SELECT ht.*, nd.TenDangNhap AS AdminXuLy
            FROM YeuCauHoTro ht
            LEFT JOIN NguoiDung nd ON nd.MaND=ht.MaAdminXuLy
            {where_sql}
            ORDER BY FIELD(ht.TrangThai,'MOI','DANG_XU_LY','DA_PHAN_HOI','DA_DONG'), ht.NgayTao DESC
            LIMIT %s OFFSET %s
            """,
            params + [limit, (page - 1) * limit],
        )
        return jsonify({
            "success": True,
            "requests": [serialize_row(row) for row in cursor.fetchall()],
            "total": total,
            "page": page,
        })
    except mysql.connector.Error:
        app.logger.exception("Không thể đọc hộp thư hỗ trợ")
        return api_error(
            "Hộp thư hỗ trợ chưa được đồng bộ. Hãy áp dụng migration mới trên máy chủ.",
            503,
            "support_schema_unavailable",
        )
    finally:
        cursor.close()
        conn.close()


@app.patch("/api/admin/ho-tro/<int:support_id>")
@admin_required
def admin_update_support_request(support_id):
    data = body_json()
    status = str(data.get("status", "")).strip().upper()
    note = str(data.get("note", "")).strip()[:1000]
    if status not in {"MOI", "DANG_XU_LY", "DA_PHAN_HOI", "DA_DONG"}:
        return api_error("Trạng thái hỗ trợ chưa hợp lệ.", 400, "invalid_support_status")
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT * FROM YeuCauHoTro WHERE MaYeuCau=%s FOR UPDATE", (support_id,))
        before = cursor.fetchone()
        if not before:
            conn.rollback()
            return api_error("Không tìm thấy yêu cầu hỗ trợ.", 404, "support_not_found")
        cursor.execute(
            """
            UPDATE YeuCauHoTro
            SET TrangThai=%s,GhiChuAdmin=%s,MaAdminXuLy=%s
            WHERE MaYeuCau=%s
            """,
            (status, note or None, g.current_user["MaND"], support_id),
        )
        after = dict(before)
        after.update({"TrangThai": status, "GhiChuAdmin": note or None, "MaAdminXuLy": g.current_user["MaND"]})
        audit_admin(
            cursor, "UPDATE", "YeuCauHoTro", support_id,
            {"TrangThai": status, "GhiChuAdmin": note or None},
            serialize_row(before), serialize_row(after),
        )
        conn.commit()
        return jsonify({"success": True, "message": f"Đã cập nhật phiếu HT-{support_id:06d}."})
    except mysql.connector.Error:
        conn.rollback()
        app.logger.exception("Không thể cập nhật yêu cầu hỗ trợ")
        return api_error("Không thể cập nhật yêu cầu.", 409, "support_update_failed")
    finally:
        cursor.close()
        conn.close()


@app.route("/api/admin/noi-dung", methods=["GET", "POST"])
@admin_required
def admin_content():
    if request.method == "GET":
        kind = str(request.args.get("loai", "all")).upper()
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        try:
            if kind in {"TIN_TUC", "HUONG_DAN"}:
                cursor.execute("SELECT * FROM BaiViet WHERE Loai=%s ORDER BY NgayDang DESC", (kind,))
            else:
                cursor.execute("SELECT * FROM BaiViet ORDER BY NgayDang DESC")
            return jsonify({"success": True, "items": [serialize_row(row) for row in cursor.fetchall()]})
        except mysql.connector.Error:
            app.logger.exception("Không thể tải nội dung quản trị")
            return api_error(
                "Không thể tải Nội dung vì schema máy chủ chưa đồng bộ. Hãy chạy migration v5.",
                503,
                "content_schema_unavailable",
            )
        finally:
            cursor.close()
            conn.close()

    data = body_json()
    kind = str(data.get("type", "")).upper()
    title = str(data.get("title", "")).strip()[:220]
    summary = str(data.get("summary", "")).strip()[:500]
    content = str(data.get("content", "")).strip()
    active = data.get("active", True)
    if kind not in {"TIN_TUC", "HUONG_DAN"} or len(title) < 5 or not content or not isinstance(active, bool):
        return api_error("Loại, tiêu đề hoặc nội dung chưa hợp lệ.")
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            """INSERT INTO BaiViet (Loai,TieuDe,TomTat,NoiDung,HinhAnh,NguonURL,TrangThai)
            VALUES (%s,%s,%s,%s,%s,%s,%s)""",
            (kind, title, summary or None, content,
             str(data.get("image", "")).strip()[:500] or None,
             str(data.get("source_url", "")).strip()[:700] or None,
             1 if active else 0),
        )
        content_id = cursor.lastrowid
        audit_admin(cursor, "CREATE", "BaiViet", content_id, {"title": title, "type": kind})
        conn.commit()
        return jsonify({"success": True, "message": "Đã tạo nội dung.", "id": content_id}), 201
    except mysql.connector.Error:
        conn.rollback()
        app.logger.exception("Không thể tạo nội dung")
        return api_error("Không thể lưu nội dung lúc này.", 503, "content_save_failed")
    finally:
        cursor.close()
        conn.close()


@app.route("/api/admin/noi-dung/<int:content_id>", methods=["PATCH", "DELETE"])
@admin_required
def admin_update_content(content_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        if request.method == "DELETE":
            cursor.execute("UPDATE BaiViet SET TrangThai=0 WHERE MaBV=%s", (content_id,))
            if cursor.rowcount != 1:
                return api_error("Không tìm thấy nội dung.", 404, "content_not_found")
            audit_admin(cursor, "HIDE", "BaiViet", content_id)
            conn.commit()
            return jsonify({"success": True, "message": "Đã ẩn nội dung."})
        data = body_json()
        mapping = {
            "type": ("Loai", lambda value: str(value).upper()),
            "title": ("TieuDe", lambda value: str(value).strip()[:220]),
            "summary": ("TomTat", lambda value: str(value).strip()[:500] or None),
            "content": ("NoiDung", lambda value: str(value).strip()),
            "image": ("HinhAnh", lambda value: str(value).strip()[:500] or None),
            "source_url": ("NguonURL", lambda value: str(value).strip()[:700] or None),
            "active": ("TrangThai", lambda value: 1 if value else 0),
        }
        updates, values, changed = [], [], {}
        for key, (column, converter) in mapping.items():
            if key not in data:
                continue
            if key == "active" and not isinstance(data[key], bool):
                return api_error("Trạng thái không hợp lệ.")
            value = converter(data[key])
            if key == "type" and value not in {"TIN_TUC", "HUONG_DAN"}:
                return api_error("Loại nội dung không hợp lệ.")
            if key in {"title", "content"} and not value:
                return api_error("Tiêu đề và nội dung không được để trống.")
            updates.append(f"{column}=%s")
            values.append(value)
            changed[key] = value
        if not updates:
            return api_error("Không có thay đổi nào.")
        cursor.execute(f"UPDATE BaiViet SET {', '.join(updates)} WHERE MaBV=%s", values + [content_id])
        if cursor.rowcount != 1:
            return api_error("Không tìm thấy nội dung.", 404, "content_not_found")
        audit_admin(cursor, "UPDATE", "BaiViet", content_id, changed)
        conn.commit()
        return jsonify({"success": True, "message": "Đã cập nhật nội dung."})
    except mysql.connector.Error:
        conn.rollback()
        app.logger.exception("Không thể cập nhật nội dung %s", content_id)
        return api_error("Không thể cập nhật nội dung lúc này.", 503, "content_update_failed")
    finally:
        cursor.close()
        conn.close()


@app.get("/api/admin/nap-tien")
@admin_required
def admin_deposits():
    status = request.args.get("status", "CHO_DUYET")
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        if status == "all":
            cursor.execute(
                """
                SELECT yc.*, nd.TenDangNhap, nd.HoTen
                FROM YeuCauNapTien yc JOIN NguoiDung nd ON nd.MaND = yc.MaND
                ORDER BY yc.NgayTao DESC LIMIT 100
                """
            )
        else:
            cursor.execute(
                """
                SELECT yc.*, nd.TenDangNhap, nd.HoTen
                FROM YeuCauNapTien yc JOIN NguoiDung nd ON nd.MaND = yc.MaND
                WHERE yc.TrangThai = %s ORDER BY yc.NgayTao DESC LIMIT 100
                """,
                (status,),
            )
        return jsonify({"success": True, "requests": [serialize_row(row) for row in cursor.fetchall()]})
    finally:
        cursor.close()
        conn.close()


@app.patch("/api/admin/nap-tien/<int:deposit_id>")
@admin_required
def admin_process_deposit(deposit_id):
    data = body_json()
    decision = str(data.get("status", "")).upper()
    note = str(data.get("note", "")).strip()[:500]
    if decision not in {"DA_DUYET", "TU_CHOI"}:
        return api_error("Quyết định không hợp lệ.")
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        conn.start_transaction()
        cursor.execute("SELECT * FROM YeuCauNapTien WHERE MaYeuCau = %s FOR UPDATE", (deposit_id,))
        deposit = cursor.fetchone()
        if not deposit:
            conn.rollback()
            return api_error("Không tìm thấy yêu cầu.", 404, "deposit_not_found")
        if deposit["TrangThai"] != "CHO_DUYET":
            conn.rollback()
            return api_error("Yêu cầu này đã được xử lý.", 409, "deposit_already_processed")
        cursor.execute(
            "SELECT MaND, TenDangNhap, HoTen, SoDu FROM NguoiDung WHERE MaND=%s FOR UPDATE",
            (deposit["MaND"],),
        )
        customer = cursor.fetchone()
        if not customer:
            conn.rollback()
            return api_error("Không tìm thấy tài khoản nhận tiền.", 404, "deposit_user_not_found")
        balance_before = Decimal(str(customer.get("SoDu") or 0))
        balance_after = balance_before
        if decision == "DA_DUYET":
            cursor.execute("UPDATE NguoiDung SET SoDu = SoDu + %s WHERE MaND = %s", (deposit["SoTien"], deposit["MaND"]))
            balance_after += Decimal(str(deposit["SoTien"]))
            cursor.execute(
                """
                INSERT INTO LichSuGiaoDich (MaND, LoaiGiaoDich, SoTien, MoTa)
                VALUES (%s, 'NAP', %s, %s)
                """,
                (deposit["MaND"], deposit["SoTien"], f"Duyệt yêu cầu {deposit['MaThamChieu']}"),
            )
        cursor.execute(
            """
            UPDATE YeuCauNapTien
            SET TrangThai = %s, MaAdminXuLy = %s, NgayXuLy = NOW(), GhiChuAdmin = %s
            WHERE MaYeuCau = %s
            """,
            (decision, g.current_user["MaND"], note or None, deposit_id),
        )
        before_deposit = {
            "MaYeuCau": deposit["MaYeuCau"], "MaThamChieu": deposit["MaThamChieu"],
            "MaND": deposit["MaND"], "TenDangNhapKhachHang": customer["TenDangNhap"],
            "HoTenKhachHang": customer["HoTen"], "SoTienNap": deposit["SoTien"],
            "SoDuKhachHang": balance_before, "TrangThaiYeuCau": deposit["TrangThai"],
            "TrangThai": deposit["TrangThai"], "MaAdminXuLy": deposit.get("MaAdminXuLy"),
            "NgayXuLy": deposit.get("NgayXuLy"), "AdminXuLy": None,
            "GhiChuAdmin": deposit.get("GhiChuAdmin"),
        }
        after_deposit = dict(before_deposit)
        after_deposit.update({
            "SoDuKhachHang": balance_after, "TrangThaiYeuCau": decision,
            "TrangThai": decision, "MaAdminXuLy": g.current_user["MaND"],
            "NgayXuLy": datetime.now(), "AdminXuLy": g.current_user.get("TenDangNhap"),
            "GhiChuAdmin": note or None,
        })
        audit_admin(
            cursor, "APPROVE" if decision == "DA_DUYET" else "REJECT",
            "YeuCauNapTien", deposit_id,
            {"TaiKhoan": customer["TenDangNhap"], "SoTienNap": deposit["SoTien"],
             "SoDuTruoc": balance_before, "SoDuSau": balance_after, "QuyetDinh": decision},
            serialize_row(before_deposit), serialize_row(after_deposit),
        )
        conn.commit()
        return jsonify({"success": True, "message": "Đã xử lý yêu cầu nạp tiền."})
    except mysql.connector.Error:
        conn.rollback()
        return api_error("Không thể xử lý yêu cầu.", 409, "deposit_update_failed")
    finally:
        cursor.close()
        conn.close()


@app.get("/api/admin/nhat-ky")
@app.get("/api/admin/audit-logs")
@admin_required
def admin_audit_logs():
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            """
            SELECT nk.*, nd.TenDangNhap, nd.HoTen AS HoTenAdmin, nd.Avatar AS AvatarAdmin,
                   p.DuLieuTruoc, p.DuLieuSau, p.TrangThai AS TrangThaiPheDuyet,
                   target_user.TenDangNhap AS DoiTuongTenDangNhap,
                   target_user.HoTen AS DoiTuongHoTen,
                   target_user.Email AS DoiTuongEmail,
                   target_user.SoDienThoai AS DoiTuongSoDienThoai,
                   target_user.Avatar AS DoiTuongAvatar,
                   target_product.TenSP AS DoiTuongTenSP,
                   target_product.ThuongHieu AS DoiTuongThuongHieu,
                   target_product.HinhAnh AS DoiTuongHinhAnh,
                   target_product.GiaBan AS DoiTuongGiaBan,
                   target_product.GiaGoc AS DoiTuongGiaGoc,
                   target_product.TonKho AS DoiTuongTonKho,
                   target_product.TrangThai AS DoiTuongTrangThai
            FROM NhatKyQuanTri nk JOIN NguoiDung nd ON nd.MaND = nk.MaND
            LEFT JOIN PheDuyetThayDoi p ON p.MaNhatKy = nk.MaNhatKy
            LEFT JOIN NguoiDung target_user
                   ON nk.DoiTuong = 'NguoiDung'
                  AND target_user.MaND = CAST(nk.MaDoiTuong AS UNSIGNED)
            LEFT JOIN SanPham target_product
                   ON nk.DoiTuong = 'SanPham'
                  AND target_product.MaSP = CAST(nk.MaDoiTuong AS UNSIGNED)
            ORDER BY nk.NgayTao DESC LIMIT 200
            """
        )
        logs = []
        for row in cursor.fetchall():
            item = serialize_row(row)
            try:
                detail = json.loads(row.get("ChiTiet") or "{}") if isinstance(row.get("ChiTiet"), str) else dict(row.get("ChiTiet") or {})
            except (TypeError, ValueError, json.JSONDecodeError):
                detail = {}
            if row.get("DoiTuong") == "NguoiDung":
                detail = {
                    "MaND": row.get("MaDoiTuong"),
                    "TenDangNhap": row.get("DoiTuongTenDangNhap"),
                    "HoTen": row.get("DoiTuongHoTen"),
                    "Email": row.get("DoiTuongEmail"),
                    "SoDienThoai": row.get("DoiTuongSoDienThoai"),
                    "Avatar": row.get("DoiTuongAvatar"),
                    **detail,
                }
            elif row.get("DoiTuong") == "SanPham":
                detail = {
                    "MaSP": row.get("MaDoiTuong"),
                    "TenSP": row.get("DoiTuongTenSP"),
                    "ThuongHieu": row.get("DoiTuongThuongHieu"),
                    "HinhAnh": row.get("DoiTuongHinhAnh"),
                    "GiaBan": row.get("DoiTuongGiaBan"),
                    "GiaGoc": row.get("DoiTuongGiaGoc"),
                    "TonKho": row.get("DoiTuongTonKho"),
                    "TrangThai": row.get("DoiTuongTrangThai"),
                    **detail,
                }
            item["ChiTiet"] = detail
            logs.append(item)
        return jsonify({"success": True, "logs": logs})
    finally:
        cursor.close()
        conn.close()


@app.get("/api/admin/phe-duyet-thay-doi")
@superadmin_required
def superadmin_changes():
    status = request.args.get("status", "CHO_XEM")
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        params = []
        where = ""
        if status in {"CHO_XEM", "DA_XAC_NHAN", "DA_HOAN_TAC"}:
            where = "WHERE p.TrangThai=%s"
            params.append(status)
        cursor.execute(
            f"""
            SELECT p.*, a.TenDangNhap, a.HoTen,
                   s.TenDangNhap AS SuperAdminXuLy
            FROM PheDuyetThayDoi p
            JOIN NguoiDung a ON a.MaND=p.MaAdmin
            LEFT JOIN NguoiDung s ON s.MaND=p.MaSuperAdmin
            {where}
            ORDER BY (p.TrangThai='CHO_XEM') DESC, p.NgayTao DESC
            LIMIT 300
            """,
            params,
        )
        items = []
        for row in cursor.fetchall():
            item = serialize_row(row)
            item["DuLieuTruoc"] = json.loads(row["DuLieuTruoc"]) if isinstance(row.get("DuLieuTruoc"), str) else row.get("DuLieuTruoc")
            item["DuLieuSau"] = json.loads(row["DuLieuSau"]) if isinstance(row.get("DuLieuSau"), str) else row.get("DuLieuSau")
            item["CoTheHoanTac"] = (
                bool(item.get("DuLieuTruoc"))
                and item["DoiTuong"] in {"SanPham", "YeuCauNapTien", "NguoiDung"}
                and item.get("DuLieuTruoc") != item.get("DuLieuSau")
            )
            items.append(item)
        return jsonify({"success": True, "changes": items})
    finally:
        cursor.close()
        conn.close()


@app.patch("/api/admin/phe-duyet-thay-doi/<int:change_id>")
@superadmin_required
def superadmin_review_change(change_id):
    data = body_json()
    decision = str(data.get("decision", "")).upper()
    note = str(data.get("note", "")).strip()[:500]
    if decision not in {"XAC_NHAN", "HOAN_TAC"}:
        return api_error("Quyết định không hợp lệ.")
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        conn.start_transaction()
        cursor.execute("SELECT * FROM PheDuyetThayDoi WHERE MaThayDoi=%s FOR UPDATE", (change_id,))
        change = cursor.fetchone()
        if not change:
            conn.rollback()
            return api_error("Không tìm thấy thay đổi.", 404, "change_not_found")
        if change["TrangThai"] != "CHO_XEM":
            conn.rollback()
            return api_error("Thay đổi này đã được Super Admin xử lý.", 409, "change_already_reviewed")
        before = json.loads(change["DuLieuTruoc"]) if isinstance(change.get("DuLieuTruoc"), str) else change.get("DuLieuTruoc")
        after = json.loads(change["DuLieuSau"]) if isinstance(change.get("DuLieuSau"), str) else change.get("DuLieuSau")
        if decision == "HOAN_TAC":
            if not before or change["DoiTuong"] not in {"SanPham", "YeuCauNapTien", "NguoiDung"}:
                conn.rollback()
                return api_error("Thao tác này chỉ hỗ trợ xác nhận, không thể hoàn tác tự động.", 409, "change_not_reversible")
            entity_id = int(change["MaDoiTuong"])
            if change["DoiTuong"] == "SanPham":
                columns = ["MaDM", "TenSP", "MoTa", "GiaBan", "GiaGoc", "TonKho", "HinhAnh", "ThuongHieu", "AnhChiTiet", "TrangThai", "NguonURL", "NguonTen"]
                cursor.execute(
                    f"UPDATE SanPham SET {', '.join(f'{column}=%s' for column in columns)}, NgayCapNhat=NOW() WHERE MaSP=%s",
                    [before.get(column) for column in columns] + [entity_id],
                )
            elif change["DoiTuong"] == "NguoiDung":
                cursor.execute(
                    """SELECT MaND,HoTen,Email,SoDienThoai,DiaChi,Avatar,SoDu,VaiTro,TrangThai
                       FROM NguoiDung WHERE MaND=%s FOR UPDATE""",
                    (entity_id,),
                )
                current_user = cursor.fetchone()
                if not current_user:
                    raise ValueError("user_not_found")
                if current_user.get("VaiTro") == "superadmin" or before.get("VaiTro") == "superadmin":
                    conn.rollback()
                    return api_error("Không thể hoàn tác dữ liệu của Super Admin.", 403, "protected_superadmin")
                allowed_columns = ["HoTen", "Email", "SoDienThoai", "DiaChi", "Avatar", "SoDu", "VaiTro", "TrangThai"]
                changed_columns = [column for column in allowed_columns if before.get(column) != (after or {}).get(column)]
                if not changed_columns:
                    conn.rollback()
                    return api_error("Thay đổi này không có dữ liệu cần hoàn tác.", 409, "nothing_to_rollback")
                for column in changed_columns:
                    current_value, expected_value = current_user.get(column), (after or {}).get(column)
                    if column == "SoDu":
                        matches = Decimal(str(current_value or 0)) == Decimal(str(expected_value or 0))
                    elif column == "TrangThai":
                        matches = int(current_value or 0) == int(expected_value or 0)
                    else:
                        matches = (current_value or None) == (expected_value or None)
                    if not matches:
                        conn.rollback()
                        return api_error(
                            f"Không thể hoàn tác vì trường {column} đã được thay đổi thêm sau đó.",
                            409, "rollback_conflict",
                        )
                previous_avatar = before.get("Avatar")
                if previous_avatar and previous_avatar.startswith("HA/avatars/"):
                    previous_path = os.path.abspath(os.path.join(PROJECT_ROOT, previous_avatar.replace("/", os.sep)))
                    if not os.path.isfile(previous_path):
                        conn.rollback()
                        return api_error("Ảnh đại diện cũ không còn trên máy chủ nên không thể khôi phục.", 409, "old_avatar_missing")
                cursor.execute(
                    f"UPDATE NguoiDung SET {', '.join(f'{column}=%s' for column in changed_columns)} WHERE MaND=%s",
                    [before.get(column) for column in changed_columns] + [entity_id],
                )
                if "TrangThai" in changed_columns and not bool(before.get("TrangThai")):
                    cursor.execute("UPDATE PhienDangNhap SET DaThuHoi=1 WHERE MaND=%s", (entity_id,))
            else:
                cursor.execute("SELECT * FROM YeuCauNapTien WHERE MaYeuCau=%s FOR UPDATE", (entity_id,))
                current = cursor.fetchone()
                if not current:
                    raise ValueError("deposit_not_found")
                if current["TrangThai"] == "DA_DUYET" and before.get("TrangThai") != "DA_DUYET":
                    cursor.execute("SELECT SoDu FROM NguoiDung WHERE MaND=%s FOR UPDATE", (current["MaND"],))
                    wallet = cursor.fetchone()
                    if not wallet or Decimal(str(wallet["SoDu"])) < Decimal(str(current["SoTien"])):
                        conn.rollback()
                        return api_error("Số dư người dùng không đủ để hoàn tác khoản nạp này.", 409, "insufficient_balance_for_rollback")
                    cursor.execute("UPDATE NguoiDung SET SoDu=SoDu-%s WHERE MaND=%s", (current["SoTien"], current["MaND"]))
                    cursor.execute("INSERT INTO LichSuGiaoDich (MaND,LoaiGiaoDich,SoTien,MoTa) VALUES (%s,'NAP',%s,%s)", (current["MaND"], -Decimal(str(current["SoTien"])), f"Super Admin hoàn tác yêu cầu {current['MaThamChieu']}"))
                cursor.execute(
                    "UPDATE YeuCauNapTien SET TrangThai=%s,MaAdminXuLy=%s,NgayXuLy=%s,GhiChuAdmin=%s WHERE MaYeuCau=%s",
                    (before.get("TrangThai"), before.get("MaAdminXuLy"), before.get("NgayXuLy"), before.get("GhiChuAdmin"), entity_id),
                )
        final_status = "DA_HOAN_TAC" if decision == "HOAN_TAC" else "DA_XAC_NHAN"
        cursor.execute(
            "UPDATE PheDuyetThayDoi SET TrangThai=%s,MaSuperAdmin=%s,GhiChu=%s,NgayXuLy=NOW() WHERE MaThayDoi=%s",
            (final_status, g.current_user["MaND"], note or None, change_id),
        )
        original_before = json.loads(change["DuLieuTruoc"]) if isinstance(change.get("DuLieuTruoc"), str) else change.get("DuLieuTruoc")
        original_after = json.loads(change["DuLieuSau"]) if isinstance(change.get("DuLieuSau"), str) else change.get("DuLieuSau")
        review_before = {
            "TrangThaiPheDuyet": change["TrangThai"], "HanhDongGoc": change["HanhDong"],
            "DoiTuongGoc": change["DoiTuong"], "MaDoiTuongGoc": change["MaDoiTuong"],
            "DuLieuTruocGoc": original_before, "DuLieuSauGoc": original_after,
            "SuperAdminXuLy": None, "GhiChuSuperAdmin": change.get("GhiChu"),
        }
        review_after = dict(review_before)
        review_after.update({
            "TrangThaiPheDuyet": final_status,
            "SuperAdminXuLy": g.current_user.get("TenDangNhap"),
            "GhiChuSuperAdmin": note or None,
        })
        audit_admin(
            cursor, decision, "PheDuyetThayDoi", change_id,
            {"target": change["DoiTuong"], "target_id": change["MaDoiTuong"],
             "QuyetDinh": decision, "HanhDongGoc": change["HanhDong"]},
            review_before, review_after,
        )
        conn.commit()
        message = "Đã hoàn tác quyết định của admin." if decision == "HOAN_TAC" else "Đã xác nhận quyết định của admin."
        return jsonify({"success": True, "message": message})
    except ValueError:
        conn.rollback()
        return api_error("Dữ liệu liên quan không còn tồn tại.", 404, "related_record_not_found")
    except mysql.connector.Error:
        conn.rollback()
        app.logger.exception("Không thể xử lý thay đổi admin")
        return api_error("Không thể xử lý thay đổi.", 409, "change_review_failed")
    finally:
        cursor.close()
        conn.close()


@app.cli.command("promote-admin")
@click.argument("username")
def promote_admin(username):
    """Nâng quyền một tài khoản hiện có thành admin (thao tác một lần)."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("UPDATE NguoiDung SET VaiTro = 'admin', TrangThai = 1 WHERE TenDangNhap = %s", (username,))
        if cursor.rowcount != 1:
            conn.rollback()
            raise click.ClickException("Không tìm thấy tài khoản.")
        conn.commit()
        click.echo("Đã cấp quyền admin.")
    finally:
        cursor.close()
        conn.close()


@app.cli.command("promote-superadmin")
@click.argument("username")
def promote_superadmin(username):
    """Cấp Super Admin qua SSH với cờ môi trường, mật khẩu và xác nhận."""
    if not env_enabled("ALLOW_SUPERADMIN_BOOTSTRAP"):
        raise click.ClickException(
            "Lệnh đang khóa. Chỉ bật ALLOW_SUPERADMIN_BOOTSTRAP=1 cho đúng lần chạy này."
        )
    password = click.prompt("Mật khẩu hiện tại của tài khoản đích", hide_input=True)
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            "SELECT MaND,TenDangNhap,MatKhau,VaiTro,TrangThai FROM NguoiDung "
            "WHERE TenDangNhap=%s FOR UPDATE",
            (username,),
        )
        target = cursor.fetchone()
        if not target:
            conn.rollback()
            raise click.ClickException("Không tìm thấy tài khoản.")
        valid, _ = verify_password(target.get("MatKhau") or "", password)
        if not valid:
            conn.rollback()
            raise click.ClickException("Mật khẩu tài khoản không chính xác.")
        if target.get("VaiTro") == "superadmin" and bool(target.get("TrangThai")):
            conn.rollback()
            click.echo("Tài khoản đã là Super Admin đang hoạt động.")
            return
        if not click.confirm(
            f"Cấp quyền CAO NHẤT cho @{target['TenDangNhap']} và đăng xuất mọi phiên hiện tại?",
            default=False,
        ):
            conn.rollback()
            click.echo("Đã hủy; không có dữ liệu nào thay đổi.")
            return
        before = {"VaiTro": target.get("VaiTro"), "TrangThai": bool(target.get("TrangThai"))}
        after = {"VaiTro": "superadmin", "TrangThai": True}
        cursor.execute(
            "UPDATE NguoiDung SET VaiTro='superadmin',TrangThai=1 WHERE MaND=%s",
            (target["MaND"],),
        )
        cursor.execute("UPDATE PhienDangNhap SET DaThuHoi=1 WHERE MaND=%s", (target["MaND"],))
        cursor.execute(
            """
            INSERT INTO NhatKyQuanTri
                (MaND,HanhDong,DoiTuong,MaDoiTuong,ChiTiet,DiaChiIP)
            VALUES (%s,'BOOTSTRAP_SUPERADMIN','NguoiDung',%s,%s,'server-cli')
            """,
            (
                target["MaND"], str(target["MaND"]),
                json.dumps({"before": before, "after": after, "source": "authenticated-server-cli"}, ensure_ascii=False),
            ),
        )
        conn.commit()
        click.echo("Đã cấp Super Admin, thu hồi phiên cũ và ghi nhật ký. Hãy tắt biến môi trường ngay.")
    except click.ClickException:
        raise
    except mysql.connector.Error as exc:
        conn.rollback()
        raise click.ClickException("Không thể cập nhật quyền trong cơ sở dữ liệu.") from exc
    finally:
        cursor.close()
        conn.close()


@app.errorhandler(404)
def not_found(_error):
    return api_error("Không tìm thấy tài nguyên.", 404, "not_found")


@app.errorhandler(405)
def method_not_allowed(_error):
    return api_error("Phương thức không được hỗ trợ.", 405, "method_not_allowed")


@app.errorhandler(413)
def payload_too_large(_error):
    return api_error("Dữ liệu gửi lên quá lớn.", 413, "payload_too_large")


@app.errorhandler(mysql.connector.Error)
def unhandled_database_error(_error):
    app.logger.exception("Lỗi cơ sở dữ liệu chưa được xử lý")
    return api_error("Cơ sở dữ liệu tạm thời không khả dụng.", 503, "database_error")


if __name__ == "__main__":
    app.run(
        debug=os.getenv("FLASK_DEBUG", "0") == "1",
        port=int(os.getenv("PORT", "5000")),
        host=os.getenv("HOST", "127.0.0.1"),
    )
