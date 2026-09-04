# Railway deployment

Railway uses the repository's canonical `Dockerfile`, selected by `railway.json`.
Remote Docker build contexts may not include initialized Git submodules, so the
Dockerfile fetches each workspace repository at the exact commit pinned by the
parent repository before running `bun install --frozen-lockfile`. Local Docker
and Compose builds use the same image definition.

## Service configuration

Generate a public Railway domain, then configure these service variables:

- `BETTER_AUTH_SECRET`: a unique production Better Auth secret
- `BETTER_AUTH_URL`: optional; defaults to `https://${RAILWAY_PUBLIC_DOMAIN}`
- `BETTER_AUTH_TRUSTED_ORIGINS`: optional additional comma-separated origins
- `GCS_EXTENSION_SECRETS_KEY`: optional until an extension stores encrypted credentials; use a base64-encoded 32-byte production key

`ENVIRONMENT_TYPE` is required and accepts exactly one of these values:

- `development`: packages and applies the demo seed
- `production`: excludes demo data and credentials

For `development`, the Docker build packages the demo migration and the runtime
applies `9999_seed`, including the documented demo users. Changing
`ENVIRONMENT_TYPE` requires a rebuild and redeploy because the seed is
intentionally absent from production images.

Do not set `DATABASE_URL` when using PGlite. The image already sets
`PGLITE_DATA_DIR=/app/.data/pglite`.

For PostgreSQL, set `DATABASE_URL` and optionally tune these finite server-side budgets (milliseconds):

- `POSTGRES_STATEMENT_TIMEOUT_MS` defaults to `60000` and accepts `1000`–`600000`;
- `POSTGRES_LOCK_TIMEOUT_MS` defaults to `5000` and accepts `100`–`600000`;
- `POSTGRES_IDLE_IN_TRANSACTION_SESSION_TIMEOUT_MS` defaults to `60000` and accepts `1000`–`600000`;
- `POSTGRES_HEALTH_QUERY_TIMEOUT_MS` defaults to `2000` and accepts `100`–`4000`.

Invalid PostgreSQL timeout values fail application startup before a pool is created. Zero is not
accepted because PostgreSQL interprets it as unlimited. Keep any customized deployment probe timeout
above the health-query budget; the repository's shortest probe is Docker Compose at five seconds.
The readiness connection is destroyed if its query exceeds the budget, so a failed external probe
does not leave a database query running in the background.

## Persistent data

Attach one Railway volume at `/app/.data`. This persists both the PGlite
database under `/app/.data/pglite` and locally stored attachments under
`/app/.data/files`.

Railway mounts volumes as root. If the deployment reports permission errors for
`/app/.data`, set the Railway service variable `RAILWAY_RUN_UID=0`. Do not add
replicas while using PGlite: a single database directory must not be shared by
multiple application processes.

Production migrations create the schema but intentionally exclude local demo
seed data and demo credentials unless `ENVIRONMENT_TYPE=development` was set at
both image build and runtime.
