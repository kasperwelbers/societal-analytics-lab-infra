# University VMs

How to set up a virtual machine (VM) on the VU research cloud, and secure it before hosting anything on it. The research cloud is documented by VU Research Data Management ([logging in](https://rdm.vu.nl/tools/ada/login.html)).

!!! danger "Docker bypasses the VM firewall"
    Ports published by Docker containers (`ports:` in a compose file, or `docker run -p`) are **reachable from the internet, even if the VM firewall doesn't allow them**. Docker routes this traffic around the firewall rules described on this page, and containers can also connect to any port on the internet. Only publish ports that should be public, and read [Docker and the VM firewall](#docker-and-the-vm-firewall) before running containers.

## 1. Create the VM

Log in to the VM portal at [one.labs.vu.nl](https://one.labs.vu.nl), from the VU network or the VU VPN.

**Public SSH keys.** Go to your profile settings (bottom left), then **Security**, and add your public SSH key(s). They are added to new VMs when they are created.

**Create the VM:**

1. Go to **Instances → VMs** in the left sidebar, and click **Create VM** (top right).
2. Choose a template: the latest Ubuntu LTS version (currently **Ubuntu 26.04**). Choose the **(extern)** variant if the VM needs a public IP address, e.g. to host a website or service.
3. Settings:
    * A name for the VM.
    * Turn on **Instantiate as persistent** for a long-running server that stores data (see [Persistence](#persistence)).
    * Memory and CPU: what the services on the VM need. For instance, Keycloak needs about 2 GB of memory.
4. Click **Next**, and **Finish** (bottom right).

## 2. Log in

The VM is listed under **Instances**; open it to see its IP address. The default user of the Ubuntu templates is `root`.

From the VU network or the VU VPN:

```bash
ssh root@<ip address>
```

From elsewhere, via the VU SSH gateway (you first log in with your VUnetID and password):

```bash
ssh -J <VUnetID>@ssh.data.vu.nl root@<ip address>
```

If you ever lose access over SSH, the VM's console in the portal still works with a password.

## 3. Secure SSH logins

Create your own user with administrator rights (`sudo`), log in with SSH keys only, and turn off logins as `root` over SSH.

**Create a user.** Replace `username` with your own username:

```bash
adduser username
```

```bash
usermod -aG sudo username
```

**Give the user your SSH key.** The portal added your key(s) for `root`, so copy those:

```bash
mkdir -p /home/username/.ssh && cp /root/.ssh/authorized_keys /home/username/.ssh/
```

```bash
chown -R username:username /home/username/.ssh && chmod 700 /home/username/.ssh && chmod 600 /home/username/.ssh/authorized_keys
```

**Test before you continue.** Keep your current session open, and log in as the new user in a **second terminal**. Check that `sudo` works:

```bash
ssh username@<ip address>
```

```bash
sudo -v
```

Only continue when this works, otherwise you can lock yourself out.

**Turn off root and password logins over SSH.** Put the settings in their own file in `/etc/ssh/sshd_config.d/`. Settings in that folder take precedence over the main configuration file, and on Ubuntu a file in that folder may already turn password logins *on*, which would silently undo a change to the main file. Files are read in alphabetical order and the first value wins, so the name starts with `00-`:

```bash
printf 'PermitRootLogin no\nPasswordAuthentication no\nKbdInteractiveAuthentication no\n' | sudo tee /etc/ssh/sshd_config.d/00-hardening.conf
```

Check the configuration, and restart SSH (on Ubuntu the service is called `ssh`):

```bash
sudo sshd -t && sudo systemctl restart ssh
```

Check the settings that are actually in effect. This should show `no` for all three:

```bash
sudo sshd -T | grep -E '^(permitrootlogin|passwordauthentication|kbdinteractiveauthentication) '
```

Then check, in a new terminal, that logging in as `root` over SSH is refused, and logging in as your own user still works.

## 4. Firewall

The VMs filter network traffic with `iptables`, using VU's own setup: the rules are in `/etc/iptables-custom`, and are loaded with the `iptables-custom` command. By default, outgoing and incoming traffic may be restricted.

Open the file:

```bash
sudo nano /etc/iptables-custom
```

The file contains VU-specific rules (e.g. access to university services). Leave those in place, and only add the rules you need. Check first whether a rule is already there, to avoid duplicates.

**Outgoing web traffic** (needed for package updates, `git clone` and APIs). Under `# Filter traffic sent by me`:

```
# Allow outbound web traffic (HTTP/HTTPS) for package managers and APIs
-A OUTBOUND -m state --state NEW -p tcp -m multiport --dports 80,443 -j ACCEPT
```

**Incoming web traffic** (if the VM hosts a website or service). Under `# Services to the world`; with an **(extern)** template these rules are probably already there:

```
# Allow inbound web traffic
-A INBOUND -m state --state NEW -m tcp -p tcp --dport 80 -j ACCEPT
-A INBOUND -m state --state NEW -m tcp -p tcp --dport 443 -j ACCEPT
```

**Apply the changes.** The VMs don't use the standard Ubuntu firewall packages; load the rules with:

```bash
sudo iptables-custom
```

Check the rules that are in effect:

```bash
sudo iptables -S OUTBOUND
```

These rules apply to programs running **on the VM itself** (e.g. `apt`, `git`, `curl`). They don't apply to Docker containers: see the next section.

## Docker and the VM firewall

!!! danger "Read this before running containers"
    The `INBOUND` and `OUTBOUND` rules above **don't protect Docker containers**: a port published by a container is open to the whole internet, and containers can connect to any port. Read [Docker on our servers](./docker.md) before running containers.

**Reloading the firewall while Docker runs.** Check that `sudo iptables-custom` doesn't remove Docker's own rules. With a container running that publishes ports, the following should show rules for those ports, both before and after `sudo iptables-custom`:

```bash
sudo iptables -t nat -S DOCKER
```

If the rules are gone after `sudo iptables-custom`, restart Docker to restore them (running containers restart too):

```bash
sudo systemctl restart docker
```

==To verify: on our VM, Docker's chains were still present after `sudo iptables-custom`, but this still needs to be checked with a container running that publishes ports.==

## 5. Updates and Docker

**Security updates.** Ubuntu installs security updates automatically with `unattended-upgrades`. Check that it is installed and enabled:

```bash
sudo apt install unattended-upgrades
```

```bash
sudo dpkg-reconfigure -plow unattended-upgrades
```

Some updates (e.g. a new kernel) need a reboot. Ubuntu shows `*** System restart required ***` when you log in; reboot at a convenient moment. Services started with `restart: unless-stopped` in Docker Compose come back by themselves.

**Docker.** Install Docker Engine with the compose plugin, following the [official instructions for Ubuntu](https://docs.docker.com/engine/install/ubuntu/).

```bash
sudo docker compose version
```

Run Docker with `sudo`, and don't add users to the `docker` group: it is effectively root access (see [Docker on our servers](./docker.md#the-docker-group-is-root-access)).

## Persistence

To decide whether to use **Instantiate as persistent**, it helps to know how the portal combines templates, instances and images:

* **Instances** are the actual virtual machines.
* **Images** are the storage used by a VM: the operating system, swap space, or additional disks.
* **Templates** are recipes for VMs. You create an instance by instantiating a template.

Persistence is a property of images, and determines what happens to them when an instance is created and terminated:

| | Non-persistent image | Persistent image |
| --- | --- | --- |
| **When an instance is created** | The instance gets a disposable copy of the image | The instance is linked to the image itself |
| **When the instance is terminated** | The copy is deleted, including all configuration and data | The image remains, so the instance can be created again |
| **Parallel instances** | Possible | Not possible |
| **Use for** | Temporary machines, e.g. for testing | Servers whose configuration or data must not be lost |

**What "Instantiate as persistent" does:** it first makes a copy of the template with persistent copies of its images, and then creates an instance from that copy. If the instance is ever terminated, you can recover it: go to **Templates → VMs**, find the template with the same name as the instance, and use **Instantiate** (not *Instantiate as persistent*).

!!! warning "Persistence is not a backup"
    A persistent image survives a terminated VM, but not a broken disk, a deleted image, or a mistake on the VM itself. Servers with data still need backups (for instance, see Backups in the [Keycloak deployment](./keycloak-deploy.md#9-backups)).
