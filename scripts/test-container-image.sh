#!/usr/bin/env bash
set -euo pipefail

image=${1:?Pass the locally built demo image reference}
prefix="gcs-image-test-$$-${RANDOM}"
network="${prefix}-network"
database="${prefix}-db"
application="${prefix}-app"
volume="${prefix}-data"

cleanup() {
  docker rm -f "$application" "$database" >/dev/null 2>&1 || true
  docker volume rm "$volume" >/dev/null 2>&1 || true
  docker network rm "$network" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker network create "$network" >/dev/null
docker volume create "$volume" >/dev/null
docker run -d --name "$database" --network "$network" \
  -e POSTGRES_DB=gcs_ssc -e POSTGRES_USER=gcs_ssc \
  -e POSTGRES_PASSWORD=container-test-only postgres:17 >/dev/null

database_ready=false
for ((attempt=0; attempt<60; attempt++)); do
  if docker exec "$database" pg_isready -U gcs_ssc -d gcs_ssc >/dev/null 2>&1; then
    database_ready=true
    break
  fi
  sleep 2
done
if [ "$database_ready" != true ]; then
  docker logs "$database"
  exit 1
fi

start_application() {
  docker run -d --name "$application" --network "$network" \
    -p 127.0.0.1::3000 -v "${volume}:/app/.data" \
    -e "DATABASE_URL=postgresql://gcs_ssc:container-test-only@${database}:5432/gcs_ssc" \
    -e BETTER_AUTH_SECRET=container-image-smoke-test-secret-only \
    -e BETTER_AUTH_URL=http://localhost:3000 \
    "$image" >/dev/null
  local address
  address=$(docker port "$application" 3000/tcp)
  for ((attempt=0; attempt<150; attempt++)); do
    if curl --fail --silent --max-time 5 "http://${address}/api/health" >/dev/null; then
      curl --fail --silent --max-time 10 "http://${address}/en" >/dev/null
      curl --fail --silent --max-time 10 "http://${address}/fr" >/dev/null
      return
    fi
    if [ "$(docker inspect --format '{{.State.Running}}' "$application")" != true ]; then
      break
    fi
    sleep 2
  done
  docker logs "$application"
  return 1
}

start_application
docker exec "$application" node --input-type=module -e '
  import assert from "node:assert/strict";
  import { access, mkdir, readFile, writeFile } from "node:fs/promises";
  assert.equal(process.env.ENVIRONMENT_TYPE, "demo");
  await access("/app/.output/server/aws-start.mjs");
  await access("/app/.output/server/demo-migrations/demo.mjs");
  await access("/app/demo-assets/Contribution Agreement.docx");
  assert.match(await readFile("/app/.output/rds-ca.pem", "utf8"), /BEGIN CERTIFICATE/);
  await mkdir("/app/.data/files", { recursive: true });
  await writeFile("/app/.data/files/container-persistence-canary", "persisted");
'

# A new container, rather than a process restart, must retain the file volume.
docker rm -f "$application" >/dev/null
start_application
docker exec "$application" node --input-type=module -e '
  import assert from "node:assert/strict";
  import { readFile } from "node:fs/promises";
  assert.equal(await readFile("/app/.data/files/container-persistence-canary", "utf8"), "persisted");
'
seed=$(docker exec "$database" psql -X -U gcs_ssc -d gcs_ssc -At -v ON_ERROR_STOP=1 -c '
  SELECT
    (SELECT count(*) FROM kysely_migration WHERE name = '\''9999_seed'\''),
    (SELECT count(*) FROM "Agency_Profile" WHERE id = 21 AND egcs_ay_abbreviation_en = '\''NCIA'\''),
    (SELECT count(*) FROM "Funding_Case_Agreement_Profile" WHERE NOT _deleted),
    (SELECT count(*) FROM "Funding_Case_Agreement_Payment")
')
if [ "$seed" != '1|1|11|0' ]; then
  echo "Unexpected NCIA seed state: $seed" >&2
  exit 1
fi
echo 'Shared demo image passed PostgreSQL startup, bilingual page, and file persistence checks.'
