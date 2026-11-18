# Backups

The nightly backup of a server: database dumps (`/opt/backup/hooks.d/*.sh`), then `/opt` with restic, encrypted, without the `temp` folders of the apps. Setup, checks and restore: [docs/install/backups.md](../../docs/install/backups.md).

| File | Contents |
| --- | --- |
| `backup.sh` | The backup: hooks, `restic backup`, removing old backups, `restic check` |
| `excludes.txt` | What is left out (`/opt/*/temp`) |
| `backup.service`, `backup.timer` | Run it every night (03:30, within half an hour) |
| `restic.sh` | restic with this server's settings, for checks and restores: `sudo ./restic.sh snapshots` |
| `postgres-hook.example.sh` | Template for the dump of an app's PostgreSQL database |
