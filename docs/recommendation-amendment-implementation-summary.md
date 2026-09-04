# Recommendation, amendment, and lifecycle implementation summary

## Scope

This branch starts the recommendation form builder/runtime and immutable agreement-amendment revision model, then hardens the surrounding agency-to-payment workflow based on sequential, limited-context Playwright walkthroughs. The walkthrough used separate system-administrator, program-administrator, executor, and approver identities so authorization and hand-offs were exercised as users encounter them.

## Recommendation forms and stream ownership

Recommendation schemas now use the same section → subsection → question authoring model as assessments and checklists. Questions support radio choices with bilingual option labels and plain-text responses with enforceable maximum lengths. The runtime components render and validate these definitions as user-fillable forms, while tests cover the radio/text rendering contract.

Recommendation schema ownership was moved to the transfer-payment stream. `Common_Recommendation_Schema` now has a required stream foreign key, its uniqueness rules are stream-aware, and a database trigger rejects a stream belonging to another agency. Program administrators can list, create, and update schemas from the stream detail UI through program-scoped, authorized routes. Recommendation setup creation additionally verifies that both the schema and approval template belong to the selected stream, preventing cross-stream configuration.

## Immutable agreement revisions

The agreement revision migration introduces immutable checkpoints linking an agreement, its amendment, recommendation, budget version, activity version, revision number, and authorized assistance value. Composite foreign keys and a validation trigger ensure amendment revisions cannot reference working versions or versions owned by another amendment. The same trigger ensures an activation recommendation targets the agreement and an amendment recommendation targets that exact amendment; unrelated polymorphic recommendations are rejected. Partial unique indexes prevent duplicate active revision numbers, amendment checkpoints, or recommendation checkpoints while retaining soft-delete semantics.

## Approval template creation and assignment

Approval templates can now be created before their first step is added. This matches the UI’s two-stage workflow while runtime validation still refuses to execute a payment template with no active approval step. Saving a step from the detail editor now persists the parent aggregate immediately, eliminating the misleading second Save action that previously caused apparently saved steps to disappear after reload.

Default-user lookup is scoped through the approval template to its stream and agency. It authorizes agency-scoped `user.read`, filters to users with valid active role assignments in that scope, and avoids ambiguous joined columns. Authentication-user creation, activation, and email/profile updates now synchronize the corresponding runtime `Common_User` identity transactionally, so newly managed users become selectable approvers without manual database repair.

## Review and completion setup

Review sets may now be created empty because the established UI creates the parent first and adds its assessment/checklist schema afterward. Validation remains mandatory whenever members are supplied. Empty persisted sets render a placeholder group row with the row-level Create Schema action instead of the contradictory “1 Records / No data” state. Regression tests cover both server creation and UI action availability.

## Agency and role administration fixes

Agency GWCOA entry is now a server-backed lookup rather than an unrestricted number. Invalid references are rejected before insertion and constraint failures are translated instead of exposing raw database errors. Role assignment selection was stabilized by normalizing identifiers and retaining the selected role across the popup interaction. The canonical `/login` path redirects to the localized login screen.

Agency fiscal-year create forms no longer silently seed both boundaries with today’s date. Blank dates remain blank until the user chooses them, so validation cannot persist an unintended date. The sequential walkthrough also established that executor access depends on a persisted role assignment; the reusable E2E setup now creates and verifies both administrator and executor assignments.

## Commitments, forecasts, and payments

Stream commitment creation now uses the supported Zod form validator and the correct stream-budget identifier. List joins were corrected so the displayed fiscal year comes from the selected stream budget. A composite database constraint enforces that a commitment’s stream budget belongs to the same stream, preventing internally inconsistent accounting configuration.

Completed commitments without an approval template are now activated and are eligible for payment. Previously they ended in `complete` while payment lookup and validation accepted only active `approved` commitments, leaving a valid completed commitment invisible. Payment lookup and server validation now accept terminal `complete` commitments (including legacy rows created before the activation fix) and active `approved` commitments.

Forecast Add Version now preserves a requested new version even before any lines exist. Previously the page immediately reset `?version=1` to the only persisted version, causing edits to overwrite version 0 and permanently disabling the expected workflow. The requested non-negative version is included in the selector until its first lines are saved, with a component regression test.

## Other integrity and UX corrections

- Agency-filtered common-admin reads use agency authorization instead of requiring global system access.
- Recommendation setup rejects schemas from another stream.
- Commitment, approval, user synchronization, GWCOA lookup, review-set, migration, and authorization failure modes have focused regression coverage.
- English and French messages were added for the new validation and lookup behavior.
- The stream configuration walkthrough verified budgets, commitments, amendment types/subtypes, approval templates, recommendation schemas, completion assessment schemas, cost-category lines, automated-payment prerequisites, outcome allocation, and extension migrations through the visible UI.

## Automated browser coverage

`tests/e2e/full-funding-lifecycle-ui.spec.ts` provides a serial, UI-only foundation for the repeatable journey. It signs in through the canonical route, creates an agency using the GWCOA lookup, creates and activates administrator/executor users, creates agency-scoped roles, enables their abilities, assigns both roles, signs in as the new administrator, and creates a scoped program. It captures created identifiers only from browser-observed UI requests and uses deterministic text/date input helpers. The managed clean-database run passes.

The manual Playwright validation continued beyond that automated foundation and verified: program/stream configuration; proponent and agreement creation; agreement budget and commitment completion; forecast versioning and completion; claim submission; reconciliation with separate administrator approval; and manual payment with separate administrator approval.

## Known remaining gap

Agreement amendment working copies are preserved correctly: amendment 86 retained its bilingual metadata, configured type/subtype, and edited CA$110,000 budget snapshot after reload. The application still has no amendment submission/recommendation/approval runtime or UI—the Recommendation tab explicitly remains a future-update placeholder. Consequently the walkthrough could not transition the amendment beyond Draft. This is a distinct follow-up implementation, not a persistence failure, and should be completed before describing the end-to-end amendment approval flow as production-ready.

## Verification performed

- `bun run lint`
- `bun run typecheck`
- focused unit suites for every corrected failure mode
- full unit run: 3,440 passing, one skipped; the newly added recommendation-schema component initially exposed a missing smoke-test `useAppConfig` stub, which was corrected and the component smoke suite then passed 241/241
- managed Playwright: `bun run test:e2e:light:spec tests/e2e/full-funding-lifecycle-ui.spec.ts` — passed
- sequential visible-browser walkthrough on the preserved development dataset
