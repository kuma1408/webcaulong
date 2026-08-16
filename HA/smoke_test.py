"""Smoke test không ghi database cho API Badminton Store."""

from __future__ import annotations

import io
import pathlib
import unittest

from PIL import Image
from werkzeug.datastructures import FileStorage

from HA.app import (
    SlidingWindowLimiter,
    app,
    normalize_public_url,
    normalize_sql_table_names,
    normalized_avatar,
    normalized_public_image,
    sanitize_rich_text,
    verify_password,
)
from werkzeug.security import generate_password_hash


class ApiSmokeTest(unittest.TestCase):
    def setUp(self):
        app.config.update(TESTING=True)
        self.client = app.test_client()

    def test_route_surface(self):
        api_rules = [rule for rule in app.url_map.iter_rules() if rule.rule.startswith("/api/")]
        self.assertGreaterEqual(len(api_rules), 45)

    def test_login_validation_does_not_touch_database(self):
        response = self.client.post("/api/dang-nhap", json={})
        self.assertEqual(response.status_code, 400)
        self.assertFalse(response.get_json()["success"])
        self.assertEqual(response.headers["Cache-Control"], "no-store")

    def test_password_verification_supports_current_and_legacy_hashes(self):
        current = generate_password_hash("Matkhau123")
        self.assertEqual(verify_password(current, "Matkhau123"), (True, False))
        self.assertEqual(verify_password(current, "sai-mat-khau"), (False, False))

    def test_registration_validation_does_not_touch_database(self):
        response = self.client.post(
            "/api/dang-ky",
            json={"username": "x", "password": "123", "fullname": "A", "email": "sai"},
        )
        self.assertEqual(response.status_code, 400)
        self.assertFalse(response.get_json()["success"])

    def test_password_recovery_validation_is_enumeration_safe(self):
        forgot = self.client.post("/api/quen-mat-khau", json={"email": "khong-hop-le"})
        self.assertEqual(forgot.status_code, 202)
        self.assertTrue(forgot.get_json()["success"])
        self.assertNotIn("tồn tại", forgot.get_json()["message"].lower().replace("nếu email tồn tại", ""))

        reset = self.client.post(
            "/api/dat-lai-mat-khau",
            json={"token": "ngan", "password": "Matkhau123"},
        )
        self.assertEqual(reset.status_code, 400)
        self.assertEqual(reset.get_json()["code"], "invalid_reset_token")

    def test_api_errors_are_json_and_do_not_leak_internals(self):
        wrong_method = self.client.delete("/api/dang-nhap")
        self.assertEqual(wrong_method.status_code, 405)
        self.assertEqual(wrong_method.get_json()["code"], "method_not_allowed")

        oversized = self.client.post(
            "/api/dang-nhap",
            data=b'{"payload":"' + b"x" * (4 * 1024 * 1024 + 1) + b'"}',
            content_type="application/json",
        )
        self.assertEqual(oversized.status_code, 413)
        self.assertEqual(oversized.get_json()["code"], "payload_too_large")

    def test_admin_requires_bearer_token(self):
        response = self.client.get("/api/admin/dashboard")
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.get_json()["code"], "unauthorized")

    def test_wishlist_requires_bearer_token(self):
        response = self.client.get("/api/yeu-thich")
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.get_json()["code"], "unauthorized")

    def test_health_is_structured_with_or_without_database(self):
        response = self.client.get("/api/health")
        self.assertIn(response.status_code, {200, 503})
        self.assertIn("success", response.get_json())
        self.assertEqual(response.headers["X-Content-Type-Options"], "nosniff")

    def test_security_headers_and_static_cache_policy(self):
        html = self.client.get("/")
        try:
            self.assertEqual(html.status_code, 200)
            self.assertIn("default-src 'self'", html.headers["Content-Security-Policy"])
            self.assertEqual(html.headers["Cross-Origin-Opener-Policy"], "same-origin")
            self.assertIn("no-cache", html.headers["Cache-Control"])
        finally:
            html.close()

        javascript = self.client.get("/css/auth.js")
        try:
            self.assertEqual(javascript.status_code, 200)
            self.assertIn("public", javascript.headers["Cache-Control"])
        finally:
            javascript.close()

    def test_rich_text_sanitizer_removes_stored_xss(self):
        dirty = '<p onclick="steal()">Mô tả</p><script>alert(1)</script><a href="javascript:alert(2)">Mở</a>'
        clean = sanitize_rich_text(dirty)
        self.assertIn("<p>Mô tả</p>", clean)
        self.assertNotIn("onclick", clean)
        self.assertNotIn("<script", clean)
        self.assertNotIn("javascript:", clean)

    def test_public_url_validation_blocks_dangerous_schemes_and_traversal(self):
        self.assertIsNone(normalize_public_url("javascript:alert(1)", allow_relative=True))
        self.assertIsNone(normalize_public_url("../../.env", allow_relative=True))
        self.assertEqual(
            normalize_public_url("HA/avatars/user.webp", allow_relative=True),
            "HA/avatars/user.webp",
        )

    def test_sql_table_names_are_linux_safe_without_changing_audit_values(self):
        sql = (
            "SELECT * FROM NguoiDung nd JOIN PhienDangNhap p ON p.MaND=nd.MaND "
            "WHERE nd.VaiTro=%s AND p.DoiTuong='NguoiDung'"
        )
        normalized = normalize_sql_table_names(sql)
        self.assertIn("FROM `nguoidung`", normalized)
        self.assertIn("JOIN `phiendangnhap`", normalized)
        self.assertIn("'NguoiDung'", normalized)

    def test_avatar_is_reencoded_and_cropped_to_safe_webp(self):
        source = io.BytesIO()
        Image.new("RGB", (900, 500), (240, 80, 30)).save(source, format="PNG")
        source.seek(0)
        output = normalized_avatar(source)
        with Image.open(io.BytesIO(output)) as image:
            self.assertEqual(image.format, "WEBP")
            self.assertEqual(image.size, (512, 512))

    def test_fake_image_signature_is_rejected(self):
        with self.assertRaises(ValueError):
            normalized_avatar(io.BytesIO(b"\xff\xd8\xff" + b"not-a-real-image"))

    def test_admin_media_requires_bearer_token(self):
        response = self.client.post("/api/admin/media")
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.get_json()["code"], "unauthorized")

    def test_product_image_is_reencoded_without_square_crop(self):
        source = io.BytesIO()
        Image.new("RGB", (2400, 1200), (250, 90, 30)).save(source, format="PNG")
        source.seek(0)
        output = normalized_public_image(FileStorage(stream=source, filename="product.png"))
        with Image.open(io.BytesIO(output)) as image:
            self.assertEqual(image.format, "WEBP")
            self.assertEqual(image.size, (1800, 900))

    def test_rate_limiter_rejects_after_limit(self):
        limiter = SlidingWindowLimiter()
        self.assertEqual(limiter.check("login", "127.0.0.1", 2, 60)[0], True)
        self.assertEqual(limiter.check("login", "127.0.0.1", 2, 60)[0], True)
        allowed, retry_after = limiter.check("login", "127.0.0.1", 2, 60)
        self.assertFalse(allowed)
        self.assertGreaterEqual(retry_after, 1)

    def test_detail_page_does_not_collect_card_or_cvv(self):
        detail_path = pathlib.Path(__file__).resolve().parent.parent / "chitiet.html"
        content = detail_path.read_text(encoding="utf-8")
        self.assertNotIn('id="cardNumInput"', content)
        self.assertNotIn('id="cardCvvInput"', content)
        self.assertIn("Website không thu thập số thẻ hay mã CVV", content)


if __name__ == "__main__":
    unittest.main()
