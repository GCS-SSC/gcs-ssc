# Agency Design-Time Catalog Runtime Migration

## Purpose

Move design-time configuration from Transfer Payment Streams to Agencies without changing end-user Review, Recommendation, Approval, or Workflow execution behavior.

Agency-owned catalogs:

- Custom Fields and Custom Field Options
- Approval Templates
- Review Schemas
- Review Sets
- Recommendation Schemas
- Recommendation Sets
- Workflows

Stream-owned configuration after the migration:

- Custom Field Sections
- Custom Field assignments and assignment settings
- Review Set links
- Workflow links
- Existing Stream-specific operational reference data, including Risk Ratings

This is an explicitly authorized clean-slate break. Rewrite the existing migrations and demo seed in place. Do not retain redirects, compatibility payloads, old routes, dual reads, backfills, aliases, or deprecated schema columns. A database reset and reseed are required.

## Repository rules

Before starting any stage:

1. Read `tooling/gcs-ssc/AGENTS.md` completely.
2. If tooling bridges are missing, run `bun run tooling:setup`.
3. Read the relevant canonical architecture documents, especially:
   - `tooling/gcs-ssc/architecture/database-naming.md`
   - `tooling/gcs-ssc/architecture/required-fields.md`
   - `tooling/gcs-ssc/architecture/ui-patterns.md`
   - `tooling/gcs-ssc/architecture/auth.md`
   - `tooling/gcs-ssc/architecture/polymorphic-integrity.md`
   - `tooling/gcs-ssc/architecture/compatibility-boundaries.md`
   - `tooling/gcs-ssc/architecture/extension-translations.md` when an extension changes
4. Preserve unrelated work. At the time this plan was written, these submodules were already modified and must not be reset:
   - `extensions/gcs-narrative-tags`
   - `packages/gcs-ssc-extensions`
5. Author architecture documentation and tests under `tooling/gcs-ssc/` first, commit them in that private repository, and only then advance the host gitlink.
6. Every stage must leave the host repository compiling. Do not combine old TypeScript database types with a partially rewritten migration.
7. Run `bun run forms:check` after every stage that changes schemas, form fields, or controls.
8. Do not invoke CodeRabbit unless explicitly requested.

## Fixed authorization decisions

The authorization boundary is already settled and does not require another product decision:

- Agency Viewer can read Agency catalogs.
- Agency Contributor can create, edit, publish, retire, and soft-delete Agency catalog items.
- Program Viewer can read Stream assignments and links.
- Program Contributor can create, configure, deactivate, and remove Stream assignments and links, but cannot alter Agency definitions.
- Catalog mutations lock and freshly reauthorize the Agency.
- Stream association mutations lock and freshly reauthorize the Agency, Program, Stream, publication, and association rows in canonical order.
- Existing entity assignment requirements for runtime casework do not change.
- Catalog ownership is never inferred from a client request body.

## Target database model

Use owning-domain prefixes for every column. `id` and `_deleted` are the only standard exceptions.

### Agency Custom Fields

Create `Agency_Custom_Field`:

- `id`
- `egcs_ay_agency`
- `egcs_ay_name_en`
- `egcs_ay_name_fr`
- `egcs_ay_kind`: `text | number | relational`
- `egcs_ay_multiple`
- `egcs_ay_presentation`: `single_line | multiline`
- `egcs_ay_discriminator`
- `_deleted`

Create `Agency_Custom_Field_Option`:

- `id`
- `egcs_ay_field`
- `egcs_ay_name_en`
- `egcs_ay_name_fr`
- `egcs_ay_category_en`
- `egcs_ay_category_fr`
- `egcs_ay_active`
- `egcs_ay_displayorder`
- `_deleted`

Keep `Transfer_Payment_Stream_Field_Section` unchanged as a Stream-owned layout entity.

Replace `Transfer_Payment_Stream_Field` with `Transfer_Payment_Stream_Field_Assignment`:

- `id`
- `egcs_tp_transferpaymentstream`
- `egcs_tp_agencyfield`
- `egcs_tp_section`
- `egcs_tp_required`
- `egcs_tp_active`
- `egcs_tp_displayorder`
- `_deleted`

Constraints:

- One live assignment per Stream/Agency Field.
- Assignment and Section must belong to the same Stream.
- Assigned field must belong to the Stream's current Agency.
- Deleted Agency fields cannot receive new assignments.
- Field kind and Agency ownership are immutable.
- `multiple: true` cannot be changed to `false`.
- Non-relational fields cannot be multiple or discriminators.
- Non-text fields must use `single_line` presentation.
- Option category labels are both null or both non-null.

Agreement `egcs_fc_customfields` remains JSON keyed by `Agency_Custom_Field.id`. Relational values remain arrays of `Agency_Custom_Field_Option.id`. Assignment IDs never appear in Agreement data or immutable publication evidence.

### Agency publication catalogs

Replace `egcs_cn_scopetype` and `egcs_cn_scopeid` with `egcs_cn_agency` on:

- `Common_Approval_Template`
- `Common_Review_Set_Setup`
- `Common_Recommendation_Set_Setup`
- `Common_Workflow_Setup`

Keep existing `egcs_cn_agency` ownership on:

- `Common_Review_Schema`
- `Common_Recommendation_Schema`

All nested records must resolve to the same Agency as their owning catalog aggregate:

- Review Set → Review Schema and Approval Template
- Recommendation Set → Recommendation Schema and Approval Template
- Workflow → statuses, Review Sets, Recommendation Sets, Approval Templates, Custom Fields, and Custom Field Options
- Nested member-owner records must remain within their selected Set

### Stream links

Create `Transfer_Payment_Stream_Review_Set`:

- `id`
- `egcs_tp_transferpaymentstream`
- `egcs_tp_reviewset`
- `_deleted`

Create `Transfer_Payment_Stream_Workflow`:

- `id`
- `egcs_tp_transferpaymentstream`
- `egcs_tp_workflow`
- `_deleted`

Constraints:

- Only published, nondeleted catalog items from the same Agency can be linked.
- One live link per Stream/catalog item.
- Multiple standard Workflows are allowed for one Stream/entity type.
- At most one live `approval_submission` Workflow per Stream/entity type.
- At most one live `risk_rating` Workflow per Stream/entity type.
- Retirement does not delete an existing link.
- Retired links remain visible and removable but are ineligible for new runtime starts.

### Program Agency transfer guard

Block `Transfer_Payment_Profile.egcs_tp_agency` changes while any child Stream retains a live:

- Custom Field assignment
- Review Set link
- Workflow link

Do not silently detach or reclassify those records.

### Audit ownership

Register every new table in `server/database/audit-ownership-registry.ts`:

- `Agency_Custom_Field` → direct Agency
- `Agency_Custom_Field_Option` → parent Agency Custom Field
- `Transfer_Payment_Stream_Field_Assignment` → parent Stream
- `Transfer_Payment_Stream_Review_Set` → parent Stream
- `Transfer_Payment_Stream_Workflow` → parent Stream

Change the four catalog aggregate rules from polymorphic entity ownership to direct `egcs_cn_agency` ownership.

Add independent concrete-row audience expectations and complete ownership-resolution tests for every new or renamed table, including missing parents and Program Agency transfer behavior. Do not derive expected audiences from the registry itself.

## API target

All Agency catalog routes infer the Agency from the path and authorization context. No request body contains `agencyId`, `scopeType`, or `scopeId`.

### Agency routes

Use `/api/agency/:agencyId/...` consistently:

- `custom-fields`
- `custom-fields/:fieldId`
- `custom-fields/:fieldId/options`
- `custom-fields/:fieldId/options/:optionId`
- `approval-templates`
- `approval-templates/:templateId`
- `approval-templates/:templateId/publish`
- `approval-templates/:templateId/retire`
- `review-schemas`
- `review-schemas/:schemaId`
- `review-schemas/:schemaId/publish`
- `review-schemas/:schemaId/retire`
- `review-sets`
- `review-sets/:reviewSetId`
- all Review Set member, group, schema-create, publish, and retire operations
- `recommendation-schemas`
- `recommendation-schemas/:schemaId`
- `recommendation-schemas/:schemaId/publish`
- `recommendation-schemas/:schemaId/retire`
- `recommendation-sets`
- `recommendation-sets/:recommendationSetId`
- all Recommendation Set member, schema-create, publish, and retire operations
- `workflows`
- `workflows/:workflowId`
- all Workflow status, member, owner, condition, publish, and retire operations
- Agency-scoped user/group/status/custom-field/profile-condition lookups required by these editors

Use a consistent route parameter name (`agencyId`) for new nested routes. Existing top-level Agency routes that use `[id]` do not justify mixing parameter names inside a new catalog subtree.

Delete superseded routes rather than retaining adapters:

- `/api/approval-templates/**`
- Stream Approval Template authoring routes
- Stream Review/Recommendation Schema authoring routes
- Stream Review/Recommendation Set authoring routes
- Stream Workflow authoring routes
- Stream Custom Field definition/option routes

### Stream routes after migration

Retain or introduce only:

- `/api/transfer-payments/:programId/streams/:streamId/custom-fields`
  - GET sections and assigned Agency definitions
  - POST assignment
  - PATCH/DELETE assignment
  - section CRUD
- `/api/transfer-payments/:programId/streams/:streamId/review-sets`
  - GET current links, including retired catalog state
  - POST published same-Agency link
  - DELETE/soft-delete link
- `/api/transfer-payments/:programId/streams/:streamId/workflows`
  - GET current links, including retired catalog state
  - POST published same-Agency link with risk-rating validation
  - DELETE/soft-delete link

Program Contributor requests can change only assignment/link columns. Any Agency definition fields supplied to these endpoints must be rejected by strict request schemas.

## Runtime contracts

### Custom Fields

- `readAgreementCustomFieldDefinitions` joins live Stream assignments to active Agency definitions and their options.
- The returned runtime model uses the Agency Field ID as `id` and exposes the assignment ID separately only where the Stream editor needs it.
- Active Agreement forms show active assignments.
- Existing hidden values are preserved when an assignment is removed or deactivated.
- Reassigning the same Agency Field makes the preserved value visible again.
- A removed/inactive assignment makes a Workflow condition evaluate false; capture must not fail.
- A deleted definition or option is unavailable for new values/conditions but retained in immutable historical evidence.
- A retired option already saved on an Agreement may be displayed and cleared, but not newly selected.
- Published conditions remain executable from their snapshots only while the corresponding Stream assignment is active.

### Profile conditions

- Remove `holdback_basis` from the Workflow condition schema, authoring UI, lookup data, guards, publication builder, seed, and tests.
- Do not alter Agreement holdback fields or ordinary Agreement holdback functionality.
- Store `agreement_subtype` condition options as `Agency_Agreement_Type.id`.
- During runtime capture, translate `Funding_Case_Agreement_Profile.egcs_fc_agreementsubtype` through `Transfer_Payment_Agreement_Subtype.egcs_tp_agreementtype`.
- Store Recipient Subtype predicates as `Agency_Applicant_Recipient_Subtype.id`.
- Prefer a clear source name such as `recipient_subtype`; because compatibility is intentionally dropped, do not keep both it and `proponent_type`.

### Review selection

Direct Review lookup must:

1. Resolve the target's applicable Streams using the existing entity ownership rules.
2. Join those Streams to live `Transfer_Payment_Stream_Review_Set` links.
3. Join published, nonretired Review Set publication/version evidence.
4. Filter by entity type and direct-review eligibility.
5. Keep authorization and assignment behavior unchanged.

Retired sets remain visible on Stream configuration pages but cannot create new Reviews.

### Workflow selection

For Agreements and Agreement-owned children:

1. Resolve the Agreement's Stream.
2. Join `Transfer_Payment_Stream_Workflow`.
3. Select a published, nonretired Workflow matching entity type and purpose.

For `standard`, allow multiple linked Workflows and require/retain explicit selection where the current runtime already supports it.

For `approval_submission` and `risk_rating`, the link uniqueness rule makes the applicable Workflow singular.

Stop using `Common_Publication_Selection` Stream-scope keys as the authoritative Workflow selector. Remove obsolete selection rows, dimensions, builders, locks, and tests only after all current consumers are migrated.

Unlinking or retirement affects new starts only. Existing runtime attempts and permitted retries continue from pinned publication/version evidence.

### Nested Workflow dependencies

A Workflow publication pins all nested dependencies:

- Review Set publications
- Recommendation Set publications
- Approval Template publications
- Review/Recommendation Schema publications through their Sets
- condition labels/options

Nested dependencies do not need separate Stream links. A Stream Workflow link is sufficient.

### Risk-rating Workflows

Publication evidence must be Agency-portable:

- Store numerical assessment-band thresholds.
- Store the intended risk score for each band.
- Do not store Stream Risk Rating IDs or labels in the Agency Workflow publication.

When linking a risk-rating Workflow to a Stream:

- Load and lock the Stream's active Risk Ratings.
- Require exactly one rating for each published score.
- Reject missing scores, duplicate scores, or incompatible mappings.

At start and retry:

- Lock the Workflow link, publication/version, Agreement Stream, and matching Stream Risk Ratings.
- Capture the Stream Risk Rating ID, score, and bilingual label for every band into immutable runtime evidence.
- Hash/pin that evidence with the attempt.

At completion:

- Resolve the assessment result against the attempt's captured bands.
- Apply the captured score/rating result, never a live catalog re-query.
- Guard deletion or score mutation of a Stream Risk Rating referenced by an active/retryable attempt or current Stream link mapping.
- Label changes may be allowed only if historical attempts continue rendering captured labels.

Update `server/utils/agreement-risk-rating.ts`, Workflow publication types/builders, start/retry capture, runtime packet contracts, completion application, and Risk Rating delete/PATCH guards together.

## UI target

### Agency detail tabs

Add tabs using `CommonEntityEditorWorkspace`/`CommonRouteTabs` conventions already present on the Agency page:

- Custom Fields
- Approval Templates
- Review Schemas
- Review Sets
- Recommendation Schemas
- Recommendation Sets
- Workflows

Relocate and reuse the current editors rather than redesigning them. Change ownership context, endpoints, lookups, breadcrumbs, and return routes. Keep publication controls and bilingual forms.

Suggested component organization:

- Move generic editors out of `app/components/TransferPayment/` into domain or `Common` folders.
- Pass `agencyId` explicitly.
- Remove `transferPaymentId`, `streamId`, `scopeType`, and `scopeId` from Agency catalog components.
- Agency detail pages use Agency capabilities: Viewer for read, Contributor for catalog mutations.

### Stream detail tabs

Keep:

- Custom Fields: Sections plus assignment/configuration of existing Agency Fields
- Review Sets: link/unlink published Agency Review Sets
- Workflows: link/unlink published Agency Workflows

Remove:

- Approval Templates
- Review Schema authoring tabs
- Recommendation Schema authoring tabs
- Recommendation Set authoring tabs
- Any duplicate design-time editor that remains under Stream

Stream tables should show retired linked catalog items with an explicit retired badge and allow unlinking.

### Stream creation wizard

Remove inline Review and Recommendation authoring and their request payloads. Stream creation should create only Stream-owned records. Catalog links can be configured after creation unless an explicit link-selection step is retained using already-published Agency items.

### Required-field contract

For every moved or changed field:

- Use the actual new schema path.
- Keep Zod validation, visible bilingual required indicators, and native/ARIA semantics aligned.
- Preserve valid zero/false values.
- Ensure lookup search boxes do not inherit selected-value required semantics.
- Run `bun run forms:check` and resolve every stale or missing contract; do not merely update evidence hashes.

## Staged implementation

Each stage below is a separate stabilization boundary. Do not begin the next stage with a failing typecheck or a migration that cannot build a clean database.

### Stage 0 — Canonical contract and failing tests

Private tooling first:

1. Add an architecture document describing this target model and route/runtime contracts.
2. Update canonical test helpers to express Agency catalogs and Stream links.
3. Add focused failing tests for database constraints, authorization, runtime selection, and lifecycle behavior.
4. Commit the private tooling repository.
5. Advance the host `tooling/gcs-ssc` gitlink.

Host inventory:

- Enumerate all references to:
  - `egcs_cn_scopetype`
  - `egcs_cn_scopeid`
  - `Transfer_Payment_Stream_Field`
  - `Transfer_Payment_Stream_Field_Option`
  - Stream `review-setups`, `recommendation-setups`, `workflow-setups`, and schema routes
  - `Common_Publication_Selection`
  - `holdback_basis` Workflow predicates
  - risk-rating publication fields
- Classify each occurrence as migration, type/schema, authoring API, authoring UI, runtime, seed, test, extension, or documentation.

Gate:

- Test and architecture changes exist in private tooling.
- A checked-in or attached caller inventory has no unclassified executable references.
- Host source remains unchanged except for the tooling gitlink.

### Stage 1 — Database schema and generated types as one atomic change

Rewrite clean migrations:

- `0010_common.ts` / `0070_polymorphic_common_tp.ts` for Approval Template ownership, depending on creation ordering.
- `0060_transfer_payment.ts` for Agency Custom Fields, Stream assignments, and Stream link tables where ordering permits.
- `0070_polymorphic_common_tp.ts` for publication catalogs, nested integrity, conditions, and link constraints.
- `0090_funding_case_agreement.ts` for profile-condition guards and Agreement references.
- `0120_audit.ts` only where installed ownership SQL must change.
- `0240_seed.ts` later in Stage 7, but keep it temporarily compile-safe during Stage 1.

Update in the same commit:

- `shared/types/database.d.ts`
- `server/database/audit-ownership-registry.ts`
- canonical schema/naming manifests
- migration and audit ownership tests

To keep this stage compiling before API migration, first introduce domain repository helpers and replace direct old-column query types in runtime/authoring code within the same stage. Do not temporarily add fake old columns to `database.d.ts` when the migration no longer creates them.

Gate:

- Clean PGlite migration build.
- Clean PostgreSQL migration build.
- Database namespace convention passes.
- Audit ownership inventory and concrete-row tests pass.
- `bun run typecheck` passes.

### Stage 2 — Custom Field catalogs and assignments

Implement:

- Agency Custom Field schemas and route handlers.
- Stream assignment schemas and route handlers.
- Shared readers that project an assigned Agency definition without aliasing persisted column names.
- Agreement validation and UI against Agency IDs/options.
- Workflow condition authoring against Agency definitions.
- Hidden-value preservation and false-on-missing-assignment behavior.
- Program Agency transfer guard for assignments.
- Agency Custom Fields tab and Stream assignment tab.

Delete:

- Stream definition/option schemas.
- Stream definition/option mutation endpoints.
- Old Stream definition modal contracts.

Gate:

- Agency Contributor versus Program Contributor route tests.
- Same-Agency and duplicate-assignment PostgreSQL tests.
- Shared field ID with different Stream required/active/order settings.
- Unassign → hidden preserved value → reassign restoration journey.
- Inactive/missing assignment condition evaluates false.
- Tombstoned field/option cannot be newly assigned/selected/conditioned.
- Agreement create/edit browser coverage.
- Forms check, lint, typecheck, focused unit/PostgreSQL/E2E tests pass.

### Stage 3 — Approval Templates and Schema catalogs

Move Approval Templates to Agency routes and UI.

Relocate existing Review and Recommendation Schema routes/UI to Agency without redesigning the editors. Their database ownership is already Agency-based, so remove Stream authorization and routing assumptions rather than changing persisted schema ownership.

Update:

- group/user lookup routes to authorize and filter by Agency catalog ownership
- detail breadcrumbs and back links
- modal creation payloads
- publication helpers
- all host callers and direct E2E requests

Delete top-level `/api/approval-templates` and all Stream schema authoring routes after new callers are live.

Gate:

- Agency Viewer read and Contributor mutation tests.
- Foreign Agency concealment/rejection.
- Publish/retire/delete lifecycle tests.
- Group/user/status lookups cannot cross Agency.
- Agency tabs render and recover from failed saves/refreshes.
- No `scopeType`/`scopeId` remains in Approval Template request schemas or UI state.
- Forms check, lint, typecheck, focused unit/PostgreSQL/E2E tests pass.

### Stage 4 — Review and Recommendation Sets

Move Set aggregate authoring to Agency routes:

- list/create/detail/update/delete
- child/member CRUD
- group and schema lookups
- inline schema creation if it remains supported, targeting Agency schema routes
- publication and retirement

Enforce same-Agency nested dependencies in both routes and database constraints/triggers.

Implement Stream Review Set linking and replace the Stream Review Sets editor with a relationship editor.

Remove Stream Recommendation Set authoring entirely; Recommendation Sets are reached only through Agency authoring and nested Workflow dependencies.

Update direct Review runtime selection to use Stream Review Set links.

Gate:

- Same-Agency nested dependency tests.
- Cross-Agency Schema/Template rejection.
- Stream link uniqueness and published-only constraint tests.
- Retirement remains visible but prevents new direct Reviews.
- Unlink affects new direct Reviews only.
- Existing Review runtime/materialization behavior remains unchanged.
- Forms check, lint, typecheck, focused unit/PostgreSQL/E2E tests pass.

### Stage 5 — Workflow catalogs and Stream links

Move complete Workflow authoring to Agency routes:

- Workflow aggregate CRUD
- allowed-start statuses
- members
- nested owner defaults
- conditions
- publication and retirement
- all Agency-scoped lookups

Update publication validation to use `egcs_cn_agency` for statuses and nested dependencies.

Implement Stream Workflow link routes/editor and special-purpose uniqueness.

Replace runtime selection with Stream Workflow links:

- standard availability
- explicit start
- approval submission
- risk rating
- completion-triggered workflows
- retry

Remove Stream publication selection keys only after all runtime queries use links.

Gate:

- Multiple standard Workflows per Stream/entity type.
- Singular approval-submission/risk-rating link constraint.
- Published-only/same-Agency links.
- Retirement/unlink new-start behavior.
- Existing attempts and retries use pinned evidence.
- End-to-end generation, materialization, execution, completion, and retry regression tests pass.
- Forms check, lint, typecheck, focused unit/PostgreSQL/E2E tests pass.

### Stage 6 — Profile conditions and risk-rating evidence

Remove Holdback Basis conditions and rename/migrate the supported source vocabulary in schemas, builders, UI, seed, and tests.

Implement Agency Agreement Type and Recipient Subtype condition IDs.

Implement score-only risk-rating Workflow publications and Stream mapping validation.

Add immutable per-attempt risk-rating mapping evidence and make completion consume it.

Update Stream Risk Rating deletion/score guards for current links and active/retryable attempts.

Gate:

- Holdback Basis cannot be authored as a condition.
- Existing Agreement holdback behavior passes unchanged.
- Agreement subtype capture translates Stream mapping ID to Agency type ID.
- Recipient subtype any/all behavior passes.
- Link fails when required risk scores are absent or ambiguous.
- Start/retry captures IDs, scores, and bilingual labels.
- Completion applies captured evidence after a live label change.
- Unsafe deletion/score change is rejected.
- Retry remains deterministic.

### Stage 7 — Wizard, seed, and extension callers

Remove Review/Recommendation authoring from the Stream creation wizard:

- request schemas
- client form state
- server transaction helpers
- temp-ID mapping
- tests and translations no longer used

Rebuild `0240_seed.ts` around Agency catalogs, then create Stream assignments/links.

Seed requirements:

- At least one Agency Custom Field assigned to multiple Streams with different assignment settings.
- At least one published Review Set linked to multiple Streams.
- At least one published standard Workflow linked to multiple Streams.
- Approval-submission and risk-rating examples with valid Stream mappings.
- Agreement values keyed by Agency Field/Option IDs.
- Representative terminal runtime journey remains executable.

Update extension-owned setup helpers and direct design-time queries in their own repositories. Preserve extension runtime assertions and package-local translations/tests. Commit extension repositories first, then advance host gitlinks.

Gate:

- Clean database reset and seed.
- Seed-specific advancement tests.
- Extension unit/coverage/PostgreSQL/Playwright suites as applicable.
- Clean seeded end-to-end Agreement → Workflow → terminal outcome journey.

### Stage 8 — UI cleanup, translations, and contract deletion

Remove:

- superseded Stream tabs
- old pages and route-location helpers
- old modal utilities and scope types
- unused i18n keys only after executable source/tests no longer reference them
- old test helpers and fixtures
- obsolete publication-selection code
- old database interfaces and schemas

Add/update bilingual Agency and Stream tab labels, empty states, relationship actions, retirement messaging, validation errors, and accessible action labels.

Gate:

- `rg` finds no executable old authoring endpoints or `scopeType`/`scopeId` catalog payloads.
- `rg` finds no old Stream field definition/option table references.
- `rg` finds no Holdback Basis condition source.
- Routes removed by the break return 404 through Nitro routing; there are no redirects.
- Forms check, lint, typecheck pass.

### Stage 9 — Full stabilization and delivery

Perform a separate adversarial review of the completed patch:

- Compare intended versus final database ownership.
- Check every request/response caller.
- Check authorization response ordering and existence concealment.
- Check lock ordering and concurrent link/publish/retire/delete operations.
- Check soft deletion and immutable historical evidence.
- Check Program Agency transfer behavior.
- Check runtime start, completion, cancellation, failure, and retry.
- Check bilingual UI and required/accessibility semantics.
- Check extension boundaries and seed behavior.

Required final commands:

```bash
bun run forms:check
bun run lint
bun run typecheck
bun run test:unit
bun run test:coverage
bun run test:integration:postgres
bun run test:e2e:fast
```

Also run:

- Workflow-specific coverage gates and relevant targeted PostgreSQL suites.
- Audit ownership coverage/completeness gates.
- Relevant managed Playwright specs for Agency catalog authoring, Stream linking, Agreements, direct Reviews, approval submission, risk rating, completion, and retry.
- Each affected extension's own checks from its workspace.
- A clean seeded end-to-end runtime journey through a terminal result.

Record every skipped check and reason. Do not claim completion with a failing or skipped core gate.

## Recommended implementation mechanics

### Avoid a mixed TypeScript schema

The first unsuccessful attempt demonstrated that changing `shared/types/database.d.ts` immediately exposes old scope references across dozens of files. Handle a catalog family atomically:

1. Rewrite its migration columns.
2. Update its database interface.
3. Update publication/versioning helpers.
4. Update authoring routes.
5. Update runtime readers.
6. Update seed/test helpers.
7. Delete old routes.
8. Run typecheck before moving to the next family.

Do not add non-existent compatibility columns to the TypeScript interface to suppress errors.

### Prefer shared Agency catalog transactions

Create or reuse a helper that:

1. Requires a fresh auth context.
2. Locks the Agency in canonical order.
3. Reauthorizes Agency action.
4. Locks the catalog aggregate/publication/children.
5. Executes the mutation under Agency audit scope.

Create a separate Stream link/assignment helper that locks:

1. fresh authorization rows
2. Agency
3. Program
4. Stream
5. publication/catalog aggregate
6. link/assignment row

Do not make Agency helpers accept Stream scope types.

### Route relocation

Move one complete aggregate at a time. A safe order is:

1. Approval Templates
2. Review Schemas
3. Recommendation Schemas
4. Review Sets
5. Recommendation Sets
6. Workflows

For each aggregate, land the new Agency route and update every caller before deleting the old route in the same stage. Do not leave temporary redirects.

### Runtime evidence before live-catalog changes

For risk ratings and condition labels, define the immutable evidence type and its tests before changing completion logic. Runtime execution must never depend on a label or ID that exists only in the mutable live Stream catalog.

## Key source inventory

The following files/directories are central and should be re-read rather than blindly edited:

- `server/database/migrations/0010_common.ts`
- `server/database/migrations/0060_transfer_payment.ts`
- `server/database/migrations/0070_polymorphic_common_tp.ts`
- `server/database/migrations/0090_funding_case_agreement.ts`
- `server/database/migrations/0120_audit.ts`
- `server/database/migrations/0240_seed.ts`
- `shared/types/database.d.ts`
- `shared/types/schemas/agreement-custom-fields.ts`
- `shared/types/schemas/approval-template.ts`
- `shared/types/schemas/transfer-payment.ts`
- `shared/types/schemas/workflow.ts`
- `server/database/audit-ownership-registry.ts`
- `server/utils/agency-auth.ts`
- `server/utils/transfer-payment-write-transaction.ts`
- `server/utils/agreement-custom-fields.ts`
- `server/utils/stream-custom-field-routes.ts`
- `server/utils/approval-template-scope.ts`
- `server/utils/approval-templates.ts`
- `server/utils/transfer-payment-polymorphic.ts`
- `server/utils/review-setup-versioning.ts`
- `server/utils/recommendation-setup-versioning.ts`
- `server/utils/workflow-setup-versioning.ts`
- `server/utils/workflow-setup-members.ts`
- `server/utils/workflow-conditions.ts`
- `server/utils/workflow-profile-conditions.ts`
- `server/utils/workflow-routing-capture.ts`
- `server/utils/workflow-runtime.ts`
- `server/utils/review-runtime.ts`
- `server/utils/agreement-risk-rating.ts`
- `server/utils/transfer-payment-stream-wizard-routes.ts`
- `server/api/approval-templates/**`
- `server/api/agency/**/review-schemas*`
- `server/api/transfer-payments/**/streams/**/{custom-fields,assessment-schemas,assessment-sets,checklist-schemas,recommendation-schemas,recommendation-setups,review-setups,workflow-setups}/**`
- `app/pages/agencies/[id].vue`
- `app/composables/useTransferPaymentStreamDetailState.ts`
- `app/components/TransferPayment/CustomFieldsTab.vue`
- `app/components/TransferPayment/TransferPaymentApprovalTemplatesTab.vue`
- `app/components/TransferPayment/TransferPaymentReviewSetupsTab.vue`
- `app/components/TransferPayment/TransferPaymentRecommendationSetupTab.vue`
- `app/components/TransferPayment/TransferPaymentWorkflowSetupsTab.vue`
- `app/components/TransferPayment/WorkflowConditions.vue`
- existing schema/detail editor pages below `app/pages/transfer-payments/[id]/streams/[streamId]/`
- `app/components/Agreement/Fields/CustomFields.vue`

This list is a starting point, not proof of complete coverage. Re-run `rg` after each stage.

## Required focused tests

At minimum, add or update tests for:

- Agency Viewer versus Contributor catalog permissions.
- Program Viewer versus Contributor assignment/link permissions.
- Program Contributor cannot mutate Agency definitions.
- Cross-Agency field, option, schema, template, status, Set, and Workflow rejection.
- Concurrent duplicate Stream links/assignments.
- Retirement concurrent with linking or runtime start.
- Shared Agency Field ID across Streams with distinct required/active/order/section settings.
- Hidden Agreement value preservation and reassignment.
- Missing/inactive assignment conditions evaluate false.
- Field/option tombstones preserve historical labels/evidence.
- Agreement subtype Agency-ID capture.
- Recipient subtype any/all predicates.
- Holdback Basis condition removal.
- Risk score mapping validation, capture, completion, and guards.
- Program Agency transfer blocking and success after links/assignments are removed.
- Direct Review lookup through applicable Stream links.
- Standard Workflow multi-link selection.
- Approval-submission/risk-rating singular link behavior.
- Unlink/retire affects new starts only.
- Retry uses pinned publication and Stream-specific risk evidence.
- Complete audit audience resolution for every new table.

Preserve existing runtime expected outputs unless the condition or risk-rating evidence contract is deliberately changed.

## Completion definition

The migration is complete only when:

- No design-time definition is authored under a Stream except Stream assignments/links/sections.
- No affected catalog table retains polymorphic scope columns.
- No affected request body accepts Agency ownership or scope identity.
- Runtime starts resolve through Stream links.
- Existing attempts and retries remain deterministic from immutable evidence.
- All same-Agency rules are enforced at both route and database boundaries.
- Seed data demonstrates sharing across Streams.
- Audit ownership coverage is complete.
- Required-field coverage is clean.
- Host and affected extension verification gates pass.
- Old routes, payloads, types, pages, and helpers are deleted rather than deprecated.
