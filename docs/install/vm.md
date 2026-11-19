# Installation: university VMs

How to set up a virtual machine (VM) on VU SciCloud, the VU's research cloud, and secure it before hosting anything on it. This applies to the [Keycloak VM](../servers/keycloak.md) and the [service VMs](../servers/service-vms.md). SciCloud is documented by VU Research Data Management ([SciCloud](https://rdm.vu.nl/tools/scicloud/), [logging in](https://rdm.vu.nl/tools/ada/login.html)).

!!! tip "Steps 3 to 5 in one script"
    After creating the VM and logging in as `root` (steps 1 and 2), [`setup-vm.sh`](setup-vm.sh) does steps 3 to 5: your admin user with your SSH keys, the firewall rules, automatic security updates and Docker, and the system account `sal` for the apps. It can safely run again. Download it, read it, and run it:

    ```bash
    cd /tmp && curl -fsSLO https://vu-societal-analytics.github.io/societal-analytics-lab-infra/install/setup-vm.sh
    ```

    ```bash
    less setup-vm.sh
    ```

    ```bash
    bash setup-vm.sh <username> --web --ssh-from <VU range 1>,<VU range 2>
    ```

    `--web` opens ports 80 and 443 (for a VM that hosts a website or service); `--ssh-from <range>,<range>` allows SSH only from those ranges, e.g. the VU network ([SSH only from the VU network](#ssh-only-from-the-vu-network)), after checking that your own connection comes from one of them; `--caddy` also installs Caddy on the VM itself (for service VMs, not for the Keycloak VM). At the end, it asks you to check in a second terminal that you can log in as your new user and use `sudo`. Only then, turn off root and password logins:

    ```bash
    sudo bash /tmp/setup-vm.sh --harden-ssh
    ```

    The steps below describe what it does, and are the way to do it by hand.

## 1. Create the VM

Log in to the VM portal at [one.labs.vu.nl](https://one.labs.vu.nl), from the VU network or the VU VPN.

**Public SSH keys.** Go to your profile settings (bottom left), then **Security**, and add your public SSH key(s). They are added to new VMs when they are created.

**Create the VM:**

1. Go to **Instances → VMs** in the left sidebar, and click **Create VM** (top right).
2. Choose a template: the latest Ubuntu LTS version (currently **Ubuntu 26.04**), in one of two variants:
    * **(intern):** the VM only gets an address inside the VU network. From outside, nothing on it can be reached, whatever its firewall says.
    * **(extern):** the VM gets a public internet address, e.g. to host a website or service. What can be reached then depends entirely on the VM's own firewall, and the template allows SSH from anywhere: restrict it in [step 4](#ssh-only-from-the-vu-network).
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

### SSH only from the VU network

On an **(extern)** VM, SSH is reachable from the whole internet: anyone can try to log in, or try a flaw in SSH itself. Keys-only logins (step 3) make guessing useless, but SSH still runs code for every connection, before any login. So allow SSH only from the VU network (campus and VPN, which includes the VU SSH gateway), and keep ports 80 and 443 open to everyone. (Later, with a jump host of our own: only from the jump host, see the [Hardening plan](../hardening.md#a-jump-host-of-our-own).)

**Your VU ranges:** the address ranges of the VU network and VPN, as found for the admin restriction of Keycloak ([Find your IP ranges](keycloak.md#find-your-ip-ranges)). Like the rest of the firewall file, they stay on the VM, not in this documentation.

**Replace the general SSH rule.** Find it under `# Services to the world`: a rule with `--dport 22` and without `-s`, e.g. `-A INBOUND -p tcp --dport 22 -j ACCEPT`. Remove it, and add one rule per VU range in its place:

```
# SSH only from the VU network (campus and VPN, including the VU SSH gateway)
-A INBOUND -m state --state NEW -m tcp -p tcp --dport 22 -s <VU range 1> -j ACCEPT
-A INBOUND -m state --state NEW -m tcp -p tcp --dport 22 -s <VU range 2> -j ACCEPT
```

Apply it with a safety net: keep your current SSH session open (connected via the VU network or VPN), apply the rules (below), and check that a **new** login via the VU VPN still works before closing the old one. If something goes wrong, the VM's console in the portal is the way back.

**Check from outside:** on a phone on mobile data (Wi-Fi off, no VU VPN), `ssh <user>@<ip address>` (or `nc -vz -w 5 <ip address> 22` on a laptop outside the VU) should now time out, while the website still loads.

### Apply and check

The VMs don't use the standard Ubuntu firewall packages; load the rules with:

```bash
sudo iptables-custom
```

Check the rules that are in effect, for outgoing and incoming traffic:

```bash
sudo iptables -S OUTBOUND
```

```bash
sudo iptables -S INBOUND
```

These rules apply to programs running **on the VM itself** (e.g. `apt`, `git`, `curl`). They don't apply to Docker containers: see the next section.

## Docker and the VM firewall

The `INBOUND` and `OUTBOUND` rules above don't apply to Docker containers: see [Docker warnings](docker.md).

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

Run Docker with `sudo`, and don't add users to the `docker` group: it is effectively root access (see [Docker warnings](docker.md#the-docker-group-is-root-access)).

## 6. Installing apps

Install apps as described in [Apps on our servers](apps.md): the system account `sal`, every app in `/opt/<app>`, and where its data goes. Install Caddy from its official apt repository, as on the lab server ([Caddy](lab-server.md#caddy)).

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
    A persistent image survives a terminated VM, but not a broken disk, a deleted image, or a mistake on the VM itself. Servers with data still need backups ([Backups](backups.md)).
