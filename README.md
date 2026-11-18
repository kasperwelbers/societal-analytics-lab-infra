# Societal Analytics Lab: infrastructure documentation

The documentation of the Societal Analytics Lab's infrastructure: its servers, how they are set up and secured, our standards for apps and backups, and how our own software handles logins. Published at [vu-societal-analytics.github.io/societal-analytics-lab-infra](https://vu-societal-analytics.github.io/societal-analytics-lab-infra/).

The deployments themselves are in their own repositories:

* [deploy-keycloak](https://github.com/vu-societal-analytics/deploy-keycloak): the lab's login service (Keycloak).
* [deploy-backup](https://github.com/vu-societal-analytics/deploy-backup): the nightly backup of every server.

## Editing

Change the files in `docs/` (Markdown), and the menu in `mkdocs.yml`. To preview:

```bash
python -m venv venv
venv/bin/pip install -r requirements.txt
venv/bin/mkdocs serve --livereload
```

Check before committing that the site builds without warnings (`venv/bin/mkdocs build --strict`), and that no secrets, IP addresses or admin hostnames are in it.
