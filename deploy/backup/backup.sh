#!/usr/bin/env bash
# Nightly backup of a server: runs the dump scripts in hooks.d (e.g. database dumps), then backs up
# /opt with restic (encrypted), without the temp folders of the apps, and removes old backups.
# Runs as root, from backup.service. Setup and restore: docs/install/backups.md
#
# Settings in /etc/restic/env (optional; also read by restic.sh):
#   RESTIC_REPOSITORY      where the backups go (default: /var/backups/restic)
#   RESTIC_PASSWORD_FILE   the encryption password (default: /etc/restic/password)
#   BACKUP_PATHS           what to back up (default: /opt)
#   HOOKS_DIR              the dump scripts of this server (default: /opt/backup/hooks.d)
#   KEEP                   which backups to keep (default: 7 daily, 4 weekly, 6 monthly)
# plus whatever the repository needs (e.g. AWS_ACCESS_KEY_ID for S3).

set -uo pipefail

if [ -f /etc/restic/env ]; then
	set -a
	# shellcheck disable=SC1091
	. /etc/restic/env
	set +a
fi
export RESTIC_REPOSITORY="${RESTIC_REPOSITORY:-/var/backups/restic}"
export RESTIC_PASSWORD_FILE="${RESTIC_PASSWORD_FILE:-/etc/restic/password}"
BACKUP_PATHS="${BACKUP_PATHS:-/opt}"
HOOKS_DIR="${HOOKS_DIR:-/opt/backup/hooks.d}"
KEEP="${KEEP:---keep-daily 7 --keep-weekly 4 --keep-monthly 6}"

here="$(cd "$(dirname "$0")" && pwd)"
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

# 2. The backup. Exit code 3 means some files couldn't be read (e.g. removed during the backup):
#    the snapshot is saved, but the run is marked as failed.
# shellcheck disable=SC2086
restic backup $BACKUP_PATHS --exclude-file "$here/excludes.txt" --tag nightly
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
