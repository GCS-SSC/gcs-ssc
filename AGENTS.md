# GCS-SSC Agent Bootstrap

The private repository instructions, architecture documentation, tests, and explicit GCS-SSC skill are stored in the `tooling/gcs-ssc` submodule.

[unDraw](https://undraw.co/) is the app's illustration provider. Use its SVG illustrations and adapt their colours to the app's theme, following the canonical guide's Vue and UI instructions.

At the start of each task, assess whether the work benefits from multiple AI agents and can be split into clearly bounded, non-overlapping scopes. Use multiple agents when it can, unless the user explicitly requests otherwise; continue with a single agent when the work is too small or tightly coupled to benefit from delegation. Reassess as additional tasks are added or the scope evolves, and delegate whenever a useful split becomes available. Assign each agent exclusive ownership of any files it edits. Coordinate dependencies through the primary agent, which integrates the results and verifies the complete change. If agent tooling is unavailable, state that limitation and continue with a single agent.

Before working in this repository:

1. Run `bun run tooling:setup` if the private tooling checkout or local bridges are missing.
2. Read `tooling/gcs-ssc/AGENTS.md` completely and follow it for all repository work.
   For every task, review the relevant architecture and agent instructions against the current source before implementation and again before completion. Update stale, contradictory, redundant, or missing documentation as part of the work and summarize the evidence and changes; follow the canonical guide's documentation review protocol.
3. For every added or changed form field (including fields introduced by merges/rebases), follow `tooling/gcs-ssc/architecture/required-fields.md`: keep validation, visible bilingual required indicators, and accessible control semantics consistent. Run `bun run forms:check` and resolve every uncovered or stale contract before considering the work complete.
4. Extensions own all extension-authored translations and tests. Follow `tooling/gcs-ssc/architecture/extension-translations.md`; use package-local catalogs and the catalog-backed SDK translator. Never expose or consume host message lookup through the extension SDK.
5. Follow `tooling/gcs-ssc/architecture/database-naming.md` for owning `egcs_<namespace>_` business-column prefixes throughout database, API, validation, and UI contracts. Follow `tooling/gcs-ssc/architecture/migration-policy.md` for clean cutovers: edit the owning subject baseline and rebuild/reseed, with no incremental upgrades or data/history preservation.
6. Author host tests and architecture documentation in `tooling/gcs-ssc/tests/` and `tooling/gcs-ssc/architecture/`; extension tests belong to their owning extension. When commits are explicitly authorized, commit private tooling changes first, then update the host repository's pinned gitlink.

The generated `tests/`, `architecture/`, and `.agents/skills/gcs-ssc` paths are local compatibility links and must never be committed to this repository. The `$gcs-ssc` skill remains explicit-only; this bootstrap does not invoke its stateful workflows automatically.

Follow the canonical guide's [database and audit invariants](tooling/gcs-ssc/AGENTS.md#database-and-migrations): register every new or renamed core table in `server/database/audit-ownership-registry.ts`, and prove each core table's ownership with independent concrete-row tests. Extension ownership declarations and equivalent tests belong to the extension. Missing coverage fails completion.
