# GCS-SSC Agent Bootstrap

The private repository instructions, architecture documentation, tests, and explicit GCS-SSC skill are stored in the `tooling/gcs-ssc` submodule.

Before working in this repository:

1. Run `bun run tooling:setup` if the private tooling checkout or local bridges are missing.
2. Read `tooling/gcs-ssc/AGENTS.md` completely and follow it for all repository work.
3. For every added or changed form field (including fields introduced by merges/rebases), follow `tooling/gcs-ssc/architecture/required-fields.md`: keep validation, visible bilingual required indicators, and accessible control semantics consistent. Run `bun run forms:check` and resolve every uncovered or stale contract before considering the work complete.
4. Author tests and architecture documentation in `tooling/gcs-ssc/tests/` and `tooling/gcs-ssc/architecture/`, commit them in the private repository first, and then update the host repository's pinned gitlink.

The generated `tests/`, `architecture/`, and `.agents/skills/gcs-ssc` paths are local compatibility links and must never be committed to this repository. The `$gcs-ssc` skill remains explicit-only; this bootstrap does not invoke its stateful workflows automatically.
