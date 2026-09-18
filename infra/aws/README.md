# GCS-SSC AWS demo

TypeScript CDK deployment for `ENVIRONMENT_TYPE=demo` in `ca-central-1`.

See [the deployment runbook](../../docs/deployment-aws.md) for prerequisites,
cost estimates, deployment commands, AWS-provided HTTPS, the future S3 bucket,
and recovery procedures.

```bash
npm ci
npm run typecheck
npm test
npm run synth -- --quiet
```

Tests live in the private `tooling/gcs-ssc` submodule. Deploying requires an
authenticated AWS account and a public image from the
[GitHub workflow](../../docs/container-images.md), pinned in
`deployment/demo-image.json`. No local Docker build is needed. Synthesis does
not provision resources.
