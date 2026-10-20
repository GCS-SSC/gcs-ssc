FROM oven/bun:1.3.13 AS build

WORKDIR /app

ARG ENVIRONMENT_TYPE
ARG AWS_RDS_CA_BUNDLE=false

RUN case "$ENVIRONMENT_TYPE" in \
    demo|production) ;; \
    *) echo "ENVIRONMENT_TYPE must be demo or production" >&2; exit 1 ;; \
  esac

RUN apt-get update \
  && apt-get install --no-install-recommends --yes ca-certificates git \
  && rm -rf /var/lib/apt/lists/*

COPY package.json bun.lock ./
COPY patches/ ./patches/

# This core workspace is stored in the main repository rather than a submodule.
# Stage it before installation so Bun can resolve the root workspace dependency
# and Nuxt's install-time preparation can load its source exports.
COPY packages/gcs-ssc-authorization ./packages/gcs-ssc-authorization
COPY packages/gcs-ssc-diagrams ./packages/gcs-ssc-diagrams
COPY packages/gcs-ssc-guided-help ./packages/gcs-ssc-guided-help

# Prefer complete source checkouts, including private extension repositories.
# Remote contexts without submodule contents fall back to the pinned commits.
COPY packages/gcs-ssc-extensions/ ./packages/gcs-ssc-extensions/
COPY extensions/ ./extensions/
RUN set -eux; \
  fetch_workspace() { \
    repository="$1"; destination="$2"; commit="$3"; \
    if [ -f "$destination/package.json" ] && { [ -f "$destination/extension.config.ts" ] || [ -f "$destination/src/index.ts" ]; }; then return; fi; \
    mkdir -p "$destination"; \
    git -C "$destination" init; \
    git -C "$destination" remote add origin "$repository"; \
    git -C "$destination" fetch --depth 1 origin "$commit" || { echo "Unable to fetch $destination; provide its complete authenticated checkout in the build context." >&2; exit 1; }; \
    git -C "$destination" checkout --detach FETCH_HEAD; \
    rm -rf "$destination/.git"; \
  }; \
  fetch_workspace https://github.com/GCS-SSC/gcs-ssc-extensions.git packages/gcs-ssc-extensions b955ba5dde9097e69127e172343ee2aa4eade91f; \
  fetch_workspace https://github.com/GCS-SSC/gcs-agreement-number.git extensions/gcs-agreement-number 41721b21f970cc68ad8b1de299ae5f0d6e07ff15; \
  fetch_workspace https://github.com/GCS-SSC/gcs-automated-payments.git extensions/gcs-automated-payments 4f807d4346a4b5a87d9e61965bc3be2d52f9dbd9; \
  fetch_workspace https://github.com/GCS-SSC/gcs-gcforms-integration.git extensions/gcs-gcforms-integration 6997fcd7a668b9532b46d53d8562b7c072fc0b03; \
  fetch_workspace https://github.com/GCS-SSC/gcs-machine-translation.git extensions/gcs-machine-translation c2e07936bd727815a1dbf613df53eff8cb606cd0; \
  fetch_workspace https://github.com/GCS-SSC/gcs-narrative-quality.git extensions/gcs-narrative-quality 562115bd7e175fbd592ff8b85b5dd923d004e4a8; \
  fetch_workspace https://github.com/GCS-SSC/gcs-narrative-tags.git extensions/gcs-narrative-tags d0be536d3f9d5c8219a013c8289dfb48bc9887bd; \
  fetch_workspace https://github.com/GCS-SSC/gcs-outcome-cost-allocation.git extensions/gcs-outcome-cost-allocation e1cc5fde944a21797b8190370dd5889ab776c87a; \
  fetch_workspace https://github.com/GCS-SSC/gcs-ssc-portal-connector.git extensions/gcs-ssc-portal-connector 92bab8b2be225a0c6af034d05801a132c8ba7be2; \
  fetch_workspace https://github.com/GCS-SSC/gcs-storage-local.git extensions/gcs-storage-local 933e55267a04ab757e472831b373a21f9a693f1d; \
  fetch_workspace https://github.com/GCS-SSC/gcs-storage-s3.git extensions/gcs-storage-s3 24a878177c1cf746eca49fec3f264fc6a5dae9ea

RUN bun install --frozen-lockfile

COPY . .

RUN bun run postinstall

ENV NODE_ENV=production
ENV NITRO_PRESET=node-server

RUN bun run build

# ECS uses the same application image and an AWS-specific startup command.
# Only AWS builds fetch the RDS trust bundle; Railway builds stay independent.
RUN cp scripts/aws-start.mjs .output/server/aws-start.mjs \
  && if [ "$AWS_RDS_CA_BUNDLE" = "true" ]; then \
    bun -e 'const r = await fetch("https://truststore.pki.rds.amazonaws.com/ca-central-1/ca-central-1-bundle.pem"); if (!r.ok) throw new Error("RDS CA download failed"); const pem = await r.text(); if (!pem.includes("-----BEGIN CERTIFICATE-----")) throw new Error("Invalid RDS CA bundle"); await Bun.write(".output/rds-ca.pem", pem)'; \
  fi

RUN if [ "$ENVIRONMENT_TYPE" = "demo" ]; then \
    mkdir -p .output/server/demo-migrations .output/demo-assets \
    && bun run scripts/build-demo-migration.ts .output/server/demo-migrations/demo.mjs \
    && cp "demo-assets/Contribution Agreement.docx" ".output/demo-assets/Contribution Agreement.docx"; \
  fi

FROM node:24-bookworm-slim AS runtime

ARG ENVIRONMENT_TYPE

RUN apt-get update \
  && apt-get install --no-install-recommends --yes \
    chromium \
    fonts-liberation \
    libreoffice-writer \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=build --chown=node:node /app/.output ./.output
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/node_modules/.bun/ws@8.20.1/node_modules/ws /app/.output/server/node_modules/ws

RUN node -e 'const fs = require("node:fs"); const path = require("node:path"); const walk = (dir) => { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) if (entry.isDirectory()) walk(path.join(dir, entry.name)); if (fs.readdirSync(dir).join() === "package.json") fs.rmSync(dir, { recursive: true }); }; walk("/app/.output/server/node_modules");' \
  && node -e 'const fs = require("node:fs"); const path = require("node:path"); const deps = require("/app/.output/server/package.json").dependencies; for (const [name, version] of Object.entries(deps)) { const target = path.join("/app/node_modules", name); const stored = path.join("/app/node_modules/.bun", name.replace("/", "+") + "@" + version, "node_modules", name); if (!fs.existsSync(target) && fs.existsSync(stored)) { fs.mkdirSync(path.dirname(target), { recursive: true }); fs.symlinkSync(stored, target, "dir"); } }' \
  && if [ "$ENVIRONMENT_TYPE" = "demo" ]; then \
    mkdir -p /app/demo-assets \
    && cp "/app/.output/demo-assets/Contribution Agreement.docx" "/app/demo-assets/Contribution Agreement.docx"; \
  fi \
  && chown -R node:node /app/.output \
  && if [ -d /app/demo-assets ]; then chown -R node:node /app/demo-assets; fi \
  && mkdir -p /app/.data/pglite \
  && chown -R node:node /app/.data

COPY --from=build --chown=node:node /app/extensions/gcs-ssc-portal-connector/vendor/survey /app/.output/server/node_modules/@gcs-ssc/survey

ENV NODE_ENV=production
ENV ENVIRONMENT_TYPE=${ENVIRONMENT_TYPE}
ENV HOST=0.0.0.0
ENV PORT=3000
ENV PGLITE_DATA_DIR=/app/.data/pglite
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV LIBREOFFICE_SOFFICE_PATH=/usr/bin/soffice

USER node

EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]
