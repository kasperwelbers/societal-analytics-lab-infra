# Docker warnings

Rules for running Docker containers on any of our servers: the [lab server](lab-server.md), [university VMs](vm.md), and the [Keycloak VM](keycloak.md). Two things about Docker are easy to get wrong, and both affect the security of the whole server.

## Published ports bypass the firewall

!!! danger "Read this before running containers"
    The server's firewall **doesn't protect Docker containers**. A port published by a container is open to the whole internet, whatever the firewall allows.

**Why.** A firewall on the server (iptables, ufw, or the firewall file of a university VM) filters the traffic of the server itself: incoming traffic for the server (the `INPUT` chain) and outgoing traffic from it (the `OUTPUT` chain). Traffic to and from containers is *forwarded* by Docker (the `FORWARD` chain), with its own rules, so it never passes those rules. This is how Docker works on any Linux machine (see [Docker: packet filtering and firewalls](https://docs.docker.com/engine/network/packet-filtering-firewalls/)).

**What this means:**

* **Incoming:** a published port (`ports: - "5432:5432"` in a compose file, or `docker run -p 5432:5432`) is reachable from the internet, even if the firewall doesn't allow port 5432. Accidentally publishing a database port exposes the database.
* **Outgoing:** containers can connect to any port on the internet, even ports that the firewall blocks for the server itself. For instance, the email relay of the Keycloak deployment can send email via SMTP on port 587 without a firewall rule.

**Rules:**

1. **Only publish ports that should be public,** typically only 80 and 443 of a reverse proxy (Caddy). Let containers talk to each other over Docker networks, without publishing ports. The [Keycloak installation](keycloak.md) works this way: only Caddy publishes ports, and the database is on an internal network without internet access.
2. **If a port should only be reachable from the server itself** (e.g. an app behind a Caddy that runs on the server, as on the [lab server](lab-server.md), or a database tool), publish it on the loopback address: `"127.0.0.1:5432:5432"` instead of `"5432:5432"`.
3. **Check which ports are published,** after every change:

    ```bash
    sudo docker ps --format '{{.Names}}\t{{.Ports}}'
    ```

    Anything with `0.0.0.0:` or `[::]:` in front of the port is reachable from the internet.

4. **Restricting published ports** (e.g. to the university network) is done in Docker's `DOCKER-USER` chain, not in the server's own firewall rules. Prefer restricting access in the reverse proxy instead, as the Keycloak deployment does for its admin console.

## The `docker` group is root access

Run Docker with `sudo`, and don't add anyone to the `docker` group: not admins, and not the system accounts that own the files of an app (`keycloak`, `sal`). Anyone who can run Docker can mount the whole disk into a container, so membership of the `docker` group is effectively root access, without the logging that `sudo` gives. A program that runs as a system account in the `docker` group (e.g. an app without Docker, run by systemd as `sal`) would have that access too.

Files are still owned by a system account; only the `docker compose` commands use `sudo`. See [Apps on our servers](apps.md#1-the-system-account) and the Keycloak installation ([Users and permissions](keycloak.md#users-and-permissions)).

## Directories for bind mounts

When a bind mount (e.g. `./data:/data` in a compose file) points to a directory that doesn't exist, Docker creates it, owned by root. Create such directories yourself before the first start, as the account that owns the app (e.g. `sudo -u sal mkdir /opt/<app>/data`).
