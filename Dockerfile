FROM node:24.22.1-bookworm-slim AS node-base

FROM oven/bun:1.3.13 AS build

COPY --from=node-base /usr/local/bin/node /usr/local/bin/node
RUN node --version \
  && bun -e 'const child = Bun.spawnSync(["node", "-p", "process.versions.bun || process.versions.node"]); const version = new TextDecoder().decode(child.stdout).trim(); if (child.exitCode !== 0 || version !== "24.22.1") throw new Error("Bun must launch real Node 24.22.1"); console.log("Bun child Node: " + version)'

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
  fetch_workspace https://github.com/GCS-SSC/gcs-ssc-extensions.git packages/gcs-ssc-extensions 51979aff733b0a538285c24cb09fb1e250b52f5a; \
  fetch_workspace https://github.com/GCS-SSC/gcs-agreement-number.git extensions/gcs-agreement-number daf1404b41a600bf880e5b3f1166b90ab5bce364; \
  fetch_workspace https://github.com/GCS-SSC/gcs-automated-payments.git extensions/gcs-automated-payments c95c9889a902e23047db9d174ee08a8a423d0f59; \
  fetch_workspace https://github.com/GCS-SSC/gcs-gcforms-integration.git extensions/gcs-gcforms-integration 31101f1c81d1fb8d8c343753918f36062d651a70; \
  fetch_workspace https://github.com/GCS-SSC/gcs-machine-translation.git extensions/gcs-machine-translation 12b2655c7b481b318e8500b2370dc01f28a27117; \
  fetch_workspace https://github.com/GCS-SSC/gcs-narrative-quality.git extensions/gcs-narrative-quality 08b1f69e8b5ec945440f55764e20f941baed4815; \
  fetch_workspace https://github.com/GCS-SSC/gcs-narrative-tags.git extensions/gcs-narrative-tags 16535c33bad5faa5952316b99c4412a57aea4843; \
  fetch_workspace https://github.com/GCS-SSC/gcs-outcome-cost-allocation.git extensions/gcs-outcome-cost-allocation 173299242a5913438df4424f879fa40d3fa49d2e; \
  fetch_workspace https://github.com/GCS-SSC/gcs-ssc-portal-connector.git extensions/gcs-ssc-portal-connector 3a93dedda43999d27b39121bac0f5c895afa4c12; \
  fetch_workspace https://github.com/GCS-SSC/gcs-storage-local.git extensions/gcs-storage-local 0c2029c93a52bfd4f88c2ef188cc62d4def2d2b1; \
  fetch_workspace https://github.com/GCS-SSC/gcs-storage-s3.git extensions/gcs-storage-s3 acae67eda302e00c2b85eb3bcd8b1e714a59a9b2

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

FROM node-base AS runtime

ARG ENVIRONMENT_TYPE

RUN apt-get update \
  && apt-get install --no-install-recommends --yes \
    chromium \
    fonts-liberation \
    libreoffice-writer \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=build --chown=node:node /app/.output ./.output
RUN if [ "$ENVIRONMENT_TYPE" = "demo" ]; then \
    mkdir -p /app/demo-assets \
    && cp "/app/.output/demo-assets/Contribution Agreement.docx" "/app/demo-assets/Contribution Agreement.docx"; \
  fi \
  && if [ -d /app/demo-assets ]; then chown -R node:node /app/demo-assets; fi \
  && mkdir -p /app/.data/pglite \
  && chown -R node:node /app/.data

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
