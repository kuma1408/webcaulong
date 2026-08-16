#!/usr/bin/env bash
set -Eeuo pipefail

app_path="${1:?Thiếu đường dẫn ứng dụng}"
apply_migration="${2:-false}"
archive="$HOME/webcaulong-release.tar.gz"
backup_dir="$HOME/backups"
release_dir="$HOME/releases"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
stage="$release_dir/webcaulong-$stamp"

case "$app_path" in
  "$HOME"/www/*) ;;
  *) echo "Đường dẫn triển khai nằm ngoài thư mục www của tài khoản." >&2; exit 2 ;;
esac
case "$apply_migration" in
  true|false) ;;
  *) echo "Tùy chọn migration chỉ nhận true hoặc false." >&2; exit 2 ;;
esac

test -f "$archive"
mkdir -p "$app_path" "$backup_dir" "$release_dir" "$stage"
cleanup() { rm -rf -- "$stage"; }
trap cleanup EXIT

tar -xzf "$archive" -C "$stage"
if [ ! -f "$app_path/.env" ]; then
  echo "Thiếu $app_path/.env; dừng trước khi thay đổi website." >&2
  exit 3
fi
ln -s "$app_path/.env" "$stage/.env"

if [ ! -x "$app_path/.venv/bin/python" ]; then
  python -m venv "$app_path/.venv"
fi
python_bin="$app_path/.venv/bin/python"

"$python_bin" -m pip install --upgrade pip
"$python_bin" -m pip install -r "$stage/requirements.txt"
cd "$stage"
"$python_bin" -m compileall -q HA wsgi.py
"$python_bin" -m unittest HA.smoke_test -v

if [ "$apply_migration" = "true" ]; then
  "$python_bin" HA/migrate_database.py --apply
  "$python_bin" HA/migrate_database.py --require-current
else
  "$python_bin" HA/migrate_database.py --require-current
fi

if [ -f "$app_path/wsgi.py" ]; then
  tar --exclude=.venv --exclude=.env --exclude=HA/avatars --exclude=HA/uploads \
    -czf "$backup_dir/webcaulong-code-$stamp.tar.gz" -C "$app_path" .
fi

if ! command -v rsync >/dev/null 2>&1; then
  echo "Máy chủ thiếu rsync; dừng trước khi thay đổi website." >&2
  exit 4
fi
rsync -a --delete \
  --exclude=.env --exclude=.venv --exclude=HA/avatars --exclude=HA/uploads \
  "$stage/" "$app_path/"

mkdir -p "$app_path/HA/avatars" "$app_path/HA/uploads/products" "$app_path/HA/uploads/content"
touch "$app_path/wsgi.py"

shopt -s nullglob
backups=("$backup_dir"/webcaulong-code-*.tar.gz)
if [ "${#backups[@]}" -gt 3 ]; then
  printf '%s\n' "${backups[@]}" | sort | head -n -3 | while IFS= read -r old_backup; do
    case "$old_backup" in
      "$backup_dir"/webcaulong-code-*.tar.gz) rm -f -- "$old_backup" ;;
    esac
  done
fi

rm -f -- "$archive" "$HOME/deploy-alwaysdata.sh"
echo "Triển khai an toàn hoàn tất: $app_path"
