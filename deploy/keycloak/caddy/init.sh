#!/bin/sh
# Creates admin-access.caddy from its template (admin-access.example.caddy) when it is missing,
# so that Caddy can always start. Never changes an existing file.
# Run by the caddy-init service before Caddy starts.
set -eu
cd "$(dirname "$0")"
if [ ! -e admin-access.caddy ]; then
	cp -p admin-access.example.caddy admin-access.caddy
	echo "created admin-access.caddy from admin-access.example.caddy"
fi
