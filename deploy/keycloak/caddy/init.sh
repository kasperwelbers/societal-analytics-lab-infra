#!/bin/sh
# Creates admin-access.caddy and email-tiers.caddy from their templates (*.example.caddy) when
# they are missing, so that Caddy can always start. Never changes an existing file.
# Run by the caddy-init service before Caddy starts.
set -eu
cd "$(dirname "$0")"
for name in admin-access email-tiers; do
	if [ ! -e "$name.caddy" ]; then
		cp -p "$name.example.caddy" "$name.caddy"
		echo "created $name.caddy from $name.example.caddy"
	fi
done
