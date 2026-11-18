# Backup strategies

Background for the lab's backups: the common approaches, and how our setup relates to them. How it is set up: [Backups](install/backups.md).

## What a backup must survive

| Risk | Example | What protects against it |
| --- | --- | --- |
| A mistake | A deleted file, a failed upgrade, a bug that corrupts data | Backups with history (yesterday, last week, last month), even on the same server |
| Losing the server | A broken disk, a deleted VM, a fire | A copy somewhere else |
| An attacker or ransomware | Someone with access to the server deletes or encrypts everything | A copy the server itself can't delete or change |
| A backup that doesn't work | The job stopped months ago; the backups can't be read | Monitoring, checks, and restore tests |

## Common principles

* **3-2-1:** three copies of the data (the original and two backups), on two kinds of storage, one of them elsewhere. A backup on the same server is not a backup against losing that server.
* **History:** keep several versions, e.g. 7 daily, 4 weekly and 6 monthly ("grandfather-father-son"). A mistake is often noticed late, and a backup that only has last night's version has the mistake too.
* **Encryption:** backups contain everything, including personal data and secrets. Encrypting them on the server, before they leave it, means the place where they are stored never sees the data. The key must be stored safely, apart from the backups: without it, the backups are useless.
* **Consistent copies of databases:** a database writes to its files all the time, so a file copy of a running database can be inconsistent and fail to load. Databases are backed up with their own tool (a dump: `pg_dump` for PostgreSQL), or by stopping them, or with a snapshot of the whole disk.
* **Monitoring:** a backup job that stops is easy to miss. The usual approach is a "dead man's switch": the job reports every run to a monitoring service, which raises an alarm when a report is missing, so it also notices a job that didn't run at all.
* **Restore tests:** a backup is only proven when it has been restored. Test a restore after setting up, and regularly afterwards.
* **Retention, both ways:** backups also keep data that was deleted on purpose (e.g. after a retention period). How long backups are kept is part of the privacy statement.

## Server backups and app backups

| | Server backups | App backups |
| --- | --- | --- |
| **What** | A copy of the whole server (its disk) | Per app: its settings, its files, and its databases as dumps |
| **Who** | Usually the IT department or the platform | The people who run the app |
| **Good for** | Losing a whole server: everything back at once | Restoring one app, one file, or one database to an earlier state; moving an app to another server |
| **Weak point** | Coarse (all or nothing); a running database in it may be inconsistent; we don't control how long it's kept | Only covers what each app set up |

Most organizations use both: server backups as the last resort, and app backups for everyday restores.

## Tools

* **restic** and **borg:** the most used open-source tools for file backups. Both encrypt on the server, store only changes (deduplication), keep history with one command, and check their own backups. restic can store backups almost anywhere (local, SFTP, S3 and more); borg works best with SSH.
* **borgmatic** and **resticprofile:** configuration files around borg and restic, including database dumps and monitoring, for larger setups.
* **Database dumps in Docker:** a small service in the app's compose file that runs `pg_dump` on a schedule, writing to a folder that the file backup picks up.
* **Monitoring:** [healthchecks.io](https://healthchecks.io) (hosted, or self-hosted) and similar services receive a ping per run.

## Our setup

* **Server backups by VU IT** as the last resort. ==TODO: confirm with VU IT what they cover.==
* **App backups:** every app keeps what it needs to be restored under `/opt/<app>`, with a database backup service per database ([Docker Compose standards](install/compose.md)). Every night, restic backs up `/opt`, encrypted, keeps 7 daily, 4 weekly and 6 monthly backups, checks them (on Sundays also a 5% sample of the data), and reports to healthchecks.io.
* **Data with a short retention** is in named volumes that our backups don't contain, with a cleanup service that deletes it after the retention period.

Where we stand against the principles above:

| Principle | Status |
| --- | --- |
| History | Yes: 7 daily, 4 weekly, 6 monthly |
| Encryption | Yes: restic, key in the password manager |
| Consistent databases | Yes: daily dumps by the apps |
| Monitoring | Yes: healthchecks.io, which also notices a missing run |
| A copy elsewhere (3-2-1) | Not yet: our backups are on the same server. ==TODO: a location with VU IT== |
| Safe from an attacker on the server | Not yet: the server can delete its own backups. A location the server can only add to (e.g. S3 with object lock) would solve this. |
| Restore tests | To do after setup, then twice a year |
