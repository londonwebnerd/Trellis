#!/bin/sh
# Set safe ownership on a Trellis install (run after installing or updating):
#
#   sudo sh deploy/fix-permissions.sh [/opt/trellis] [www-data]
#
# - The code is owned by root: the app can read it but never modify it.
# - Only server/data (the page, uploads, password hash, keys) belongs to the
#   user the app runs as, and only that user can read it.
# - .env is readable by the app but not by other users.
set -eu
DIR="${1:-/opt/trellis}"
APP_USER="${2:-www-data}"

[ -f "$DIR/server/src/index.js" ] || { echo "No Trellis install in $DIR" >&2; exit 1; }
id "$APP_USER" >/dev/null 2>&1 || { echo "No such user: $APP_USER" >&2; exit 1; }
APP_GROUP="$(id -gn "$APP_USER")"

chown -R root:root "$DIR"
# The code must be readable by the app: a zip built from files that were
# private to someone's own account (mode 600) would otherwise fail to start.
# server/data and .env are left alone here and locked down below.
find "$DIR" -path "$DIR/server/data" -prune -o -path "$DIR/.env" -prune -o -type d -exec chmod 755 {} +
find "$DIR" -path "$DIR/server/data" -prune -o -path "$DIR/.env" -prune -o -type f -exec chmod u+rw,go+r,go-w {} +
mkdir -p "$DIR/server/data"
chown -R "$APP_USER:$APP_GROUP" "$DIR/server/data"
chmod 700 "$DIR/server/data"
if [ -f "$DIR/.env" ]; then
  chown "root:$APP_GROUP" "$DIR/.env"
  chmod 640 "$DIR/.env"
fi
echo "Permissions set: code owned by root, data owned by $APP_USER."
