#!/usr/bin/env bash
set -euo pipefail
exec bash "$(dirname "${BASH_SOURCE[0]}")/../tooling/gcs-ssc/scripts/test-container-image.sh" "$@"
