# GCS-SSC

GCS-SSC is an internal grants and contributions system designed to manage the lifecycle from agency setup to funding case agreements.

## 🎮 Live Demo

Experience the application immediately: **[Launch Demo](https://gcs-ssc.github.io/gcs-ssc/)**
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

## 📚 Documentation

**CRITICAL:** This project follows strict operating guidelines.

- **[AGENTS.md](./AGENTS.md)**: Bootstrap instructions for the private repository guide.
- **[tooling/gcs-ssc/architecture/](https://github.com/GCS-SSC/gcs-ssc-tooling/blob/main/architecture/README.md)**: Private implementation-derived architecture documentation.

## 🛠 Tech Stack

- **Runtime:** Bun
- **Framework:** Nuxt 4 + Vue 3 (Composition API)
- **UI:** Nuxt UI v4 (Tailwind-based)
- **Database:** PostgreSQL (PGlite in dev) + Kysely
- **Auth:** Better Auth
- **Validation:** Zod + `useZodI18n`
- **Testing:** Vitest (Unit) + Playwright (E2E)

## 🚀 Getting Started

### Prerequisites

- [Bun](https://bun.sh/) must be installed.

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
