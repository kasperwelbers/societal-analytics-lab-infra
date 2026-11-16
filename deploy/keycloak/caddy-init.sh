#!/bin/sh
# Prepares the local Caddy settings in local/ (not in the repository), so that Caddy can always
# start. Run by the caddy-init service before Caddy, from the deployment folder. It never
# changes an existing file in local/.
#
# - Creates local/ with the owner of the deployment folder (the keycloak user).
# - Moves admin-access.caddy from the deployment folder into local/ (where it was kept before).
# - Creates missing files from the examples (*.example.caddy), keeping their owner.
set -eu
cd "$(dirname "$0")"

if [ ! -d local ]; then
	mkdir local
	chown "$(stat -c %u:%g .)" local
	chmod 750 local
	echo "created the folder local/"
fi

for name in admin-access email-tiers; do
	if [ -f "$name.caddy" ] && [ ! -e "local/$name.caddy" ]; then
		mv "$name.caddy" "local/$name.caddy"
		echo "moved $name.caddy to local/$name.caddy"
	fi
	if [ ! -e "local/$name.caddy" ]; then
		cp -p "$name.example.caddy" "local/$name.caddy"
		echo "created local/$name.caddy from $name.example.caddy"
	fi
done
