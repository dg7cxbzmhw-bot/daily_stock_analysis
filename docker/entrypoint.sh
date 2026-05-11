#!/bin/sh
set -eu

APP_USER="dsa"
APP_GROUP="dsa"
APP_UID="1000"
APP_GID="1000"
WRITABLE_DIRS="/app/data /app/logs /app/reports"
DATABASE_FILE="${DATABASE_PATH:-/app/data/stock_analysis.db}"

warn() {
    printf '%s\n' "$*" >&2
}

can_write_dir_as_app_user() {
    gosu "$APP_USER:$APP_GROUP" sh -c '
        tmp="$1/.dsa-write-check.$$"
        : > "$tmp" && rm -f "$tmp"
    ' sh "$1"
}

can_write_file_as_app_user() {
    gosu "$APP_USER:$APP_GROUP" test -w "$1"
}

directory_needs_repair() {
    dir="$1"

    if ! can_write_dir_as_app_user "$dir"; then
        return 0
    fi

    if [ "$dir" = "/app/data" ]; then
        for file in "$DATABASE_FILE" "$DATABASE_FILE-wal" "$DATABASE_FILE-shm"; do
            if [ -e "$file" ] && ! can_write_file_as_app_user "$file"; then
                return 0
            fi
        done
    fi

    mismatched_child="$(
        find "$dir" -mindepth 1 -maxdepth 1 \
            \( ! -user "$APP_UID" -o ! -group "$APP_GID" \) \
            -print -quit 2>/dev/null || true
    )"
    if [ -n "$mismatched_child" ]; then
        return 0
    fi

    return 1
}

if [ "$(id -u)" = "0" ]; then
    for dir in $WRITABLE_DIRS; do
        if ! mkdir -p "$dir"; then
            warn "WARN: unable to create $dir; application writes may fail for this path."
            continue
        fi

        if ! directory_needs_repair "$dir"; then
            continue
        fi

        if ! chown -R "$APP_UID:$APP_GID" "$dir"; then
            warn "WARN: unable to set ownership for $dir; check read-only, rootless, or NFS mount permissions if writes fail."
        fi

        if ! chmod -R u+rwX "$dir"; then
            warn "WARN: unable to make $dir writable for $APP_USER; check read-only, rootless, or NFS mount permissions if writes fail."
        fi
    done

    exec gosu "$APP_USER:$APP_GROUP" "$@"
fi

exec "$@"
