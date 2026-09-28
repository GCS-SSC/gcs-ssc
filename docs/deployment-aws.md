# AWS demo deployment with CDK

The standalone TypeScript CDK app in `infra/aws/` deploys the **GCS and Portal
demo** environments in **Canada Central (`ca-central-1`)**. Their images are built
with demo data. Updating an existing AWS stack preserves its GCS database and
attachments; the new Portal database starts with its demo seed. Railway data is
not transferred.

## What it deploys

- Separate CloudFront distributions for GCS and Portal, each with an AWS-provided
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
  and LibreOffice, plus one Portal task with 0.5 vCPU and 1 GiB RAM. Neither
  service autoscales. Each task has a public IP for outbound image pulls and
  integrations and accepts application traffic only from its private load balancer.
- Separate encrypted, private, single-AZ PostgreSQL 17 RDS `db.t4g.micro` instances:
  20 GiB gp3 storage, storage growth capped at 50 GiB, seven-day backups,
  deletion protection, and a final snapshot on removal.
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
- Secrets Manager secrets for authentication, database credentials, and the
  GCS extension encryption seed; separate two-week CloudWatch application logs.
- An account-wide monthly cost budget, defaulting to **USD 200**. Providing
  `budgetEmail` enables email notifications at 80% and 100% actual spend.
  It includes unrelated AWS spending in the same account intentionally.

The two subnet pairs use physical AZ IDs `cac1-az1` and `cac1-az2`. CloudFront
VPC origins do not support `cac1-az3`; AZ names vary between AWS accounts.

## Budget

The previous single-app estimate was **CAD 150–220/month** before tax. Portal
adds a second task, database, load balancer, CloudFront distribution, and public
IPv4 address. Recalculate the combined cost with the [AWS Pricing Calculator](https://calculator.aws/)
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
The stack outputs `Url`, `HealthUrl`, `PortalUrl`, `PortalHealthUrl`, service names,
log groups, database secret ARNs, EFS ID, and S3 bucket identifiers. No secret
values are outputs.
If the release manifest still contains `image: null`, deployment also requires
`--parameters DemoImage=ghcr.io/gcs-ssc/gcs-ssc-demo@sha256:…`. Prefer promoting
the manifest so AWS and Railway use the same image.

After deployment:

```bash
curl --fail https://YOUR_DISTRIBUTION.cloudfront.net/api/health
curl --fail https://YOUR_PORTAL_DISTRIBUTION.cloudfront.net/api/session
bun run aws logs tail YOUR_LOG_GROUP --since 10m --region ca-central-1
```

Open `/en` and `/fr`; sign in with the existing demo fixture accounts, open an
agreement, generate a document, and download a seeded template. Repeat the file
download after a task replacement to verify persistence. The demo contains its
usual seeded accounts and is intended for demonstration data.

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

The AWS startup wrapper assembles `DATABASE_URL` from ECS-injected credentials,
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
