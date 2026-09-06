"""Sinh mã VietQR chuẩn NAPAS cho nạp ví và thanh toán đơn hàng."""

from __future__ import annotations

import io
import unicodedata


VIETQR_GUID = "A000000727"
TRANSFER_SERVICE = "QRIBFTTA"


def _tlv(tag: str, value: object) -> str:
    text = str(value)
    return f"{tag}{len(text):02d}{text}"


def _ascii(value: object) -> str:
    text = str(value or "").replace("Đ", "D").replace("đ", "d")
    normalized = unicodedata.normalize("NFD", text)
    return " ".join(
        "".join(char for char in normalized if unicodedata.category(char) != "Mn").split()
    )


def _crc16(data: str) -> str:
    crc = 0xFFFF
    for char in data.encode("utf-8"):
        crc ^= char << 8
        for _ in range(8):
            crc = ((crc << 1) ^ 0x1021) & 0xFFFF if crc & 0x8000 else (crc << 1) & 0xFFFF
    return f"{crc:04X}"


def transfer_content(reference: str, amount: int | float | None = None) -> str:
    parts = [_ascii(reference).upper()[:32]]
    if amount:
        parts.append(f"{int(round(float(amount)))}D")
    parts.append("BADMINTON STORE")
    return " ".join(part for part in parts if part)[:60]


def build_payload(bank_bin: str, account_no: str, amount: int, content: str) -> str:
    account = (
        _tlv("00", VIETQR_GUID)
        + _tlv("01", _tlv("00", bank_bin) + _tlv("01", account_no))
        + _tlv("02", TRANSFER_SERVICE)
    )
    payload = _tlv("00", "01") + _tlv("01", "12") + _tlv("38", account) + _tlv("53", "704")
    payload += _tlv("54", str(int(amount))) + _tlv("58", "VN")
    payload += _tlv("62", _tlv("08", _ascii(content)[:60]))
    payload += "6304"
    return payload + _crc16(payload)


def make_png(payload: str, box_size: int = 8) -> bytes:
    import qrcode

    qr = qrcode.QRCode(
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=max(5, min(int(box_size), 12)),
        border=2,
    )
    qr.add_data(payload)
    qr.make(fit=True)
    image = qr.make_image(fill_color="#181210", back_color="white")
    output = io.BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()
