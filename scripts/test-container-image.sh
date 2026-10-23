#!/usr/bin/env bash
set -euo pipefail

image=${1:?Pass the locally built demo image reference}
prefix="gcs-image-test-$$-${RANDOM}"
network="${prefix}-network"
database="${prefix}-db"
access_database="${prefix}-access-db"
application="${prefix}-app"
volume="${prefix}-data"

cleanup() {
  docker rm -f "$application" "$database" "$access_database" >/dev/null 2>&1 || true
  docker volume rm "$volume" >/dev/null 2>&1 || true
  docker network rm "$network" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker network create "$network" >/dev/null
docker volume create "$volume" >/dev/null
for database_container in "$database" "$access_database"; do
  docker run -d --name "$database_container" --network "$network" \
    -e POSTGRES_DB=gcs_ssc -e POSTGRES_USER=gcs_ssc \
    -e POSTGRES_PASSWORD=container-test-only postgres:17 >/dev/null

  database_ready=false
  for ((attempt=0; attempt<60; attempt++)); do
    if docker exec "$database_container" pg_isready -U gcs_ssc -d gcs_ssc >/dev/null 2>&1; then
      database_ready=true
      break
    fi
    sleep 2
  done
  if [ "$database_ready" != true ]; then
    docker logs "$database_container"
    exit 1
  fi

done

start_application() {
  docker run -d --name "$application" --network "$network" \
    -p 127.0.0.1::3000 -v "${volume}:/app/.data" \
    -e "DATABASE_URL=postgresql://gcs_ssc:container-test-only@${database}:5432/gcs_ssc" \
    -e "GCS_ACCESS_DATABASE_URL=postgresql://gcs_ssc:container-test-only@${access_database}:5432/gcs_ssc" \
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
    (SELECT count(*) FROM "Funding_Case_Agreement_Profile" agreement
      JOIN "Transfer_Payment_Stream" stream ON stream.id = agreement.egcs_fc_transferpaymentstream
      JOIN "Transfer_Payment_Profile" program ON program.id = stream.egcs_tp_transferpaymentprofile
      WHERE NOT agreement._deleted AND program.egcs_tp_agency = 21),
    (SELECT count(*) FROM "Funding_Case_Agreement_Payment"),
    (SELECT count(*) FROM "Funding_Case_Agreement_Payment" payment
      JOIN "Common_Status" status ON status.id = payment.egcs_fc_status
      WHERE NOT payment._deleted AND status.egcs_cn_terminal
        AND status.egcs_cn_name_en = '\''Paid'\''
        AND ((payment.id = 168 AND payment.egcs_fc_fundingagreement = 120 AND payment.egcs_fc_paymentamount = 21000)
          OR (payment.id = 172 AND payment.egcs_fc_fundingagreement = 150 AND payment.egcs_fc_paymentamount = 10000)))
')
if [ "$seed" != '1|1|13|8|2' ]; then
  echo "Unexpected NCIA seed state: $seed" >&2
  exit 1
fi
# Exercise a real audited business read and verify persistence uses the other server.
address=$(docker port "$application" 3000/tcp)
curl --fail --silent --max-time 5 "http://${address}/api/metadata/enums?name=agreement_type" >/dev/null
access_count=0
for ((attempt=0; attempt<30; attempt++)); do
  # Initialization is lazy, so the first flush can still be creating the schema.
  access_count=$(docker exec "$access_database" psql -X -U gcs_ssc -d gcs_ssc -At \
    -v ON_ERROR_STOP=1 -c 'SELECT count(*) FROM audit.access_event' 2>/dev/null) || access_count=0
  if ((access_count > 0)); then break; fi
  sleep 1
done
if ((access_count == 0)); then
  echo 'Audited enum read did not reach the separate access database.' >&2
  docker logs "$application"
  exit 1
fi
business_access_relation=$(docker exec "$database" psql -X -U gcs_ssc -d gcs_ssc -At \
  -v ON_ERROR_STOP=1 -c "SELECT to_regclass('audit.access_event')")
if [ -n "$business_access_relation" ]; then
  business_access_count=$(docker exec "$database" psql -X -U gcs_ssc -d gcs_ssc -At \
    -v ON_ERROR_STOP=1 -c 'SELECT count(*) FROM audit.access_event')
  if [ "$business_access_count" != 0 ]; then
    echo 'Access events unexpectedly persisted in the business database.' >&2
    exit 1
  fi
fi
access_has_no_users=$(docker exec "$access_database" psql -X -U gcs_ssc -d gcs_ssc -At \
  -v ON_ERROR_STOP=1 -c "SELECT to_regclass('public.\"user\"') IS NULL")
if [ "$access_has_no_users" != t ]; then
  echo 'Business user table unexpectedly exists in the access database.' >&2
  exit 1
fi

# Freeze the destination transport: business reads and readiness must keep working.
failure_since=$(date +%s)
docker pause "$access_database" >/dev/null
curl --fail --silent --max-time 5 "http://${address}/api/metadata/enums?name=agreement_type" >/dev/null
curl --fail --silent --max-time 5 "http://${address}/api/health" >/dev/null
failure_reported=false
for ((attempt=0; attempt<20; attempt++)); do
  application_logs=$(docker logs --since "$failure_since" "$application" 2>&1)
  if [[ "$application_logs" == *audit.access_persistence_failed* ]]; then
    failure_reported=true
    break
  fi
  sleep 1
done
if [ "$failure_reported" != true ]; then
  echo 'Frozen access transport did not produce bounded persistence-failure reporting.' >&2
  exit 1
fi
docker unpause "$access_database" >/dev/null
curl --fail --silent --max-time 5 "http://${address}/api/metadata/enums?name=agreement_type" >/dev/null
recovered=false
for ((attempt=0; attempt<30; attempt++)); do
  recovered_count=$(docker exec "$access_database" psql -X -U gcs_ssc -d gcs_ssc -At \
    -v ON_ERROR_STOP=1 -c 'SELECT count(*) FROM audit.access_event')
  if ((recovered_count > access_count)); then
    recovered=true
    break
  fi
  sleep 1
done
if [ "$recovered" != true ]; then
  echo 'Access delivery did not recover after its separate database resumed.' >&2
  docker logs "$application"
  exit 1
fi
echo 'Shared demo image passed two-instance access isolation, outage recovery, bilingual page, and file persistence checks.'
