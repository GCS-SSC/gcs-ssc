# AWS demo deployment with CDK

The standalone TypeScript CDK app in `infra/aws/` deploys the **GCS, Portal,
and Metabase demo** environments in **Canada Central (`ca-central-1`)**. GCS and
Portal images are built with demo data. Updating an existing AWS stack preserves
its GCS database and attachments; the new Portal database starts with its demo
seed. The new Metabase database starts empty unless its Railway application
database is migrated separately.

## What it deploys

- Separate CloudFront distributions for GCS, Portal, and Metabase, each with an AWS-provided
  `https://….cloudfront.net` address. No domain registration or custom certificate
  is needed.
- Separate private Application Load Balancers reached through CloudFront VPC origins.
  Viewer traffic requires HTTPS; the private origin leg uses HTTP. Caching is
  disabled, and viewer headers, cookies, query strings, and all application HTTP
  methods are forwarded. CloudFront is a global service; the application and
  data resources reside in Canada Central.
  A CDK custom resource resolves the AWS-managed CloudFront prefix list during
  deployment; only that list is allowed to reach the load balancer on port 80.
- One GCS Linux x86 Fargate task with 1 vCPU and 4 GiB RAM, including Chromium
  and LibreOffice, one Portal task with 0.5 vCPU and 1 GiB RAM, and one Metabase
  task with 1 vCPU and 2 GiB RAM. None of the services autoscales. Each task has a public IP for outbound image pulls and
  integrations and accepts application traffic only from its private load balancer.
- Four separate encrypted, private, single-AZ PostgreSQL 17 RDS `db.t4g.micro` instances:
  20 GiB gp3 storage, storage growth capped at 50 GiB, seven-day backups,
  deletion protection, and a final snapshot on removal. GCS business data and
  access history each have their own instance; Portal and Metabase retain their
  existing independent instances.
- Encrypted EFS storage mounted only at `/app/.data/files`, preserving the local
  storage provider's demo templates and uploaded files across replacements.
  Access uses IAM, encrypted NFS, and an access point enforcing UID/GID 1000.
  PostgreSQL, rather than PGlite on EFS, holds the database.
- A **separate private S3 bucket for future use**, with encryption, versioning,
  public access blocked, TLS required, and retention on stack deletion. It is
  not selected as the demo's attachment provider and the task receives no S3
  access yet. `S3BucketName` and `S3BucketArn` are deployment outputs.
- A private retained Portal S3 bucket for uploaded attachments. Only the Portal
  task can read, write, and delete objects under its attachment prefix; the
  browser has no direct bucket access. Noncurrent object versions expire after
  30 days, and active objects have no age-based expiry.
- Metabase uses an immutable Docker Hub image digest. An init container
  downloads the regional RDS CA bundle before Metabase starts, and the JDBC
  connection verifies the database hostname. Its CloudFront endpoint starts
  disabled by default. Its setup sidecar creates an administrator and verifies
  the retained credentials and superuser identity. Enable public access only
  after that verification, using the separate deployment step below. Its task can
  reach the GCS database as a data source, but its application database is separate.
- Secrets Manager secrets for authentication, database credentials, and the
  GCS extension encryption seed; separate two-week CloudWatch application logs.
- An account-wide monthly cost budget, defaulting to **USD 200**. Providing
  `budgetEmail` enables email notifications at 80% and 100% actual spend.
  It includes unrelated AWS spending in the same account intentionally.

The two subnet pairs use physical AZ IDs `cac1-az1` and `cac1-az2`. CloudFront
VPC origins do not support `cac1-az3`; AZ names vary between AWS accounts.

## Budget

The dedicated GCS access-history instance adds its own RDS compute, storage,
backup, and secret costs. It is new infrastructure; applying this source change
requires an operator-reviewed CDK diff. Existing GCS, Portal and Metabase
resource identities are preserved. Historical access rows from the business
database are not automatically copied into the new store.

The previous single-app estimate was **CAD 150–220/month** before tax. Portal
and Metabase add two tasks, two databases, two load balancers, two CloudFront
distributions, and two public IPv4 addresses. Recalculate the combined cost with the [AWS Pricing Calculator](https://calculator.aws/)
before deployment; the previous estimate and the default USD 200 monthly budget
do not establish a spending ceiling for the expanded stack. The earlier GCS-only
September 18, 2026 estimate used 730 hours/month:

| Item | Estimated USD/month |
| --- | ---: |
| Fargate, 1 vCPU / 4 GiB | 46.73 |
| RDS `db.t4g.micro` | 13.14 |
| RDS gp3, 20 GiB | 2.54 |
| Private ALB fixed hourly charge | 18.07 |
| One task public IPv4 | 3.65 |
| Load-balancer capacity, EFS/backups, logs, secrets, image storage, CloudFront and transfer | 20–70 allowance |

The empty future S3 bucket adds no fixed bucket fee; stored objects, versions,
and requests are billed when used. The estimates exclude free-tier credits and
assume light traffic and small data volumes. Database CPU credits, data growth,
internet traffic, retained resources, and additional deployments can raise costs.
Use a fresh [AWS Pricing Calculator](https://calculator.aws/) estimate before
deployment; this is a planning allowance, not a spending guarantee.

Set the USD budget threshold with
`-c monthlyBudgetUsd=…` and keep that context consistent on later deployments.
**Budget alerts do not stop resources or enforce a hard cap.** Without
`budgetEmail`, the budget exists but sends no email notifications.

Pricing references: [Fargate](https://aws.amazon.com/fargate/pricing/),
[RDS PostgreSQL](https://aws.amazon.com/rds/postgresql/pricing/),
[ALB](https://aws.amazon.com/elasticloadbalancing/pricing/), and
[public IPv4](https://aws.amazon.com/vpc/pricing/). The regional AWS price lists
used for the fixed calculations are
[ECS](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonECS/current/ca-central-1/index.json),
[RDS](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonRDS/current/ca-central-1/index.json), and
[ELB](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AWSELB/current/ca-central-1/index.json).

## Prerequisites

1. Bun 1.3.13, Node.js (for the CDK CLI), and AWS CLI v2.
2. An authenticated AWS profile with CDK bootstrap/deployment permissions,
   including CloudFormation, IAM, CloudFront VPC origins and service-linked roles,
   ECS, RDS, EFS, S3, Secrets Manager, EC2 networking, ECR, logs, and Budgets.
3. Public digest-pinned GCS and Portal demo images from the
   [GitHub image workflows](container-images.md), promoted to
   `deployment/demo-image.json` and `deployment/portal-demo-image.json`. CDK
   consumes these images without rebuilding them. The Portal image must contain
   `.output/aws-start.mjs` and `.output/rds-ca.pem`.
   The private tooling submodule is needed only to run the local tests.

From the repository root:

```bash
git submodule update --init --recursive
cd infra/aws
bun install --frozen-lockfile
bun run typecheck
bun run test
bun run synth --quiet
```

Synthesis and the focused tests need no AWS credentials or Docker daemon.
GitHub builds both application images; deployment does not require local Docker.

## Deploy

From `infra/aws`, copy `.env.example` to `.env` once and set `AWS_PROFILE`
and optionally `AWS_BUDGET_EMAIL` / `AWS_MONTHLY_BUDGET_USD`. Bun loads this
file for every command below, including the AWS CLI and CDK subprocesses.
Shell environment values take precedence. `.env` is gitignored; the committed
example contains no credentials. Prefer an AWS SSO profile over static keys.
The application region remains fixed to `ca-central-1`.

```bash
cp -n .env.example .env
# Edit .env with your profile and budget email.

# For an SSO profile:
bun run aws sso login
bun run aws sts get-caller-identity

# Uses the account resolved by the profile and the app's Canada Central region.
bun run bootstrap
bun run diff
bun run deploy
```

Explicit `-c budgetEmail=…` and `-c monthlyBudgetUsd=…` options override the
env-file budget defaults. AWS generates the database password, authentication
secret, and extension seed; do not put application secrets in this deployment file.

Keep the same stack name for updates. Review `cdk diff` against the live stack;
existing GCS database, EFS, secrets, and distribution must not be replaced or
deleted. Bootstrap creates supporting resources
with their own lifecycle. CloudFront VPC origin provisioning can take several
minutes, and database creation and the first image pull take additional time.
The stack outputs `Url`, `HealthUrl`, `PortalUrl`, `PortalHealthUrl`, `MetabaseUrl`, `MetabaseHealthUrl`, service names,
log groups, database and Metabase administrator secret ARNs, EFS ID, and S3 bucket identifiers. No secret
values are outputs.
If the release manifest still contains `image: null`, deployment also requires
`--parameters DemoImage=ghcr.io/gcs-ssc/gcs-ssc-demo@sha256:…`. Prefer promoting
the manifest so AWS and Railway use the same image.

After deployment:

```bash
curl --fail https://YOUR_DISTRIBUTION.cloudfront.net/api/health
curl --fail https://YOUR_PORTAL_DISTRIBUTION.cloudfront.net/api/session
curl --fail https://YOUR_METABASE_DISTRIBUTION.cloudfront.net/api/health
bun run aws logs tail YOUR_LOG_GROUP --since 10m --region ca-central-1
```

Open `/en` and `/fr`; sign in with the existing demo fixture accounts, open an
agreement, generate a document, and download a seeded template. Repeat the file
download after a task replacement to verify persistence. The demo contains its
usual seeded accounts and is intended for demonstration data.

## Enable Metabase after administrator verification

Keep `metabasePublicEnabled` absent or `false` during initial deployment or any
Metabase database replacement. The CloudFront distribution remains disabled.
Inspect the `metabase-setup` logs in `MetabaseApplicationLogs` and require
`Metabase administrator verified` for the current task. The helper authenticates
with the retained Secrets Manager credentials, checks the expected email and
superuser status, and closes its verification session. A missing setup token alone
does not establish success.

After verification and private `/api/health` success, deploy from `infra/aws`:

```bash
bun run deploy -- -c metabasePublicEnabled=true
```

Keep that context on later deployments only while the verified Metabase database
is retained. To replace or reset that database, first deploy with
`-c metabasePublicEnabled=false` and wait for CloudFront to be disabled. Repeat
administrator verification before enabling the endpoint again.

## One-command demo refresh

From the repository root, using `AWS_PROFILE` in the environment or ignored
`infra/aws/.env`:

```bash
# Inspect the account, target and approved release without changing anything.
bun run aws:demo:refresh --preview

# Deploy the approved digest while preserving the database.
bun run aws:demo:refresh

# Wipe GCS demo database schemas and migration journals, then deploy and reseed.
bun run aws:demo:refresh --reset-db
```

Review the successful manual image publishing workflow and its immutable release
digest, then explicitly approve that digest in `deployment/demo-image.json` before
running refresh. The helper reads only that pin. It never executes the mutable
`:latest` tag with deployment credentials. No Docker daemon, new IAM roles, or
CDK deployment is required. It targets only
`GcsSscDemo` / Canada Central and validates the existing GCS demo task contract.
Portal and Metabase services and their databases are untouched. GCS attachment
files on EFS are preserved; reset discards database references to uploaded files.
The final demo seed restores its standard template records and files.

A preflight task verifies the new image can connect to RDS using injected secrets
and verified TLS. Reset then stops GCS, waits for every old service task to reach
`STOPPED`, and transactionally drops the `public`, `extensions`, and `audit`
schemas. It restarts only after the reset task exits successfully. This causes
GCS downtime and permanently removes its demo data, users, audit history, and
extension configuration. Without `--reset-db`, the database is preserved. Baseline-only schema changes
require an explicit reset; the authorized Commitment budget hotfix supplies
`9999_z_commitment_budget_payment_hold` as an incremental migration for existing
databases, so this release needs no reset or seed replay.

The helper verifies ECS deployment completion, the actual running image digest,
and public readiness. The approved `deployment/demo-image.json` pin remains the
selected release. Commit/promote that pin separately if other operators should use
the same release.
Direct ECS updates do not rewrite CloudFormation's deployed template; keep the
manifest aligned before subsequent CDK deployments to avoid restoring an older image.
Do not run concurrent GCS deployments or refresh commands.

The earlier Commitment budget release was built from source
`274dbb7edeb8dfe755a4b28c42e8e7c8ef3fdc53` by
[image build 38753855922](https://github.com/GCS-SSC/gcs-ssc/actions/runs/38753855922).
Both `latest` and the shared manifest resolve to
`ghcr.io/gcs-ssc/gcs-ssc-demo@sha256:38e90328b31759f83c80d222fe83da202e63a2f9676939da7ec58045b1db587c`.
`AWS_PROFILE=gcscience bun run aws:demo:refresh` deployed task definition
`GcsSscDemoTask0D89BCB6:7` on 2026-10-15 with database reset disabled. ECS reached
`COMPLETED`, one task runs the verified digest, and public health and authenticated
browser reads passed at <https://dwqie6eqqoak.cloudfront.net/>. Only the pending
hotfix migration ran. All fourteen Agreements and eight Payments, including
Payments 168 and 172, match the before-deployment snapshot; attachment storage,
Portal and Metabase were preserved.

The current Claim recovery hotfix was built from source
`da9ec0568c178358a4852abbdf77d30407566198` by
[image build 38772040704](https://github.com/GCS-SSC/gcs-ssc/actions/runs/38772040704).
Both `latest` and the shared manifest resolve to
`ghcr.io/gcs-ssc/gcs-ssc-demo@sha256:2891db198dfafedbd0e2d284670d2ee605adf3d00e793079a86d4280a321201d`.
`AWS_PROFILE=gcscience bun run aws:demo:refresh` deployed task definition
`GcsSscDemoTask0D89BCB6:8` on 2026-10-15 with `Reset database: false`.
ECS reached `COMPLETED`, with one running task and no pending tasks; the running
image digest matches the verified release. Public health, authenticated API reads
and Home passed; before/after snapshots match fourteen Agreements and eight Payments,
including Payments 168/172. This code-only
release adds no migrations and does not reset or replay the seed. It preserves
attachment storage, Portal and Metabase. Amendment budget floors now account for
posted Claim AR collections; original Claim AR submission requires a full-principal
Claim reduction plan, while partial Credit Memos remain supported.

If reset or deployment fails, inspect the printed task ARN and GCS CloudWatch
logs. The helper does not automatically restart the old application after a reset;
rollback is disabled during deployment to prevent an incompatible old baseline
from starting. Recover by deploying the printed new task definition with desired
count 1 after resolving the error. Once readiness is verified, restore the service's
usual deployment circuit breaker (`enable: true`, `rollback: true`). The command
requires a stable service with desired count 1 before another refresh attempt.
If the initial AWS identity check detects expired SSO credentials, the helper
runs `aws sso login` for the configured profile, inherits its browser/device-code
prompt, and retries the identity check once. Complete authentication when prompted;
no deployment changes occur before it succeeds. Other credential or permission
errors are reported without starting sign-in.

## Updates, recovery, and storage

Promote a published image in `deployment/demo-image.json`, then run `cdk diff`
and `cdk deploy` again. Only one task runs
at a time: deployments stop the old task before starting the replacement to avoid
overlapping application revisions during startup migrations. Expect downtime.
The load balancer checks `/api/health` with a five-minute startup grace period.
The existing application startup watchdog and migration behavior remain in use.
The deployment circuit breaker can restore a previous task revision; it cannot
undo database migrations. Review migration compatibility and take a manual RDS
snapshot before consequential upgrades. A first deployment has no prior revision
to roll back to.

The AWS startup wrapper assembles `DATABASE_URL` and
`GCS_ACCESS_DATABASE_URL` from separate ECS-injected credentials
(`AWS_DB_*` and `AWS_ACCESS_DB_*`),
requires full RDS certificate verification against a build-time regional CA
bundle, and derives a stable 32-byte extension key from a retained random secret.
It then imports the normal Nitro server in the same Node process. Rebuild images
when the RDS trust bundle changes. Secrets injected by ECS refresh on task
replacement. Do not rotate the extension seed without migrating encrypted values.

RDS backups and EFS automatic backups are independent recovery mechanisms, not
an application-consistent backup pair. Coordinate database and file recovery.
EFS, S3, and secrets are retained on deletion; RDS deletion protection must be
deliberately disabled before deleting the stack. Retained storage, backups,
secrets, and bootstrap assets continue to incur charges. Destroying the
stack is not a demo reset; recreating it produces new resources and a fresh demo.

To use the future S3 bucket later, first add scoped object permissions to the
task role, then enable/configure the existing `gcs-storage-s3` provider for each
agency using the default AWS credential chain. IaC bucket creation does not
select a provider or migrate existing local-provider attachments. Existing
attachments still require their EFS files.

## Verification boundaries

`bun run test` in `infra/aws` runs infrastructure and startup-contract tests from
`tooling/gcs-ssc/tests/aws/`. These tests check the synthesized access boundaries,
published image consumption, persistent storage, retention, secret references, budget,
and credential encoding. `bun run typecheck` checks the independent CDK package.
Synthesis validates the CloudFormation dependency graph; it does not prove live
AWS resource availability, Docker build success, application startup on RDS, or
browser behavior. Complete the post-deployment smoke checks above.
