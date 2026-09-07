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
    fuzzy_product_score,
    normalize_search_text,
    product_category_intent,
    normalize_public_url,
    normalize_sql_table_names,
    normalized_avatar,
    normalized_public_image,
    sanitize_rich_text,
    validate_racket_configuration,
    validated_product_specs,
    verify_password,
)
from werkzeug.security import generate_password_hash
from HA.vietqr import build_payload as build_vietqr_payload, make_png as make_vietqr_png, transfer_content


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

    def test_fuzzy_search_handles_vietnamese_accents_and_typo(self):
        product = {
            "TenSP": "Vợt Cầu Lông Lining Axforce 90",
            "ThuongHieu": "Lining",
            "TenDM": "Vợt cầu lông",
        }
        unrelated = {
            "TenSP": "Balo Kawasaki 8245",
            "ThuongHieu": "Kawasaki",
            "TenDM": "Balo",
        }
        self.assertEqual(normalize_search_text("Vợt Lining"), "vot lining")
        self.assertGreater(fuzzy_product_score("vot lning", product), 0.7)
        self.assertGreater(
            fuzzy_product_score("vot lning", product),
            fuzzy_product_score("vot lning", unrelated),
        )

    def test_search_category_intent_puts_rackets_before_accessories(self):
        racket = {"TenSP": "Vợt Cầu Lông Lining Axforce 90", "TenDM": "Vợt Cầu Lông"}
        string = {"TenSP": "Dây cước căng vợt Lining L9", "TenDM": "Phụ Kiện"}
        self.assertEqual(product_category_intent("vợt lining", racket), 2)
        self.assertEqual(product_category_intent("vợt lining", string), 0)

    def test_grip_search_is_not_confused_with_shorts(self):
        grip = {"TenSP": "Quấn cán vợt Yonex AC102", "TenDM": "Phụ Kiện"}
        shorts = {"TenSP": "Quần cầu lông Yonex Q33", "TenDM": "Quần Cầu Lông"}
        self.assertEqual(product_category_intent("quấn cán", grip), 2)
        self.assertEqual(product_category_intent("quấn cán", shorts), 0)

    def test_vietqr_payload_has_valid_shape_and_png(self):
        content = transfer_content("NAP-21-ABC123", 500000)
        payload = build_vietqr_payload("970422", "0123456789", 500000, content)
        self.assertTrue(payload.startswith("000201010212"))
        self.assertIn("5406500000", payload)
        self.assertRegex(payload, r"6304[0-9A-F]{4}$")
        png = make_vietqr_png(payload)
        self.assertTrue(png.startswith(b"\x89PNG\r\n\x1a\n"))

    def test_racket_configuration_is_whitelisted_and_normalized(self):
        config = validate_racket_configuration({
            "weight_grip": "4u-g5",
            "string": "yonex_bg65",
            "tension_lbs": "25",
            "addons": ["QUAN_CAN_CAO_SU", "QUAN_CAN_CAO_SU"],
        })
        self.assertEqual(config["weight_grip"], "4U-G5")
        self.assertEqual(config["tension_lbs"], 25)
        self.assertEqual(config["addons"], ["QUAN_CAN_CAO_SU"])
        with self.assertRaises(ValueError):
            validate_racket_configuration({
                "weight_grip": "4U-G5", "string": "YONEX_BG65",
                "tension_lbs": 99, "addons": [],
            })

    def test_product_racket_specs_are_bounded(self):
        specs = validated_product_specs({
            "weight_grip": "5u-g5", "play_style": "phong_thu",
            "balance": "nhe_dau", "stiffness": "mem", "max_tension": "28",
        })
        self.assertEqual(specs["max_tension"], 28)
        self.assertEqual(specs["play_style"], "PHONG_THU")
        with self.assertRaises(ValueError):
            validated_product_specs({"max_tension": 41})

    def test_support_table_name_is_linux_safe(self):
        statement = normalize_sql_table_names("SELECT * FROM YeuCauHoTro")
        self.assertIn("`yeucauhotro`", statement)

    def test_support_validation_does_not_touch_database(self):
        response = self.client.post(
            "/api/lien-he",
            json={
                "fullname": "A",
                "email": "khong-hop-le",
                "subject": "KHAC",
                "reply_channel": "EMAIL",
                "message": "quá ngắn",
                "privacy_accepted": True,
            },
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.get_json()["code"], "invalid_contact")

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

    def test_rate_limiter_preview_does_not_consume_attempt(self):
        limiter = SlidingWindowLimiter()
        for _ in range(10):
            self.assertEqual(limiter.check("support", "127.0.0.1", 1, 60, consume=False), (True, 0))
        self.assertEqual(limiter.check("support", "127.0.0.1", 1, 60), (True, 0))
        self.assertFalse(limiter.check("support", "127.0.0.1", 1, 60)[0])

    def test_detail_page_does_not_collect_card_or_cvv(self):
        detail_path = pathlib.Path(__file__).resolve().parent.parent / "chitiet.html"
        content = detail_path.read_text(encoding="utf-8")
        self.assertNotIn('id="cardNumInput"', content)
        self.assertNotIn('id="cardCvvInput"', content)
        self.assertIn("Website không thu thập số thẻ", content)
        self.assertIn("OTP", content)

    def test_api_errors_stay_json_even_for_browser_accept_header(self):
        response = self.client.get(
            "/api/khong-co-that",
            headers={"Accept": "text/html,application/xhtml+xml,*/*;q=0.8"},
        )
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.mimetype, "application/json")
        self.assertEqual(response.get_json()["code"], "not_found")

    def test_browser_navigation_receives_html_error_page(self):
        response = self.client.get(
            "/trang-khong-ton-tai",
            headers={"Accept": "text/html,application/xhtml+xml,*/*;q=0.8"},
        )
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.mimetype, "text/html")
        self.assertIn("error-page", response.get_data(as_text=True))

    def test_robots_and_sitemap_are_served(self):
        robots = self.client.get("/robots.txt")
        self.assertEqual(robots.status_code, 200)
        self.assertEqual(robots.mimetype, "text/plain")
        robots_body = robots.get_data(as_text=True)
        self.assertIn("Disallow: /api/", robots_body)
        self.assertIn("Sitemap:", robots_body)

        sitemap = self.client.get("/sitemap.xml")
        self.assertEqual(sitemap.status_code, 200)
        self.assertEqual(sitemap.mimetype, "application/xml")
        self.assertIn("trangchu.html", sitemap.get_data(as_text=True))

    def test_favicon_is_available_for_browsers(self):
        response = self.client.get("/favicon.ico")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.mimetype, "image/svg+xml")

    def test_sensitive_root_files_are_not_public(self):
        for path in ("/requirements.txt", "/package.json", "/.env", "/HA/app.py", "/wsgi.py"):
            with self.subTest(path=path):
                self.assertEqual(self.client.get(path).status_code, 404)

    def test_every_page_declares_favicon(self):
        root = pathlib.Path(__file__).resolve().parent.parent
        missing = [
            page.name
            for page in sorted(root.glob("*.html"))
            if 'rel="icon"' not in page.read_text(encoding="utf-8")
        ]
        self.assertEqual(missing, [])


if __name__ == "__main__":
    unittest.main()
