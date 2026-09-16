# GCS-SSC Agent Bootstrap

The private repository instructions, architecture documentation, tests, and explicit GCS-SSC skill are stored in the `tooling/gcs-ssc` submodule.

Before working in this repository:

1. Run `bun run tooling:setup` if the private tooling checkout or local bridges are missing.
2. Read `tooling/gcs-ssc/AGENTS.md` completely and follow it for all repository work.
3. For every added or changed form field (including fields introduced by merges/rebases), follow `tooling/gcs-ssc/architecture/required-fields.md`: keep validation, visible bilingual required indicators, and accessible control semantics consistent. Run `bun run forms:check` and resolve every uncovered or stale contract before considering the work complete.
4. Extensions own all extension-authored translations and tests. Follow `tooling/gcs-ssc/architecture/extension-translations.md`; use package-local catalogs and the catalog-backed SDK translator. Never expose or consume host message lookup through the extension SDK.
5. Author tests and architecture documentation in `tooling/gcs-ssc/tests/` and `tooling/gcs-ssc/architecture/`, commit them in the private repository first, and then update the host repository's pinned gitlink.

The generated `tests/`, `architecture/`, and `.agents/skills/gcs-ssc` paths are local compatibility links and must never be committed to this repository. The `$gcs-ssc` skill remains explicit-only; this bootstrap does not invoke its stateful workflows automatically.

Every new or renamed core database table must be registered in `server/database/audit-ownership-registry.ts`. Extension-authored tables may optionally declare ownership through the extension SDK; an extension table without a declaration is explicitly global. Do not hard-code extension implementation tables in the host registry. Specify its ownership relationship through the Program/Agreement or Proponent chain, a direct agency owner, or an explicit reason for global classification. Register typed and polymorphic variants as well; unrelated foreign keys are not ownership. Test the complete resolution path, including missing owners and transfers. Proponent evidence uses the actor’s active agency-scoped roles, regardless of role subject. Actorless Proponent operations require an explicit attribution policy; do not silently classify them globally.

Audit resolver completion requires a concrete-row ownership test for every core table. Expected agency audiences or global classifications must be authored independently of the registry; a registration/schema inventory alone is insufficient. Each extension owns equivalent tests for its tables and SDK declarations, including deliberate global fallback when undeclared. Missing table coverage fails the completion gate.
