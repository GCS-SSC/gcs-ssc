# GCS-SSC Agent Bootstrap

Before repository work:

1. Run `bun run tooling:setup` if the private `tooling/gcs-ssc` checkout or local bridges are missing.
2. Read [the canonical agent guide](tooling/gcs-ssc/AGENTS.md) completely and follow it, including its delegation and documentation-review protocol.
3. Use [the architecture index](tooling/gcs-ssc/architecture/README.md) to select task-relevant contracts. Verify them against current source before implementation and before completion.

The canonical guide owns engineering rules; keep detailed contracts there and in their linked architecture documents rather than duplicating them in this bootstrap.

Author host tests and architecture docs under `tooling/gcs-ssc/`; extension tests belong to the owning extension. Root `tests/`, `architecture/`, and `.agents/skills/gcs-ssc` are generated local links and must never be committed. The `$gcs-ssc` skill is explicit-only; this bootstrap does not invoke its stateful workflows.

Preserve unrelated work. Do not commit unless explicitly authorized. When authorized, commit private tooling changes first, then update the host repository's pinned gitlink.
