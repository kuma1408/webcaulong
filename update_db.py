"""Điểm vào tương thích cho migration schema mới.

Script cũ đã được thay bằng migration additive/idempotent. Mặc định lệnh này
chỉ kiểm tra; truyền ``--apply`` mới thay đổi schema.
"""

from HA.migrate_database import main


if __name__ == "__main__":
    raise SystemExit(main())
