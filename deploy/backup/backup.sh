#!/usr/bin/env bash
# Nightly backup of a server: runs the dump scripts in hooks.d (e.g. database dumps), then backs up
# /opt and all Docker volumes with restic (encrypted), and removes old backups. Data with a short
# retention is in /srv/temp, which is not backed up.
# Runs as root, from backup.service. Setup and restore: docs/install/backups.md
#
# Settings in /etc/restic/env (optional; also read by restic.sh):
#   RESTIC_REPOSITORY      where the backups go (default: /var/backups/restic)
#   RESTIC_PASSWORD_FILE   the encryption password (default: /etc/restic/password)
#   BACKUP_PATHS           what to back up (default: /opt /var/lib/docker/volumes)
#   HOOKS_DIR              the dump scripts of this server (default: /opt/backup/hooks.d)
#   KEEP                   which backups to keep (default: 7 daily, 4 weekly, 6 monthly)
# plus whatever the repository needs (e.g. AWS_ACCESS_KEY_ID for S3).
# What to leave out (e.g. large caches): /etc/restic/excludes, one restic pattern per line.

set -uo pipefail

if [ -f /etc/restic/env ]; then
	set -a
	# shellcheck disable=SC1091
	. /etc/restic/env
	set +a
fi
export RESTIC_REPOSITORY="${RESTIC_REPOSITORY:-/var/backups/restic}"
export RESTIC_PASSWORD_FILE="${RESTIC_PASSWORD_FILE:-/etc/restic/password}"
BACKUP_PATHS="${BACKUP_PATHS:-/opt /var/lib/docker/volumes}"
HOOKS_DIR="${HOOKS_DIR:-/opt/backup/hooks.d}"
KEEP="${KEEP:---keep-daily 7 --keep-weekly 4 --keep-monthly 6}"

umask 077
failed=0

# 1. Dumps. A failing hook doesn't stop the backup (the rest is still worth saving), but the run
#    ends with an error, so systemd marks it as failed.
for hook in "$HOOKS_DIR"/*.sh; do
	[ -e "$hook" ] || continue
	echo "hook: $hook"
	if ! bash "$hook"; then
		echo "ERROR: hook failed: $hook" >&2
		failed=1
	fi
done

# 2. The backup, of the paths that exist (a server without Docker has no volumes). Exit code 3
#    means some files couldn't be read (e.g. removed during the backup): the snapshot is saved,
#    but the run is marked as failed.
paths=()
for path in $BACKUP_PATHS; do
	[ -e "$path" ] && paths+=("$path")
done
excludes=()
[ -f /etc/restic/excludes ] && excludes=(--exclude-file /etc/restic/excludes)
restic backup "${paths[@]}" "${excludes[@]}" --tag nightly
status=$?
if [ "$status" -ne 0 ]; then
	echo "ERROR: restic backup ended with exit code $status" >&2
	failed=1
	[ "$status" -eq 3 ] || exit 1
fi

# 3. Remove old backups, and check the repository.
# shellcheck disable=SC2086
restic forget --tag nightly $KEEP --prune || failed=1
restic check || failed=1

exit "$failed"
