"""Lưu ảnh công khai bền vững trên ổ đĩa persistent của Alwaysdata/local."""

from __future__ import annotations

import os
import secrets


PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOCAL_AVATAR_FOLDER = os.path.join(PROJECT_ROOT, "HA", "avatars")
LOCAL_UPLOAD_FOLDER = os.path.join(PROJECT_ROOT, "HA", "uploads")


class MediaStorageError(RuntimeError):
    """Lỗi lưu trữ công khai đã được rút gọn trước khi trả về client."""


def _write_atomic(path: str, data: bytes) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    temporary_path = f"{path}.{secrets.token_hex(6)}.tmp"
    try:
        with open(temporary_path, "xb") as handle:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary_path, path)
    finally:
        try:
            os.remove(temporary_path)
        except OSError:
            pass


def save_avatar(user_id: int, image_data: bytes) -> str:
    """Lưu WebP đã được ứng dụng xác thực và trả URL/path công khai."""
    filename = f"user-{int(user_id)}-{secrets.token_hex(8)}.webp"
    relative_path = f"HA/avatars/{filename}"
    try:
        _write_atomic(os.path.join(LOCAL_AVATAR_FOLDER, filename), image_data)
    except OSError as exc:
        raise MediaStorageError("Không thể lưu ảnh đại diện.") from exc
    return relative_path


def save_public_image(purpose: str, image_data: bytes) -> str:
    """Lưu ảnh sản phẩm/nội dung và trả URL/path công khai bất biến."""
    safe_purpose = str(purpose or "").strip().lower()
    if safe_purpose not in {"products", "content"}:
        raise MediaStorageError("Nhóm ảnh không hợp lệ.")
    filename = f"{safe_purpose[:-1]}-{secrets.token_hex(12)}.webp"
    relative_path = f"HA/uploads/{safe_purpose}/{filename}"
    try:
        _write_atomic(
            os.path.join(LOCAL_UPLOAD_FOLDER, safe_purpose, filename),
            image_data,
        )
    except OSError as exc:
        raise MediaStorageError("Không thể lưu ảnh sản phẩm/nội dung.") from exc
    return relative_path


def delete_avatar(reference: str | None) -> None:
    """Xóa đúng ảnh do ứng dụng sở hữu; không bao giờ xóa URL bên ngoài."""
    value = str(reference or "").strip()
    if not value:
        return
    if value.startswith("HA/avatars/"):
        filename = value.removeprefix("HA/avatars/")
        if filename and "/" not in filename and "\\" not in filename:
            try:
                os.remove(os.path.join(LOCAL_AVATAR_FOLDER, filename))
            except OSError:
                pass
        return
