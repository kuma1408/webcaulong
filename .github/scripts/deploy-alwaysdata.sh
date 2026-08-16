#!/usr/bin/env bash
set -Eeuo pipefail

app_path="${1:?Thiếu đường dẫn ứng dụng}"
apply_migration="${2:-false}"
archive="$HOME/webcaulong-release.tar.gz"
backup_dir="$HOME/backups"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"

case "$app_path" in
  "$HOME"/www/*) ;;
  *) echo "Đường dẫn triển khai nằm ngoài thư mục www của tài khoản." >&2; exit 2 ;;
esac

test -f "$archive"
mkdir -p "$app_path" "$backup_dir"

if [ -f "$app_path/wsgi.py" ]; then
  tar --exclude=.venv --exclude=.env --exclude=HA/avatars \
    -czf "$backup_dir/webcaulong-code-$stamp.tar.gz" -C "$app_path" .
fi

tar -xzf "$archive" -C "$app_path"
cd "$app_path"

if [ ! -x .venv/bin/python ]; then
  python3 -m venv .venv
fi
. .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
python -m compileall -q HA wsgi.py
python -m unittest HA.smoke_test -v

if [ "$apply_migration" = "true" ]; then
  python HA/migrate_database.py --apply
else
  python HA/migrate_database.py
  echo "Migration mới (nếu có) mới chỉ được kiểm tra. Hãy sao lưu DB rồi chạy lại workflow với apply_migration=true."
fi

touch wsgi.py
rm -f "$archive" "$HOME/deploy-alwaysdata.sh"
echo "Triển khai hoàn tất: $app_path"
