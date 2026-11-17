# Societal Analytics Lab: infrastructure and software

This site documents how the Societal Analytics Lab sets up its infrastructure (servers, the login service, and the tools we host), and how we design our own software (AmCAT, AnnoTinder), so that we do it consistently. Why things are set up the way they are is on the [Decisions](./decisions.md) page.

## Where to start

**The lab** (us, and future colleagues)

* What runs where: [Infrastructure overview](./infrastructure.md).
* Setting up and maintaining a server: [Lab server](./lab-server.md), [University VMs](./vm.md), [Docker on our servers](./docker.md).
* The login service: [Keycloak setup](./keycloak.md), and its runbook [Keycloak deployment](./keycloak-deploy.md).
* Building our software: the [Authentication standard](./auth.md), which all our software follows.

**IT** (reviewing our setup against the university's policies)

* [Security overview](./it.md): a summary, with links to the details.
* [Decisions](./decisions.md): what we chose, and the alternatives we dropped.

**Other teams** (hosting AmCAT or AnnoTinder themselves)

* [Choosing a login provider](./auth-install.md), and [moving to another one](./auth-migration.md).
* A [privacy statement template](./policies/privacy-template.md) for your server.

The lab's own [privacy statement](./policies/privacy.md) and [acceptable use policy](./policies/aup.md) apply to the services the lab runs.
