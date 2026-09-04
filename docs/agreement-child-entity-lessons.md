# Agreement Child Entity Lessons

This note captures the implementation pattern for child resources under `Funding_Case_Agreement_Profile` so future work stays consistent.

## RBAC Contract

Agreement child entities inherit agreement permissions.

- If a user can `read` the agreement, they can read agreement child data.
- If a user can `update` the agreement, they can create, edit, delete, and load edit-time lookups for agreement child data.
- Do not introduce separate child-resource subjects for agreement subtables unless the product requirement explicitly changes.

### Required Server Pattern

For any route under `server/api/agreements/[id]/**`:

1. Resolve the parent scope with `resolveAgreementScopeContext(agreementId, db)`.
2. Return `AGREEMENT_NOT_FOUND` if the parent scope cannot be resolved.
3. Call `authorize(event, 'agreement', action, ...)`.
4. Inside the resolver, call `canAccessAgreement(context, action, agreementContext.scope, db)`.
5. Use:
   - `read` for read-only endpoints
   - `update` for create/update/delete endpoints and edit-time lookup endpoints

Examples in the codebase:

- Read: `budget-overview.get.ts`, `applicant-recipients/index.get.ts`
- Update: `budget-fiscal-years/index.post.ts`, `budget-line-items/[childId].delete.ts`, `budget-line-items/lookups/organization-cost-categories.get.ts`

## Data Source Rules

### Budget Fiscal Year options

Agreement budget fiscal year options must come from the agreement's stream budgets, not from all agency fiscal years.

- Correct source: `/api/transfer-payments/:programId/streams/:streamId/budgets`
- Use the underlying `egcs_tp_fiscalyear` as the agreement child value.
- Validate server-side that the selected fiscal year exists on that stream's budgets.

This keeps agreement budgets aligned with stream configuration.

### Budget line item options

Budget line item options come from the agreement's agency cost-category line items, but the endpoint still authorizes using agreement `update`.

## UI Lessons

### Do not send empty query params unless the route expects them

Avoid query objects like:

```ts
query: {
  page: 1,
  limit: 25,
  search: ''
}
```

This can serialize to `?search` and has already caused lookup issues in this repo. Omit optional params unless they are needed.

### Respect shared pagination constraints

`PaginationSchema.limit` is capped at `100`.

- Do not request `limit: 200` from lookup endpoints that use `PaginationSchema`.
- The agreement budget lookup requests should stay at `limit: 100` or lower.

### Avoid eager validation noise in modal forms

For agreement child modals, use:

```vue
<UForm :validate-on="[]" />
```

This prevents unrelated validation errors from showing just because the user opened a select or focused a field.

### Error message gotcha

Do not reuse generic ID-required validation messages for lookup selections if that message maps to a domain-specific label like "Financial System ID is required".

Agreement child selection schemas should use normal required-field messaging, not specialized ID messaging.

## Migration Lessons

Agreement child tables were added to existing compacted migration `0009_funding_case_agreement.ts`.

That is acceptable in this project, but it has a dev-environment consequence:

- if a local PGlite database already recorded `0009` as applied before the new tables existed, editing `0009` will not backfill those tables automatically
- the code and the local database can drift even though migration history says everything is up to date

If you hit missing-table errors after editing an existing migration:

- preferred local fix: restart from a clean dev database with `bun run dev:clean`
- if preserving local seeded/manual state is important, patch the local DB carefully and then restart the dev server

## Recommended Checklist For New Agreement Subtables

1. Add tables to `0009_funding_case_agreement.ts`.
2. Add DB typings in `shared/types/database.d.ts`.
3. Add Zod schemas and UI row/form types.
4. Build server routes under `server/api/agreements/[id]/...`.
5. Reuse `resolveAgreementScopeContext` + `canAccessAgreement`.
6. Keep child reads on agreement `read`.
7. Keep child mutations and edit-time lookups on agreement `update`.
8. Source lookup/reference data from the real parent business source, not the nearest convenient table.
9. Add unit tests for:
   - auth action used by the route
   - business validation
   - lookup wiring
10. Verify in the browser against a real seeded agreement page.

## Verified Current State

As of this note:

- agreement applicant recipients follow agreement-scoped RBAC
- agreement budget fiscal years follow agreement-scoped RBAC
- agreement budget line items follow agreement-scoped RBAC
- budget overview uses agreement `read`
- agreement child edit-time lookups use agreement `update`
