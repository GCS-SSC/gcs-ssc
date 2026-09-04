# Polymorphic Registry Cutover Plan for Common, Agency, and Transfer Payment

## Summary

Implement a clean-cut migration only for the Common, Agency, and Transfer*Payment table groups. Do not expand the implementation into Funding_Opportunity, Applicant_Recipient, Funding_Case*\*, or other table
groups in this phase.

The goal is to replace the current transfer-payment-specific approvals/assessment/checklist setup model with the new polymorphic `Common_Entity` registry and unified `Common_Review_*`, `Common_Approvals_Setup`,
and `Common_Recommendation_*` model, fully wired from migrations through server contracts, UI, i18n, tests, and seed data.

## Implementation Changes

### Database and migrations

- Modify existing migration files directly to match the new DBML for Common, Agency, and Transfer_Payment.
- Update 0001_common.ts to:
  create the new enums used by these table groups, including Language_Preference, Review_Type, Entity_Type, Monitor_Action_Type, and Monitor_Responsible_Party;
  replace old common tables with the new Common_User, Common_GWCOA, Common_Entity, revised Common_Completion, revised approval tables, Common_Review_Schema, Common_Review_Set_Setup, Common_Review_Setup,
  Common_Approvals_Setup, Common_Review_Set, Common_Review, Common_Review_Response, Common_Recommendation_Schema, Common_Recommendation_Setup, Common_Recommendation, Common_Attachment_Types,
  Common_Attachment, and revised Common_Form_Schema.
- Remove legacy common tables and shapes that are superseded:
  Common_Assessment_Schema, Common_Assessment_Set, Common_Assessment, Common_Answer, Common_Checklist_Schema, Common_Checklist_Set, Common_Checklist, Common_Checklist_Response, and the old pre-polymorphic
  completion/routing-slip contracts.
- Update 0004_agency.ts for the DBML changes that affect agency:
  egcs_ay_gwcoa_number, varchar sizing, index name changes, and any revised comments/constraints needed for Agency_Profile and related agency lookup/config tables.
- Update 0006_transfer_payment.ts to:
  reflect renamed columns such as egcs_tp_agency,
  apply timestamp/timestamptz and varchar sizing changes,
  rename monitor-related enum usage,
  remove transfer-payment-specific setup tables now replaced by common polymorphic setup tables.
- Replace Transfer_Payment_Stream_Approvals_Setup, Transfer_Payment_Stream_Assessment_Set, Transfer_Payment_Stream_Checklist_Set, and their member tables with Common_Approvals_Setup, Common_Review_Set_Setup,
  and Common_Review_Setup.
- Add the register_entity() function and trigger creation in the second-last migration file, after tables/enums exist and before 9999_seed.ts.
- Create registry triggers only for the table groups in scope for this phase:
  at minimum Transfer_Payment_Stream, and any transfer-payment root entities that must participate in polymorphic references now.
- Do not add triggers for out-of-scope table groups in this phase.
- Preserve the DBML composite FK and composite unique index design so referential integrity is enforced by (id, entitytype) pairs, not ID-only references.

### Shared types, enums, schemas, and server logic

- Replace enum constants and generated Kysely database types with the new in-scope enum set.
- Remove old transfer-payment/common type assumptions around “assessment type”, “checklist type”, and “approval type” where they are replaced by Review_Type and Entity_Type.
- Rewrite shared/types/database.d.ts to the new schema shape for only the in-scope table groups.
- Replace the old admin/common Zod schemas with new create/patch schemas for:
  CommonReviewSchema, CommonReviewSetSetup, CommonReviewSetup, CommonApprovalsSetup, CommonReviewSet, CommonReview, CommonReviewResponse, CommonAssessmentOutcome, CommonRecommendationSchema,
  CommonRecommendationSetup, CommonRecommendation, CommonEntity, revised CommonCompletion, revised CommonRoutingSlip, revised CommonApproval, revised CommonApprovalStep, revised CommonCertification,
  revised CommonFormSchema, revised CommonAttachmentTypes, revised CommonAttachment, revised CommonUser, and updated Agency / Transfer_Payment schemas.
- Refactor server/utils/admin-common.ts and related generic CRUD to expose only the new in-scope common resources.
- Replace agency schema lookup endpoints with the new review-schema-oriented endpoints needed by transfer payment configuration.
- Add a transfer-payment-focused orchestration layer that:
  resolves registry identity from Common_Entity,
  validates (entityid, entitytype) pair integrity,
  creates runtime Common_Completion, Common_Review_Set, Common_Review, Common_Routing_Slip, Common_Approval, and Common_Recommendation rows from setup/config rows when required by in-scope transfer-payment
  flows.
- Keep orchestration scoped to current transfer-payment functionality; do not add runtime services for out-of-scope table groups.

### UI and frontend cutover

- Replace admin/common tabs, schema mappings, lookup endpoints, and form field configs in app/app.config.ts and app/pages/admin/common.vue to the new in-scope resource set.
- Remove assessment/checklist dualism from admin/common and replace it with unified review and recommendation resources.
- Rework transfer-payment stream setup UI to manage:
  Common_Approvals_Setup,
  Common_Review_Set_Setup,
  Common_Review_Setup,
  Common_Recommendation_Setup
  scoped to a transfer payment stream entity.
- Replace the current transfer-payment assessment-sets and checklist-sets UI/routes with a unified review-set setup flow parameterized by Review_Type.
- Keep transfer-payment approvals setup as a dedicated flow backed by Common_Approvals_Setup.
- Add transfer-payment recommendation setup UI backed by Common_Recommendation_Setup.
- Update lookup components to fetch the new review schemas, approval templates, and recommendation schemas from admin/common endpoints.
- Do not add UI for funding opportunity, applicant recipient, or funding case groups in this phase.
- Update i18n keys and labels for the renamed common concepts and any changed agency/transfer-payment fields.

### Seed data

- Rewrite 9999_seed.ts for only the in-scope groups.
- Insert Common_GWCOA before agencies.
- Populate agencies with egcs_ay_gwcoa_number.
- Include common users/contacts, approval templates/steps/certifications, form schemas, attachment types, review schemas, review set setups, approvals setups, recommendation schemas, and recommendation setups.
- Seed transfer payments and streams so stream inserts exercise registry trigger creation in Common_Entity.
- Seed at least one realistic transfer-payment stream scenario that demonstrates:
  stream registration in Common_Entity,
  review setup rows using composite scope references,
  approvals setup rows,
  recommendation setup rows,
  and at least one runtime instance path if current transfer-payment flows already create/completed runtime entities in this repo.
- Remove all legacy assessment/checklist seed inserts and cleanup calls.

## Public Interface Changes

- Admin/common resource slugs move from assessment/checklist-specific resources to the new review/recommendation/common resource set.
- Transfer-payment stream configuration APIs change from:
  assessment-sets, checklist-sets, and old approvals setup payloads
  to unified review set setup, review members, approvals setup, and recommendation setup endpoints/payloads.
- Lookup endpoints switch from assessment/checklist schema terminology to review schema terminology.
- Shared payloads now use explicit egcs_cn_entitytype and egcs_cn_entityid where required by the new polymorphic model.

## Test Plan

- Update migration regression tests to assert the in-scope new enums, tables, composite FKs, composite unique indexes, function creation, and trigger creation.
- Replace old admin/common schema and route tests with coverage for every new in-scope resource.
- Replace transfer-payment assessment/checklist setup route tests with unified review setup and recommendation setup route tests.
- Add unit tests for the transfer-payment orchestration layer covering:
  valid runtime generation,
  mismatched (entityid, entitytype) rejection,
  duplicate prevention,
  sequential review behavior,
  approval template handling,
  recommendation creation.
- Update admin/common component tests and transfer-payment setup component tests to the new resource model.
- Update e2e coverage for admin/common and transfer-payment setup pages only.
- Run bun run lint, bun run typecheck, bun run test:unit, bun run test:coverage, and relevant bun run test:e2e:light coverage for admin/common and transfer-payment flows.

## Assumptions and defaults

- Scope is strictly limited to Common, Agency, and Transfer_Payment.
- Clean cutover means old common assessment/checklist tables, old transfer-payment setup tables, old route slugs, old UI tabs, and old tests are removed rather than bridged.
- The second-last migration file is where register_entity() and in-scope trigger creation should land.
- Registry triggers are only for entities needed by the in-scope table groups right now.
- Runtime automation is only planned for transfer-payment-backed flows that exist in the current codebase; out-of-scope table groups receive no implementation in this phase.
