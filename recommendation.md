# First-Class Recommendation Workflow

## Summary

Implement recommendations as a polymorphic activity available to the same target entity types as review sets. Recommendation setups control manual, bulk, and optional review-driven creation. Recommendations have their own lifecycle, configurable bilingual results, optional approvals, retry history, and entity-wide concurrency and final-success guarantees.

Automatic policies link to one review-set setup, cover every member, AND all required results together, and evaluate atomically when the corresponding runtime review set successfully finishes.

## Data Model and Shared Contracts

- Modify the existing common polymorphic migration and Kysely types directly.
- Add dedicated enums:
  - Recommendation status: `eligible`, `draft`, `pendingapproval`, `complete`, `approved`, `denied`, `cancelled`.
  - Canonical result: `recommended`, `recommended_with_considerations`, `not_recommended`.
  - Policy action: `mark_eligible`, `create_draft`.
- Align recommendation target types exactly with the shared review-set target types.
- Add an immutable, user-hidden `id` to every assessment scoring-matrix band:
  - Generate it once with `nanoid()` when a band is created.
  - Preserve it across editing, saving, publication, cloning, and runtime schema snapshots.
  - Never regenerate an ID when loading or reordering existing bands.
  - Keep the existing editor-only `_key` separate; `_key` remains transient and is stripped before persistence.
  - Accept missing IDs only at the server normalization boundary for newly submitted bands, generating them before validation and persistence.
  - Require non-empty, unique IDs within each scoring matrix.
  - Do not render or expose the ID as an editable form field.
  - Generate seed band IDs and reuse the generated values when seeding policies; do not derive policy identity from translated labels, array positions, colours, or score boundaries.
- Continue displaying bilingual scoring-band labels and evaluate scores against the pinned review-schema version using the existing first-`score <= max` rule. Recommendation policies store only the hidden band ID.
- Version recommendation form schemas using the same immutable published-version pattern as review schemas. Pin a published recommendation-schema version when an eligible row or draft is created.
- Extend `Common_Recommendation_Setup` with:
  - `manual_allowed` and `bulk_allowed`.
  - Optional linked review-set setup.
  - Optional policy action.
  - Optional approval template, validated for the `commonrecommendation` execution entity.
  - Constraints requiring the linked set and action together, at least one creation path, and matching linked-set scope and target type.
  - Retain one active recommendation setup per scope and target entity type.
- Add normalized setup result options with a stable internal key, custom `_en`/`_fr` labels, and canonical result mapping. Require at least one option and unique keys and labels; multiple labels may map to the same canonical category.
- Add one normalized policy condition for every active member of the linked review-set setup:
  - Checklist member: exactly one required `pass`, `pass_with_considerations`, or `fail`.
  - Assessment member: exactly one required hidden overall scoring-band ID.
  - Reject incomplete policies, subtype mismatches, foreign members, duplicate conditions, and removal of referenced members or bands while an active policy depends on them.
- Rebuild `Common_Recommendation` as a registered `commonrecommendation` runtime entity so routing slips can attach to it. Store status, target entity, setup, pinned schema version, selected result option, canonical result, and schema-driven response.
- Remove the legacy numeric recommendation result and recommendation-schema result JSON.
- Add one partial unique target index covering:
  - Active rows: `eligible`, `draft`, or `pendingapproval`.
  - Final positive rows: `complete` without approval or `approved` with approval, with canonical result `recommended` or `recommended_with_considerations`.
- Preserve retryable terminal rows as immutable history and continue using `_deleted` soft deletion.
- Do not add source-review links, creation origin, bulk-run records, selection rationale, or other provenance fields.

## Setup, Policy, and Runtime Services

- Extend recommendation setup CRUD to manage flags, linked review set, policy action, all member conditions, result options, and approval template in one transaction.
- Hydrate linked review sets and members through server-backed lookups. Assessment lookups return published overall scoring bands as `{ id, label, max, indicator }`; the ID is used internally as the control value but is not displayed.
- Centralize policy evaluation:
  - Run only when the linked runtime review set transitions to its successful final state.
  - Require every configured review-set member to have a latest successful runtime attempt.
  - Resolve checklist results from `Common_Checklist`.
  - Resolve an assessment band ID from its persisted score and pinned schema version.
  - Require exact matches for all conditions.
- Invoke evaluation inside the same transaction that finalizes the review-set status. Do not rely on post-commit hooks.
- On a match, idempotently create either an `eligible` recommendation or a `draft`.
- Because no provenance or watermark is stored, automatic generation is edge-triggered by the successful review-set transition. An old completed review set is not replayed to generate retries.
- Implement one target-locking creation service used by automatic, eligible-spawn, manual, bulk, and retry operations. Recheck setup validity, active conflicts, and permanent-success conflicts under lock.
- Manual and bulk creation ignore the local review policy and require only their respective setup flags. Converting an automatically created `eligible` row to `draft` does not require `manual_allowed`.
- Bulk creation accepts a setup and explicit target IDs, authorizes and processes each independently, and returns per-target created, conflict, or error results without persisting a batch record.
- Lifecycle:
  - `eligible -> draft`.
  - Save edits only while `draft`.
  - Submit requires a valid response and configured result.
  - Without approval: `draft -> complete`.
  - With approval: `draft -> pendingapproval -> approved | denied`.
  - Authorized cancellation: `eligible | draft -> cancelled`.
  - Terminal rows are immutable.
- Retry creates a fresh draft using the same active setup and its current published schema version. Permit retry after:
  - Any `denied` recommendation.
  - Any `cancelled` recommendation.
  - A `complete` or `approved` `not_recommended` recommendation.
- Reject retry after a final positive result or while another active recommendation exists.
- Extend common approval resolution for `commonrecommendation`; materialize its routing slip on submission and project approval outcomes back to recommendation `approved` or `denied`.

## APIs and UI

- Add authorized generic activity routes to:
  - List recommendations and applicable setups by `entityType + entityId`.
  - Create one manual recommendation.
  - Create recommendations in bulk from explicit target IDs.
  - Read and save by recommendation ID.
  - Spawn an eligible recommendation, submit, cancel, and retry.
- Resolve authorization through the owning target entity:
  - Entity `read` for list and detail.
  - Entity `update` for create, bulk create, save, spawn, cancel, and retry.
  - Existing assigned-approver rules for approval actions.
- Add a reusable recommendations section or tab to all review-capable entity screens, including agreements and supported agreement activities.
- Show current and historical recommendations with bilingual setup and result labels, lifecycle badges, manual Add, eligible Spawn, retry, and detail actions.
- Add a schema-driven recommendation detail page with the response form, result selection, `CommonSaveButton`, submit and cancel actions, and common approval UI.
- Extend the setup UI with:
  - Manual and bulk toggles.
  - Optional policy and eligible-versus-auto-draft action.
  - Linked review-set lookup.
  - One generated condition control for every ordered member.
  - Assessment band selects displaying only localized labels while binding hidden band IDs.
  - Bilingual result-label editor with canonical-result selection.
  - `commonrecommendation` approval-template lookup.
- Add all new user-facing labels, statuses, errors, and result categories in English and French.

## Test Plan

- Test scoring-band identity generation, uniqueness, hidden UI behavior, preservation through reorder, edit, publish, and clone, and separation from transient `_key`.
- Test that policy matching remains stable after bilingual label, colour, order, or maximum-score edits when the same band ID is retained.
- Test schema normalization rejects duplicate IDs and generates IDs only for genuinely new bands.
- Add migration and schema tests for policy completeness, subtype validation, bilingual result options, setup scoping, target-type parity, and soft deletion.
- Add policy tests covering every checklist result, assessment band boundaries, all-member AND behavior, pinned schema versions, nonterminal sets, failed conditions, and concurrent or idempotent completion.
- Add runtime tests for manual and bulk flags, policy-independent creation, eligible spawning, one-active enforcement, permanent positive-result locking, all permitted retries, cancellation, terminal immutability, and race conflicts.
- Add approval tests for `commonrecommendation` routing-slip materialization and approved or denied projection.
- Add route authorization tests for every supported target resolver.
- Add component tests confirming assessment schema 12 displays `Compliant`, `Conditionally Compliant`, and `Non-Compliant` without exposing their internal IDs.
- Add E2E coverage for eligible and auto-draft policies, failed conditions, manual and bulk creation, retries, and permanent positive-result locking.
- Run lint, typecheck, unit tests, coverage at 80% or higher, and targeted recommendation and review lifecycle Playwright tests.

## Assumptions

- A successful review set is the existing successful aggregate terminal state reached after every configured member completes or receives approval.
- Every linked review-set member has exactly one expected result; policies do not support partial sets, OR branches, numeric expressions, or arbitrary rule builders.
- `recommended` and `recommended_with_considerations` are both positive final outcomes.
- Manual and bulk creation are independent of automatic policies.
- A positive `complete` result without approval is as final as a positive `approved` result.
- No top-z algorithm is implemented; bulk callers provide explicit target IDs.
- No provenance, source-review instance, bulk-run, or manual-creation reason is retained.
