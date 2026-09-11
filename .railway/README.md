# GCS Demo on Railway

This configuration manages the existing **GCS Demo / demo** environment:

- App: `gcs-ssc`, GitHub `GCS-SSC/gcs-ssc` branch `main`, canonical Dockerfile.
- Database: existing `Postgres` service (PostgreSQL 18), referenced by `DATABASE_URL`.
- Domain: https://gcs-ssc-demo.up.railway.app, retained by Railway on the existing service.
- Volumes: existing `gcs-ssc-volume` at `/app/.data` and `postgres-volume`, each 5000 MB.
- Placement: one app replica in `us-east4-eqdc4a`, retaining existing resource limits.
- Seed mode: `ENVIRONMENT_TYPE=demo` at build and runtime. Startup applies core,
  enabled-extension, and demo migrations before `/api/health` becomes ready.

Secrets and auth URL/origin variables use `preserve()` to keep their current
Railway values. There are no secret values in this file. This is an imported
configuration for the existing environment, not a fresh-project template.

## Apply infrastructure changes

Install Railway CLI 5.42.1 or newer separately from the pinned `railway` SDK:

```sh
npm install -g @railway/cli@latest
bun install --frozen-lockfile
railway login
railway link --project 8705eadd-788e-4efb-b070-f03b6a1cdc3d --environment demo --service gcs-ssc
railway config plan
railway config apply
```

Review the plan before applying. Keep all existing resource names and volumes;
IaC treats omitted resources as deletion candidates. The authoring file rejects
other project/environment names. The service's legacy Config File association
has been cleared; `railway.json` remains only for legacy deployments elsewhere.
Do not run `config pull --force` or `config migrate --force` unless you intend
to replace this file.

`config apply` reconciles infrastructure and can trigger deployments. Source
changes are deployed from GitHub `main`; `railway redeploy --service gcs-ssc`
redeploys the most recent deployment. Committing an IaC file alone does not run
`config apply`; use the CLI after infrastructure changes.

## Wipe the disposable database

This deletes the application database and its migration history, while retaining
the Railway database service, credentials, domains, and volumes. Stop the app
and wait until its deployment is down before running SQL. Avoid overlapping
GitHub deployments while resetting.

```sh
railway status
railway down --service gcs-ssc
railway connect Postgres
```

`connect` requires a local `psql` client. With no public database endpoint, it
uses an SSH tunnel; register a local SSH key with `railway ssh keys add` if
prompted.

In `psql`, inspect `\conninfo`. If the application database is `railway`, run:

```sql
\connect postgres
DROP DATABASE railway WITH (FORCE);
CREATE DATABASE railway;
\quit
```

Use the actual application database name if different. Do not drop the database
while connected to it. After successful recreation:

```sh
railway redeploy --service gcs-ssc
```

The demo image recreates the schema and seed. Check `/api/health` and login after
startup. Uploaded files remain on `/app/.data/files` (and any configured external
object storage); a database reset does not erase them. PGlite data on the old
app volume is no longer used while `DATABASE_URL` is set.

## Local validation

```sh
bun x tsc --noEmit --strict --skipLibCheck --target ES2022 --module NodeNext --moduleResolution NodeNext .railway/railway.ts
bun x eslint .railway/railway.ts
```

References: [Railway IaC](https://docs.railway.com/infrastructure-as-code),
[database shell](https://docs.railway.com/cli/connect),
[app deployment notes](../docs/deployment-railway.md).
