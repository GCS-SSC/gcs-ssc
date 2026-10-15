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
  fetch_workspace https://github.com/GCS-SSC/gcs-ssc-extensions.git packages/gcs-ssc-extensions 940f507a13df41d19324c271d689af00e8917c4a; \
  fetch_workspace https://github.com/GCS-SSC/gcs-agreement-number.git extensions/gcs-agreement-number 854531d05c1a43881073ce8e42297eab0e398c5d; \
  fetch_workspace https://github.com/GCS-SSC/gcs-automated-payments.git extensions/gcs-automated-payments b22814640292d44169a4068b094306d0bcbc4972; \
  fetch_workspace https://github.com/GCS-SSC/gcs-gcforms-integration.git extensions/gcs-gcforms-integration bf6402a9777da62eef32af18a50f19b424ee38d5; \
  fetch_workspace https://github.com/GCS-SSC/gcs-machine-translation.git extensions/gcs-machine-translation c1819d3353041455cad0081bfb011b480f828f05; \
  fetch_workspace https://github.com/GCS-SSC/gcs-narrative-quality.git extensions/gcs-narrative-quality 1fcd7329ab0e5ae3bdf77da8f72b8d5729de643e; \
  fetch_workspace https://github.com/GCS-SSC/gcs-narrative-tags.git extensions/gcs-narrative-tags b2b1e897d2f880a8585a6a3446600f0086996982; \
  fetch_workspace https://github.com/GCS-SSC/gcs-outcome-cost-allocation.git extensions/gcs-outcome-cost-allocation 69d5af19451dfe6f9fab7a1a7aa5470abec0bebe; \
  fetch_workspace https://github.com/GCS-SSC/gcs-ssc-portal-connector.git extensions/gcs-ssc-portal-connector e0b9f998e23b23c34a331fcd4a5a46111f45098c; \
  fetch_workspace https://github.com/GCS-SSC/gcs-storage-local.git extensions/gcs-storage-local 933e55267a04ab757e472831b373a21f9a693f1d; \
  fetch_workspace https://github.com/GCS-SSC/gcs-storage-s3.git extensions/gcs-storage-s3 7f021314c9d430f2ed831c5cfe5cd3ac98cc714d

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
