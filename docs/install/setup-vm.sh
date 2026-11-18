#!/usr/bin/env bash
# Sets up a new VU SciCloud VM as described in "Installation: university VMs" of the lab's
# infrastructure documentation: https://vu-societal-analytics.github.io/societal-analytics-lab-infra/install/vm/
# Read it before running this script. Safe to run more than once.
#
# Step 1, as root on the new VM (creates your admin user, the firewall rules, updates, Docker):
#   bash setup-vm.sh <username> [--web] [--caddy]
#     --web     also allow incoming HTTP and HTTPS (ports 80 and 443) in the VM firewall
#     --caddy   also install Caddy on the VM itself (for service VMs; not for the Keycloak VM)
#
# Step 2, after checking in a second terminal that you can log in as <username> and use sudo:
#   sudo bash setup-vm.sh --harden-ssh
#     turns off SSH logins as root and with passwords (keys only)

set -euo pipefail

die() { echo "ERROR: $*" >&2; exit 1; }
step() { echo; echo "== $*"; }

[ "$(id -u)" = 0 ] || die "run this as root (or with sudo)"

harden_ssh() {
	step "SSH: keys only, no root logins"
	command -v sshd >/dev/null || die "the OpenSSH server (sshd) is not installed"
	local admins
	admins="$(getent group sudo | cut -d: -f4)"
	[ -n "$admins" ] || die "no user in the sudo group: run step 1 first"
	local with_key=0
	for user in ${admins//,/ }; do
		home="$(getent passwd "$user" | cut -d: -f6)"
		if [ -s "$home/.ssh/authorized_keys" ]; then
			with_key=$((with_key + 1))
		else
			echo "WARNING: $user (sudo) has no SSH key, and can't log in over SSH after this" >&2
		fi
	done
	[ "$with_key" -gt 0 ] || die "no admin (sudo) user has an SSH key: you would be locked out"
	printf 'PermitRootLogin no\nPasswordAuthentication no\nKbdInteractiveAuthentication no\n' > /etc/ssh/sshd_config.d/00-hardening.conf
	sshd -t || die "the SSH configuration is invalid; nothing was restarted"
	systemctl restart ssh
	sshd -T | grep -E '^(permitrootlogin|passwordauthentication|kbdinteractiveauthentication) '
	echo
	echo "Done. Check in a new terminal that logging in as root is refused, and as your own user still works."
}

add_rule() {
	# add_rule <section comment> <rule>: add an iptables-custom rule under a section, if it isn't there yet
	local section="$1" rule="$2" file=/etc/iptables-custom
	if grep -qF -- "$rule" "$file"; then
		echo "already there: $rule"
	elif grep -qF -- "$section" "$file"; then
		awk -v s="$section" -v r="$rule" '{ print } !done && index($0, s) == 1 { print r; done = 1 }' "$file" > "$file.new"
		cat "$file.new" > "$file" && rm "$file.new"
		echo "added: $rule"
	else
		echo "WARNING: section '$section' not found in $file; add this rule by hand: $rule" >&2
	fi
}

if [ "${1:-}" = "--harden-ssh" ]; then
	harden_ssh
	exit 0
fi

user="${1:-}"
[ -n "$user" ] && [ "${user#-}" = "$user" ] || die "usage: bash setup-vm.sh <username> [--web] [--caddy]   (then: sudo bash setup-vm.sh --harden-ssh)"
shift
web=no
caddy=no
for arg in "$@"; do
	case "$arg" in
	--web) web=yes ;;
	--caddy) caddy=yes ;;
	*) die "unknown option: $arg" ;;
	esac
done

step "1. Firewall (/etc/iptables-custom)"
if [ -f /etc/iptables-custom ]; then
	cp -n /etc/iptables-custom /etc/iptables-custom.before-setup
	add_rule "# Filter traffic sent by me" "-A OUTBOUND -m state --state NEW -p tcp -m multiport --dports 80,443 -j ACCEPT"
	if [ "$web" = yes ]; then
		add_rule "# Services to the world" "-A INBOUND -m state --state NEW -m tcp -p tcp --dport 80 -j ACCEPT"
		add_rule "# Services to the world" "-A INBOUND -m state --state NEW -m tcp -p tcp --dport 443 -j ACCEPT"
	fi
	iptables-custom
	echo "The original file is in /etc/iptables-custom.before-setup."
else
	echo "WARNING: /etc/iptables-custom not found (not a VU SciCloud VM?): firewall not changed" >&2
fi

step "2. Admin user $user (with sudo)"
if id "$user" >/dev/null 2>&1; then
	echo "$user exists"
else
	echo "Choose a password for $user (needed for sudo; SSH logins use keys only):"
	adduser --gecos "" "$user"
fi
usermod -aG sudo "$user"
home="$(getent passwd "$user" | cut -d: -f6)"
install -d -m 700 -o "$user" -g "$user" "$home/.ssh"
touch "$home/.ssh/authorized_keys"
if [ -s /root/.ssh/authorized_keys ]; then
	# Add the keys the portal gave root, without duplicates
	sort -u "$home/.ssh/authorized_keys" /root/.ssh/authorized_keys | grep -v '^$' > "$home/.ssh/authorized_keys.new" || true
	mv "$home/.ssh/authorized_keys.new" "$home/.ssh/authorized_keys"
fi
chown "$user:$user" "$home/.ssh/authorized_keys"
chmod 600 "$home/.ssh/authorized_keys"
[ -s "$home/.ssh/authorized_keys" ] || echo "WARNING: $user has no SSH key yet: add one to $home/.ssh/authorized_keys" >&2

step "3. Automatic security updates"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y -q unattended-upgrades ca-certificates curl gnupg
printf 'APT::Periodic::Update-Package-Lists "1";\nAPT::Periodic::Unattended-Upgrade "1";\n' > /etc/apt/apt.conf.d/20auto-upgrades

step "4. Docker (from Docker's own repository)"
if command -v docker >/dev/null && docker compose version >/dev/null 2>&1; then
	echo "Docker is installed: $(docker --version)"
else
	install -m 0755 -d /etc/apt/keyrings
	curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
	chmod a+r /etc/apt/keyrings/docker.asc
	codename="$(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")"
	echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $codename stable" > /etc/apt/sources.list.d/docker.list
	apt-get update -q || die "Docker's repository has no packages for Ubuntu $codename yet: see https://docs.docker.com/engine/install/ubuntu/"
	apt-get install -y -q docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
docker compose version

if [ "$caddy" = yes ]; then
	step "5. Caddy (from Caddy's own repository)"
	if command -v caddy >/dev/null; then
		echo "Caddy is installed: $(caddy version)"
	else
		curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
		curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt > /etc/apt/sources.list.d/caddy-stable.list
		chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg /etc/apt/sources.list.d/caddy-stable.list
		apt-get update -q
		apt-get install -y -q caddy
	fi
fi

step "6. The system account sal (owns the apps in /opt)"
if id sal >/dev/null 2>&1; then
	echo "sal exists"
else
	useradd --system --home-dir /nonexistent --no-create-home --shell /usr/sbin/nologin sal
fi
usermod -aG sal "$user"

cat <<EOF

Done. Next:
  1. Keep this session open. In a second terminal, log in as $user and check that sudo works:
       ssh $user@<ip address>
       sudo -v
  2. Only if that works, turn off root and password logins over SSH:
       sudo bash $(readlink -f "$0") --harden-ssh
  3. Reboot if Ubuntu says a restart is required, and install apps: see "Apps on our servers".
EOF
