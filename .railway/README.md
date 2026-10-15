# GCS Demo on Railway

This configuration manages the existing **GCS Demo / demo** environment:

- App: `gcs-ssc`, the shared GHCR digest in `deployment/demo-image.json` when
  populated, otherwise GitHub `GCS-SSC/gcs-ssc` branch `main` and the canonical Dockerfile.
- Database: existing `GCS DB` service (PostgreSQL 18), with the application's existing `DATABASE_URL` preserved.
- Domain: https://gcs-ssc-demo.up.railway.app, retained by Railway on the existing service.
- Volumes: existing `gcs-ssc-volume` at `/app/.data` and `gcs-db-volume-forecast-versions-reset-20261014` on `GCS DB`, each 5000 MB. Verify every previous GCS database volume is detached and absent or pending Railway deletion.
- Metabase, `Metabase DB`, and their `postgres-volume-4aPn` are included so an IaC apply preserves them.
- Portal: `gcs-ssc-portal` uses a pinned public GHCR digest from `deployment/portal-demo-image.json` and its own `Portal DB` PostgreSQL service and `portal-db-volume`. It shares this project, not a database, with GCS and Metabase.
- Canvas groups: `Metabase`, `GCS`, and `Portal` each contain the corresponding app and PostgreSQL service.
- Placement: one app replica in `us-east4-eqdc4a`, retaining existing resource limits.
- Seed mode: `ENVIRONMENT_TYPE=demo` at build and runtime. Startup applies core,
  enabled-extension, and demo migrations before `/api/health` becomes ready.

Secrets, database URL, and auth URL/origin variables use `preserve()` to keep their current
Railway values. There are no secret values in this file. This is an imported
configuration for the existing environment, not a fresh-project template.
The Portal uses the sealed environment shared variable `PORTAL_AUTH_SECRET`; create
that variable before applying. The Portal image must be public so Railway can pull
it without registry credentials.

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

Railway CLI 5.54.1 loses database attachments when converting live UUID mounts
into its IaC graph. The Portal's existing database attachment therefore remains
outside attachment reconciliation; its volume stays declared and its app
`DATABASE_URL` uses `preserve()`. A GCS release plan must contain no Portal or
Metabase changes. Check live storage independently of the plan.

`config apply` reports no change to those resources. Check the live service and
volume state before treating these readback entries as drift.

`config apply` reconciles infrastructure and can trigger deployments. Source
changes are deployed from GitHub `main` in source mode; image mode uses the
pinned public GHCR digest. Follow the
[shared image runbook](../docs/container-images.md) to promote the same image to
AWS and Railway without rebuilding. `railway redeploy --service gcs-ssc`
redeploys the most recent deployment. Committing an IaC file alone does not run
`config apply`; use the CLI after infrastructure changes.

## Release clean cutover in image mode

Publish and verify the current main commit with `publish-demo-image.yml`, then
promote its immutable digest in `deployment/demo-image.json`. The image smoke
check verifies `9999_seed`, Agency 21, thirteen agreements, successful terminal
Payments 168/172, and file persistence across container replacement. Seeded claim reconciliations no longer
need the final flag for receivable creation; seeded payment workflows must end in
the owning agency's successful terminal payment status.

Stop the existing `gcs-ssc` deployment before changing database storage. Stop
`GCS DB`, explicitly detach its current database volume, and verify the former
volume's `serviceId` is null. Mount changes can redeploy the database; remove any
intermediate deployment while the application remains stopped. Create a uniquely
named unattached replacement, delete the exact detached former volume, and verify
its deletion or pending-deletion state. Omission from the authoring graph alone
may retain unused volumes.

Attach the replacement to `GCS DB` at `/var/lib/postgresql/data`, verify `READY`
storage and a successful database deployment. Set the `demo` service instance's
image source and verify its resolved `source.image` before deploying from source;
a global source connection can leave the previous environment image override in
place. Confirm the new deployment's image matches the verified immutable digest.
Update this configuration to match the live replacement before
the next IaC apply. Verify the live attachment independently: Railway's plan
readback can omit the former database attachment. Preserve the application
attachment volume, Portal volume, and Metabase volume.

The Forecast version release uses source commit
`4779e845e2b616b9bc86d173e633893b37457e56` and the public image digest
`sha256:ddb378d6fffa60cab9a9523b3bce178a3f94eece664c32248ca51f602fa81032`
from [verified build 38647016380](https://github.com/GCS-SSC/gcs-ssc/actions/runs/38647016380).
The schema cutover replaces and reseeds the disposable GCS database; the
application's attachment storage is retained.

Railway deployment `037270f1-bd33-4d98-885b-dcd4a28bb01c` reached `SUCCESS`
with that exact digest on 2026-10-14. Public health and demo login passed;
NCIA's thirteen agreements and terminal, successfully completed Payments
168/172 were verified. The live Forecast overview returned nineteen Forecast
headers with versions `0`/`1`, twelve active annual Forecasts, and no monthly-line
version fields.

Its replacement database volume `gcs-db-volume-forecast-versions-reset-20261014`
(`3e62e951-d0b0-4672-8c8a-355a63f620ec`) is attached to `GCS DB` at
`/var/lib/postgresql/data` with 5000 MB and storage state `READY`. The previous
`gcs-db-volume-budget-controls-reset-20261014-v2`
(`a544fc30-e733-4d41-9f86-cafef5d22f2c`) is detached and pending Railway deletion
at `2026-10-16T23:11:01.060Z`. The older
`gcs-db-volume-payment-evidence-reset` (`8729b72f-801e-4ea0-9b8d-98022cd2f95c`)
and intermediate `gcs-db-volume-budget-controls-reset-20261014`
(`ad90fe1f-a25c-49e6-bd41-b11cd2008b26`) remain detached and pending Railway
deletion on 2026-10-16. The earlier clean-reset and ar-paid-reset volumes are
absent from the live project inventory.

The current Commitment budget payment-hold release uses source commit
`274dbb7edeb8dfe755a4b28c42e8e7c8ef3fdc53` and public image digest
`sha256:38e90328b31759f83c80d222fe83da202e63a2f9676939da7ec58045b1db587c`
from [verified build 38753855922](https://github.com/GCS-SSC/gcs-ssc/actions/runs/38753855922).
The verified main image is also published as `ghcr.io/gcs-ssc/gcs-ssc-demo:latest`
for the AWS refresh command; Railway uses the immutable digest.
Railway deployment `8a690ce5-fc5a-4176-8fac-1335d6a3d9bb` reached `SUCCESS`
on 2026-10-15. Only the pending `9999_z_commitment_budget_payment_hold`
migration ran; the existing seed journal and all volume attachments were preserved.
Live verification retained fifteen Agreements and nine Payments, including
Agreement 10139, Amendment 10147, inactive Commitment 10140 (CAD 120,000),
active Commitment 10149 (CAD 50,000), and historical paid Payment 10142 (CAD 30,000).
Public health, authenticated reads and the Amendment page passed. No database
reset or seed replay is needed for this hotfix; Portal and Metabase are unchanged.

The Portal release uses source commit
`54117871c2f6a0468e7a877ee6eb2a05284701cd` and pinned public image digest
`sha256:32fc8c413fcf0abdd0b843c81b3d861510d5160bd24247499fbf666e3e71e205`
from [verified build 38647190270](https://github.com/GCS-SSC/gcs-ssc-portal/actions/runs/38647190270).
Its existing `portal-db-volume` and database are preserved. The application
attachment volume, Portal database, and Metabase database remain outside the
GCS clean cutover.

Wait for the app deployment to reach `SUCCESS` and verify public health, demo
login, NCIA's thirteen agreements, and successful terminal Payments 168/172. Verify
claim-based receivable creation from an approved reconciliation without the final
flag and unspent-advance receivable creation from a paid advance. The application
file volume, Portal, and Metabase remain outside this cutover. Ordinary redeploys reuse the configured volume and do not reset it. Subject
baseline changes use an explicitly authorized clean cutover by default; the
Commitment budget hotfix above is the explicitly authorized incremental exception.

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
