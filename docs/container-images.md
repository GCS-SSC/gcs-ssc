# One GitHub-built image for AWS and Railway

`.github/workflows/publish-demo-image.yml` builds the canonical Dockerfile only
when manually triggered using GitHub Actions **Run workflow**. Pushes to `main`
do not trigger an image build. It publishes the shared demo
image to **`ghcr.io/gcs-ssc/gcs-ssc-demo`**. AWS and Railway pull the same digest;
neither platform needs to rebuild it.

## Build and publish

The workflow:

1. Checks out the host commit and its pinned public SDK/extension submodules.
   It excludes the private `tooling/gcs-ssc` checkout. No PAT or extra repository
   secret is required; the workflow's `GITHUB_TOKEN` publishes the package.
2. Builds once for `linux/amd64`, with `ENVIRONMENT_TYPE=demo` and
   `AWS_RDS_CA_BUNDLE=true`. The image includes demo migrations/assets, the RDS CA
   bundle, Chromium, LibreOffice, and both startup entry points.
3. Loads that image locally and tests it against a disposable PostgreSQL 17
   container: migrations/readiness, English/French pages, required artifacts,
   and persistent files after replacing the application container.
4. Pushes that exact tested image with a unique commit/run/attempt tag, records
   its registry digest, and uploads a `demo-image` workflow artifact containing
   `demo-image.json`.
5. Verifies an anonymous pull with an empty Docker credential directory.

The existing GitHub Pages/WebContainer workflow is independent. Publishing an
image does not automatically deploy AWS or Railway. There is no moving `latest`
deployment tag, and image builds never receive database or application secrets.

### One-time public package setting

GitHub Container Registry does not inherit a public repository's visibility.
After the first push, open the organization's **Packages → gcs-ssc-demo →
Package settings → Change visibility → Public**. Public GHCR images allow
anonymous pulls. Keep the source repository linked and grant it Actions write
access if your organization disables automatic inheritance.

The first workflow may finish with a failed anonymous-pull check until this is
done; its image and release artifact have already been published. After changing
visibility, verify that digest anonymously (no rebuild is needed), then promote
it. Subsequent workflow runs perform this verification automatically.

```bash
registry_config=$(mktemp -d)
docker --config "$registry_config" pull ghcr.io/gcs-ssc/gcs-ssc-demo@sha256:REPLACE_WITH_DIGEST
rm -rf "$registry_config"
```

See [GitHub package visibility](https://docs.github.com/en/packages/learn-github-packages/configuring-a-packages-access-control-and-visibility)
and [publishing container images](https://docs.github.com/en/actions/tutorials/publish-packages/publish-docker-images).

## Promote a release to both platforms

`deployment/demo-image.json` is the shared release pin. Its initial `image: null`
leaves Railway's current GitHub/Dockerfile source in place; AWS requires an
explicit `DemoImage` parameter until a release is pinned. After the workflow has
published a usable public image, download its artifact from the run page or:

```bash
# Run from the repository root. Replace RUN_ID with the successful build run.
release_dir=$(mktemp -d)
gh run download RUN_ID --repo GCS-SSC/gcs-ssc --name demo-image --dir "$release_dir"
cp "$release_dir/demo-image.json" deployment/demo-image.json
rm -rf "$release_dir"
```

The file will contain a reference such as:

```json
{
  "image": "ghcr.io/gcs-ssc/gcs-ssc-demo@sha256:<64-hex-character-digest>"
}
```

Commit the real manifest to track the chosen release. Both IaC definitions
validate the digest reference and reject mutable tags or non-demo image names.
Retain GHCR versions used by running deployments and rollback candidates; a
digest pin does not protect an image from registry deletion.

### AWS

From `infra/aws`, run the usual `bun run cdk diff GcsSscDemo` and
`bun run cdk deploy GcsSscDemo`, preserving any budget context values. CDK
uses the manifest digest directly. No Docker daemon, ECR image publication,
registry credentials, or GHCR token is required on the deploying machine or ECS.
Before the first manifest promotion, supply
`--parameters DemoImage=ghcr.io/gcs-ssc/gcs-ssc-demo@sha256:…` at deployment.
Use the shared manifest for coordinated releases instead of separate parameters.

ECS overrides the startup command with `node .output/server/aws-start.mjs`, which
assembles the RDS connection and extension key from AWS secret inputs. The
[AWS runbook](deployment-aws.md) covers bootstrap and infrastructure.

### Railway

Use the existing linked **GCS Demo / demo / gcs-ssc** environment:

```bash
railway config plan
railway config apply
```

With a populated manifest, `.railway/railway.ts` uses the pinned image source.
Railway retains legacy Dockerfile build fields on this image service; they do not
build the image. The database, volumes, domain, environment, and preserved secrets
remain configured as before. The image's default command remains
`node .output/server/index.mjs`; do not copy the AWS command override to Railway.
The runtime must stay `ENVIRONMENT_TYPE=demo` to match the image.

Public images require no registry credentials or private-registry plan feature.
If configuring through the Railway UI, set the same digest under Source and
remove the GitHub source connection, but keep the IaC manifest in agreement.
The [Railway runbook](../.railway/README.md) explains the existing resource graph.

Verify each platform's `/api/health`, login, and a seeded document download after
deployment. Updating a manifest alone does not apply infrastructure; run each
platform's deployment command. Switching sources does not reset data.

## Rollback and reset

Restore a previously published manifest and apply both deployments. Image
rollback does not reverse database migrations; check schema compatibility first.

The Railway reset helper currently uploads temporary Dockerfiles and targets the
former `Postgres` service layout. It refuses an image-pinned checkout before
making Railway calls. It cannot reset the current `GCS DB` image deployment;
update its target and recovery sequence before using it again. Do not use the old
upload-based recovery command against an image-mode service.

## Local verification

```bash
bash -n scripts/test-container-image.sh
bun x vitest run tooling/gcs-ssc/tests/unit/shared-demo-image.test.ts tooling/gcs-ssc/tests/unit/railway-config.test.ts tooling/gcs-ssc/tests/unit/railway-demo-reset.test.ts
cd infra/aws
bun run typecheck
bun run test
bun run synth --quiet
```

With Docker available, build using the workflow's arguments and run
`bash scripts/test-container-image.sh IMAGE`. The smoke script creates and
removes only its uniquely named disposable containers, network, and volume.
It never uses a host `DATABASE_URL` or an existing deployment.
