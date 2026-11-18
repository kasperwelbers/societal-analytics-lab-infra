#!/usr/bin/env bash
# Run restic with this server's settings (/etc/restic/env), e.g.: sudo ./restic.sh snapshots
set -euo pipefail
if [ -f /etc/restic/env ]; then
	set -a
	# shellcheck disable=SC1091
	. /etc/restic/env
	set +a
fi
export RESTIC_REPOSITORY="${RESTIC_REPOSITORY:-/var/backups/restic}"
export RESTIC_PASSWORD_FILE="${RESTIC_PASSWORD_FILE:-/etc/restic/password}"
exec restic "$@"
