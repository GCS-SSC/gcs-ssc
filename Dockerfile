FROM oven/bun:1.3.13 AS build

WORKDIR /app

ARG ENVIRONMENT_TYPE

RUN case "$ENVIRONMENT_TYPE" in \
    demo|production) ;; \
    *) echo "ENVIRONMENT_TYPE must be demo or production" >&2; exit 1 ;; \
  esac

RUN apt-get update \
  && apt-get install --no-install-recommends --yes ca-certificates git \
  && rm -rf /var/lib/apt/lists/*

COPY package.json bun.lock ./

# This core workspace is stored in the main repository rather than a submodule.
# Stage it before installation so Bun can resolve the root workspace dependency
# and Nuxt's install-time preparation can load its source exports.
COPY packages/gcs-ssc-authorization ./packages/gcs-ssc-authorization

# Remote Docker build contexts may omit Git submodule contents. Fetch every
# workspace at the exact gitlink commit recorded by this repository. The later
# source copy overlays these with local checkouts when they are available.
RUN set -eux; \
  fetch_workspace() { \
    repository="$1"; destination="$2"; commit="$3"; \
    mkdir -p "$destination"; \
    git -C "$destination" init; \
    git -C "$destination" remote add origin "$repository"; \
    git -C "$destination" fetch --depth 1 origin "$commit"; \
    git -C "$destination" checkout --detach FETCH_HEAD; \
    rm -rf "$destination/.git"; \
  }; \
  fetch_workspace https://github.com/GCS-SSC/gcs-ssc-extensions.git packages/gcs-ssc-extensions eecd92d3a49a6b822313124c4954a4be77ed3cb2; \
  fetch_workspace https://github.com/GCS-SSC/gcs-automated-payments.git extensions/gcs-automated-payments 23311612e0c3cb147a2886f7b9abd42b8169389f; \
  fetch_workspace https://github.com/GCS-SSC/gcs-gcforms-integration.git extensions/gcs-gcforms-integration fe8b820778ebb86b7bbfec67b113da926edf54d9; \
  fetch_workspace https://github.com/GCS-SSC/gcs-narrative-quality.git extensions/gcs-narrative-quality 34f24088b5d5aeb74358dda2eed8dec9464cce1e; \
  fetch_workspace https://github.com/GCS-SSC/gcs-narrative-tags.git extensions/gcs-narrative-tags aaaad20d0ae65a097b6cba4a5bb7f25b0c9e5656; \
  fetch_workspace https://github.com/GCS-SSC/gcs-outcome-cost-allocation.git extensions/gcs-outcome-cost-allocation 53940f26b321f8db4335464c62b949b9a9b64294; \
  fetch_workspace https://github.com/GCS-SSC/gcs-storage-local.git extensions/gcs-storage-local 6add3d9f5517481cb47c3be12b6592b4e98f0fb3; \
  fetch_workspace https://github.com/GCS-SSC/gcs-storage-s3.git extensions/gcs-storage-s3 0f523cd54f43a628e47662ec315f238d6905b441

RUN bun install --frozen-lockfile

COPY . .

RUN bun run postinstall

ENV NODE_ENV=production
ENV NITRO_PRESET=node-server

RUN bun run build

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

RUN npm install --omit=dev --ignore-scripts --legacy-peer-deps --no-audit --no-fund --prefix /app/.output/server \
  && if [ "$ENVIRONMENT_TYPE" = "demo" ]; then \
    mkdir -p /app/demo-assets \
    && cp "/app/.output/demo-assets/Contribution Agreement.docx" "/app/demo-assets/Contribution Agreement.docx"; \
  fi \
  && chown -R node:node /app/.output \
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
