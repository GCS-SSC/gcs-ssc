# GCS Demo on Railway

This configuration manages the existing **GCS Demo / demo** environment:

- App: `gcs-ssc`, the shared GHCR digest in `deployment/demo-image.json` when
  populated, otherwise GitHub `GCS-SSC/gcs-ssc` branch `main` and the canonical Dockerfile.
- Database: existing `GCS DB` service (PostgreSQL 18), with the application's existing `DATABASE_URL` preserved.
- Domain: https://gcs-ssc-demo.up.railway.app, retained by Railway on the existing service.
- Volumes: existing `gcs-ssc-volume` at `/app/.data` and replacement `postgres-volume-HXMv` on `GCS DB`, each 5000 MB.
- Metabase, `Metabase DB`, and their `postgres-volume-4aPn` are included so an IaC apply preserves them.
- Placement: one app replica in `us-east4-eqdc4a`, retaining existing resource limits.
- Seed mode: `ENVIRONMENT_TYPE=demo` at build and runtime. Startup applies core,
  enabled-extension, and demo migrations before `/api/health` becomes ready.

Secrets, database URL, and auth URL/origin variables use `preserve()` to keep their current
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
changes are deployed from GitHub `main` in source mode; image mode uses the
pinned public GHCR digest. Follow the
[shared image runbook](../docs/container-images.md) to promote the same image to
AWS and Railway without rebuilding. `railway redeploy --service gcs-ssc`
redeploys the most recent deployment. Committing an IaC file alone does not run
`config apply`; use the CLI after infrastructure changes.

## Reset the disposable demo, including attachments

This helper supports the former **source mode and `Postgres` service layout only**.
It rejects the current populated shared image manifest before making Railway calls.
It is not an executable reset path for the current `GCS DB` image deployment.

From the host repository, preview or execute the complete reset:

```sh
bun run railway:demo:reset
bun run railway:demo:reset --execute
```

The default is a local preview with no Railway calls or deployment changes.
`--execute` permanently deletes the `railway` database, its migration history,
and `/files` inside `gcs-ssc-volume` (the application's `/app/.data/files`).
It retains the services, credentials, domain, and both volumes. External object
storage and the unused `/app/.data/pglite` directory are outside this reset.

Run execution yourself in a terminal. Railway CLI refuses volume file deletion
by AI agents; the script also rejects common agent sessions before making changes.
Do not unset agent markers to bypass that restriction.
The file-delete subprocess inherits your real terminal; JSON reads remain captured.
Do not pipe the reset command through `tee` or redirect its input/output: execution
requires terminal input and output and rejects redirected runs before maintenance.
Railway's own environment and process-tree checks still apply.

Prerequisites:

- Bun and Git, with access to `GCS-SSC/gcs-ssc`.
- Railway CLI **5.54.1 or newer within major 5**, installed separately from the IaC SDK:
  `npm install -g @railway/cli@5.54.1`.
- `railway login` and an SSH key registered with Railway. Establish SSH access
  (generate a key with `ssh-keygen -t ed25519` if none exists, then register it with
  `railway ssh keys add`). Complete first-use SSH host verification
  interactively before the reset, for example:
  `railway ssh --project 8705eadd-788e-4efb-b070-f03b6a1cdc3d --environment demo --service Postgres -- true`.
  This uses the database container's `psql`; no local PostgreSQL client or public database endpoint is needed.
- Keep GitHub pushes and other deployments paused throughout the operation.
  The script rejects competing deployments when observed; it does not disable GitHub autodeploys.

Execution takes a fresh shallow checkout of GitHub `main`, prints its commit,
and links that temporary directory to the fixed demo project. Local source edits
and the current checkout's Railway link are not uploaded or modified.

The script first verifies the app/database configuration and PostgreSQL access.
If the existing app is sleeping, it sends a health request before the SSH check
to wake the demo. A cold-start or migration-error health response does not block
the reset. SSH setup failures include a specific hint and a read-only diagnostic command.
It then deploys a temporary maintenance container on the existing app service.
Only `/api/health` returns success; other requests receive HTTP 503. After this
deployment is healthy and every previous app deployment is down, the script:

1. Checks the exact volume name and mount path, then recursively deletes `/files`.
2. Drops and recreates the dedicated `railway` database as `postgres`, using separate SQL commands.
3. Restores the canonical Dockerfile in the temporary checkout and deploys the captured `main` commit.
4. Waits for application readiness and verifies all twelve seeded English/French
   template attachments have corresponding files of the recorded sizes on the volume.

The demo seed regenerates Contribution Agreement, Schedules 1–4, and Agreement
Closeout Report templates in both languages. The English source DOCX is packaged
from `demo-assets/Contribution Agreement.docx`; the seed writes fresh template
files and database references. The seed, rather than a file backup, restores these.

The temporary maintenance image contains no database-reset code or startup reset
flag. Restarting or redeploying that image cannot repeat deletion. The final app
uses the original `main` Dockerfile. Railway pre-deploy commands cannot perform
this task because the attachment volume is mounted only at runtime.

### Failure and recovery

Failures stop the sequence immediately. During file or database reset failures,
the service remains in maintenance mode; the script does not automatically start
the app against partially reset storage. A failed final app deployment or template
verification requires inspecting that deployment's logs and state.

The script always restores the original Dockerfile and retains the temporary
checkout at the path printed at startup. After resolving the failure, either run
`--execute` again for a fresh complete reset, or, if both deletion steps succeeded,
deploy the retained clean checkout without another wipe:

```sh
railway up /tmp/gcs-demo-reset-REPLACE_WITH_PRINTED_PATH --path-as-root --project 8705eadd-788e-4efb-b070-f03b6a1cdc3d --environment demo --service gcs-ssc
```

Check `/api/health` and the demo templates after manual recovery. Do not use
`railway redeploy` to fetch a newer `main`: it reuses the most recent deployment's
code, which could still be the maintenance image. Remove the temporary checkout
when recovery is no longer needed.

## Local validation

```sh
bun x tsc --noEmit --strict --skipLibCheck --target ES2022 --module NodeNext --moduleResolution NodeNext --allowImportingTsExtensions .railway/railway.ts
bun x eslint .railway/railway.ts
bun x vitest run tooling/gcs-ssc/tests/unit/railway-demo-reset.test.ts
bun x vitest run tooling/gcs-ssc/tests/unit/railway-reset-terminal.test.ts
GCS_RAILWAY_RESET_DOCKER_TEST=1 bun x vitest run --config vitest.postgres.config.ts tooling/gcs-ssc/tests/integration/railway-demo-reset-postgres.test.ts
```

The focused PostgreSQL test requires Docker and creates/removes its own PostgreSQL
18 container. It never reads `DATABASE_URL` or touches the shared integration database.

References: [Railway IaC](https://docs.railway.com/infrastructure-as-code),
[database shell](https://docs.railway.com/cli/connect),
[volume file commands](https://docs.railway.com/cli/volume),
[volume runtime availability](https://docs.railway.com/volumes),
[CLI deployments](https://docs.railway.com/cli/up),
[app deployment notes](../docs/deployment-railway.md).

The reset also checks whether Postgres is sleeping. When it is, the app opens a
bounded private TCP connection to wake it before the read-only superuser check.
Maintenance health alone does not wake the database. PostgreSQL SSH routing may
briefly return gateway output with exit code zero; the role check retries this
after wake-up, while database DROP/CREATE require their exact PostgreSQL command
tags and never retry uncertain mutations. Gateway output is not a privilege error.
