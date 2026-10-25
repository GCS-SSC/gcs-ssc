# GCS-SSC

GCS-SSC is an internal grants and contributions system designed to manage the lifecycle from agency setup to funding case agreements.

## 🎮 Live Demo

Experience the application immediately: **[Launch Demo](https://gcs-ssc.github.io/gcs-ssc/)**

Browser-demo builds use an isolated WebContainer compatibility shim; see [Known issues](#known-issues).

Credentials:

- **Username**: root@example.com
- **Password**: password123

A real application would likely implement login via Office 365 or another OAuth provider, but username/password is used for demo purposes.

### ⚠️ Important Notes (WebContainers)

This demo uses **[WebContainers](https://webcontainers.io/)** to run the full Node.js server and PostgreSQL database (PGlite) directly inside your browser tab. This will take a little bit too boot up, be patient.

1.  **Local Execution:** No data is sent to a remote backend. Everything happens locally in your browser.
2.  **Persistence:** Changes (e.g., creating users, editing records) are **NOT** saved if you refresh your browser or leave the app.
3.  **Resetting State:** If you break the configuration, or an update has new migrations, or want to start fresh:
    - **Clear Site Data:** Go to your browser's DevTools -> Application -> Storage -> "Clear site data".
    - **Incognito:** Alternatively, open the link in a new Incognito/Private window for a disposable session.

## Known issues

These observations and verification limits were recorded during pre-Nuxt 5 preparation on **2026-10-24**.

### Observed behavior

- Query-access history is best effort. Its queue drops new events at 2,000 events or 32 MiB of estimated payload. Separate test runs dropped 17,198, 18,360, and 46,671 events; these are separate observations, not one total. Query-access history is distinct from transactional change auditing. No loss-free capacity or comparative performance baseline is established.
- One Chromium test process crashed with `SIGBUS` alongside transient disk consumption and core-dump staging. The cause remains unproven; a later passing run does not establish a root-cause fix.

### Verification limits

- The first temporary PostgreSQL cleanup lacked a retained before-state metadata snapshot. Its failed preservation comparison cannot be explained or reconstructed. Reviewed commands targeted only the owned test resources, and protected containers remained present; complete prior metadata equality is unproven.
- Accessibility checks covered selected English/French journeys, browser accessibility trees, and scoped axe checks. They do not establish whole-application accessibility conformance or verify actual screen-reader speech.
- Local checks passed, but hosted GitHub Actions and credentialed cloud checks were not run. Private-tooling read access was configured; hosted CI success remains unverified.

### Deferred compatibility work

- Removing the WebContainer compatibility shim depends on upstream support for asynchronous request context. The shim applies only to serialized browser-demo server modules. English/French login, authorization denials, and concurrent audited writes passed in an actual WebContainer; standard Node.js and Docker artifacts remain unchanged.
- `future.compatibilityVersion: 5` remains enabled with `experimental.nitroAutoImports: true`. Disabling Nitro auto-imports is deferred until the i18n integration supports it without a dependency patch.
- The version-pinned Nitro 2.13.5 lifecycle patch executes only in the development server, preventing overlapping PGlite database owners during reloads. It does not change production server or demo runtime behavior. Removal depends on a released replacement passing the real reload and shutdown checks.

## AWS demo refresh

Publish a new image using GitHub Actions **Build and publish shared demo image →
Run workflow → main**, then run from the repository root:

```bash
bun run aws:demo:refresh --reset-db
```

This deploys the verified GHCR `:latest` image and wipes/reseeds the GCS demo
database. Attachment files, Portal, and Metabase are preserved. Omit `--reset-db`
to preserve the database; add `--preview` to inspect without making changes.
Use the AWS profile configured in ignored `infra/aws/.env`. If its SSO session
has expired, the command starts AWS sign-in and resumes after you authenticate.
See the [AWS deployment runbook](docs/deployment-aws.md#one-command-demo-refresh)
for setup and recovery.

## 📚 Documentation

**CRITICAL:** This project follows strict operating guidelines.

- **[AGENTS.md](./AGENTS.md)**: Bootstrap instructions for the private repository guide.
- **[tooling/gcs-ssc/architecture/](https://github.com/GCS-SSC/gcs-ssc-tooling/blob/main/architecture/README.md)**: Private implementation-derived architecture documentation.

## 🛠 Tech Stack

- **Runtime:** Node.js 24.22.1 LTS (server); Bun 1.3.13 (package manager and builds)
- **Framework:** Nuxt 4 + Vue 3 (Composition API)
- **UI:** Nuxt UI v4 (Tailwind-based)
- **Database:** PostgreSQL (PGlite in dev) + Kysely
- **Auth:** Better Auth
- **Validation:** Zod + `useZodI18n`
- **Testing:** Vitest (Unit) + Playwright (E2E)

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 24.22.1 LTS and [Bun](https://bun.sh/) 1.3.13 must be installed.
- With [nvm](https://github.com/nvm-sh/nvm), run `nvm install` and `nvm use` from the repository root to select the pinned Node version.

### Installation

```bash
bun run setup
```

This initializes the private tooling submodule, creates the local `tests/`, `architecture/`, and agent-skill links,
initializes the fixed extension submodules under `extensions/` and the shared SDK package under
`packages/gcs-ssc-extensions/`, then runs `bun install`. Run setup once even after
`git clone --recurse-submodules` so the local links are created; `bun install` is enough for later dependency refreshes.

The fixed extensions include the local and Amazon S3 storage providers. Local development and the
browser demo select `gcs-storage-local`; a deployed agency may instead enable, configure, test, and
select `gcs-storage-s3`. Provider selection affects new objects only, so every provider referenced by
an existing attachment must remain installed and enabled.

### Development Server

Start the development server (defaults to port 3000):

```bash
bun run dev
```

_Use `bun run dev:clean` to start with a fresh PGlite database._

### Local Document Generation Tools

DOCX-to-PDF and HTML-to-PDF generation can use repo-local Linux/WSL binaries instead of system-wide app installs:

```bash
bun run bun:docgen:install
bun run dev
```

The installer downloads LibreOffice and Puppeteer Chrome into `.tools/docgen`, then creates or updates the regular Nuxt `.env` file with:

```bash
LIBREOFFICE_SOFFICE_PATH=/absolute/path/to/.tools/docgen/libreoffice/.../program/soffice
PUPPETEER_CACHE_DIR=/absolute/path/to/.tools/docgen/puppeteer
```

Nuxt loads `.env` automatically during `dev`, `build`, and `preview`, so no manual `source` step is needed. For another environment file, pass `DOCGEN_ENV_FILE`:

```bash
DOCGEN_ENV_FILE=.env.production bun run bun:docgen:install
```

The installer preserves existing env file contents and only upserts the two docgen keys. See [docs/docgen-tools.md](./docs/docgen-tools.md) for version overrides.

### Seeded Data

The development database comes pre-seeded with test users (Password: `password123`):

- **Root Admin:** `root@example.com`
- **Agency User:** `agency@example.com`
- **Program User:** `program@example.com`
- **Standard Users:** `user03@example.com` ... `user20@example.com`

## ✅ Testing & Quality

Feature work is incomplete without corresponding tests.

```bash
# Run all checks (Lint, Typecheck, Unit, E2E)
bun run test:all:manual

# Run Unit Tests
bun run test:unit

# Run permanent PGlite-compatible E2E specs (temporary review specs are excluded)
bun run test:e2e:pglite

# Run Agency Statuses in its fresh isolated PGlite lane
bun run test:e2e:agency-statuses

# Run each shared-seed mutation spec in a separate fresh PGlite lifecycle
bun run test:e2e:fresh-reset

# Run the seven PostgreSQL-only E2E specs in a reset disposable database
E2E_POSTGRES_TEST_URL=postgresql://localhost/gcs_ssc_e2e_test bun run test:e2e:postgres

# Explicitly run temporary whole-review scratch specs pending promotion or removal
bun run test:e2e:review-scratch

# Run opt-in PostgreSQL agreement concurrency tests against a disposable *_test database
AGREEMENT_CONCURRENCY_POSTGRES_TEST_URL=postgresql://localhost/gcs_ssc_test bun run test:integration:postgres
```

`test:all:manual` includes the PostgreSQL concurrency suite. Set
`AGREEMENT_CONCURRENCY_POSTGRES_TEST_URL` to a disposable PostgreSQL database whose name ends in
`_test` before running the full manual verification command. It also includes the seven
PostgreSQL-only E2E specs, which require a separate `E2E_POSTGRES_TEST_URL` ending in `_test`.
The managed runner holds an advisory lock and resets the application-owned `public` and `extensions`
schemas before and after that lane; it never accepts an ordinary `DATABASE_URL` as permission for
this destructive setup. These PostgreSQL suites are intentionally opt-in and are not part of
automatic pull-request CI.

`bun run test:e2e`, `bun run test:e2e:fast`, and `bun run test:e2e:light` select the permanent
PGlite-compatible lane. Focus one permanent spec with `bun run test:e2e:pglite:spec -- <spec>`.
Each managed invocation uses unique temporary PGlite and local-storage directories unless explicit
overrides are supplied; caller-provided directories are preserved and never deleted by the runner.
The status-administration lifecycle-conflict spec uses `bun run test:e2e:agency-statuses` (or its
`:spec` command) so its terminal and historical status mutations never contaminate the default lane.
The allowlisted shared-seed mutation specs use `bun run test:e2e:fresh-reset`; the orchestrator
starts and cleans a complete managed lifecycle separately for each file. Focus one with
`bun run test:e2e:fresh-reset:spec -- <spec>`.
Temporary `*.tmp.spec.ts` review scenarios are excluded from default Playwright discovery and have
explicit `test:e2e:review-scratch` and `test:e2e:review-scratch:spec` commands so their pending
coverage remains visible without contaminating canonical completion evidence.

## 🔐 Key Architectural Concepts

### Authorization (RBAC)

Authorization is **mandatory** on all server routes.

- **Scopes:**
  - **Global:** System-wide access.
  - **Agency:** Restricted to a specific agency.
  - **Entity:** Restricted to a specific entity path (e.g., specific Transfer Payment).
- **Implementation:** Uses `authorize(...)` helper on the server and `useCan()` composable on the client.

### Bilingualism

- All user-facing text must be internationalized (i18n).
- Database fields for names/descriptions must include `_en` and `_fr` suffixes.

### Soft Deletion

- Core entities use `_deleted` boolean columns.
- Data is never permanently removed from the database via standard delete operations.

## 📂 Project Structure

- `app/`: Vue/Nuxt application code (pages, components, composables).
- `server/`: Server-side API routes and utilities.
- `shared/`: Types and schemas shared between client and server.
- `tooling/gcs-ssc/tests/`: Private canonical unit, integration, and E2E test suites; `tests/` is a generated local link.
- `tooling/gcs-ssc/architecture/`: Private canonical architecture documentation; `architecture/` is a generated local link.
- `AGENTS.md`: Bootstrap for the private repository operating guide.
