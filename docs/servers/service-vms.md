# Service VMs

Some lab services run on a virtual machine (VM) of their own, on VU SciCloud, rather than on the [lab server](./lab.md). That suits services that are open to users outside the lab, or that need their own resources, such as the lab's AmCAT server.

* **Set up** like every VM: SSH with keys only, a firewall that only allows HTTPS, and automatic security updates ([Installation: university VMs](../install/vm.md)).
* **Caddy** on the VM handles HTTPS, in front of the service.
* **Logins** go through the lab's login service: the `idp` realm of [Keycloak](./keycloak.md#the-idp-realm-one-login-for-the-labs-servers), where anyone can create an account, and the service decides who gets access.
* **Data** is stored on the [database server](./database.md), over an internal, encrypted connection.

Which services run on a VM: [Hosted services](./services.md).
