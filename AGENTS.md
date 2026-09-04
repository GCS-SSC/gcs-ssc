# GCS-SSC Agent Bootstrap

The private repository instructions, architecture documentation, tests, and explicit GCS-SSC skill are stored in the `tooling/gcs-ssc` submodule.

Before working in this repository:

1. Run `bun run tooling:setup` if the private tooling checkout or local bridges are missing.
2. Read `tooling/gcs-ssc/AGENTS.md` completely and follow it for all repository work.
3. Author tests and architecture documentation in `tooling/gcs-ssc/tests/` and `tooling/gcs-ssc/architecture/`, commit them in the private repository first, and then update the host repository's pinned gitlink.

The generated `tests/`, `architecture/`, and `.agents/skills/gcs-ssc` paths are local compatibility links and must never be committed to this repository. The `$gcs-ssc` skill remains explicit-only; this bootstrap does not invoke its stateful workflows automatically.
