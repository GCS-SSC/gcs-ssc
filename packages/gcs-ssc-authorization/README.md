# @gcs-ssc/authorization

Internal authorization boundary for GCS-SSC. Authentication, H3 error responses,
and business-resource loading remain host concerns; authorization vocabulary,
policy evaluation, and authorization-specific repositories live here.

## Structure

- `src/actions.ts` and `src/abilities.ts`: shared CRUD action and subject vocabulary.
- `src/scopes.ts` and `src/role-scopes.ts`: hierarchical RBAC scope policy.
- `src/grants.ts` and `src/decisions.ts`: static/exact grants and pure evaluation.
- `src/owners.ts`: discriminated Agreement, Proponent, program stream, and agency runtime ownership.
- `src/server/static-authorization.ts`: cumulative role-permission repository and CRUD expansion.
- `src/server/assigned-items.ts`: exact assigned-item repository and service.
- `src/server/approval-items.ts`: read-only exact approval-assignment repository.
- `src/server/lock-order.ts`: canonical ordering for authorization lock targets.

Use `@gcs-ssc/authorization` for pure policy and contracts. Use
`@gcs-ssc/authorization/server` only in server code. The legacy modules under
`shared/utils` and `server/utils/rbac` are compatibility adapters.

## Model

Authorization combines these explicit gates within one security system:

- cumulative role levels produce scoped CRUD ceilings;
- exact item assignments provide the mandatory second key for existing-record mutations;
- `manage_assignments` independently authorizes roster-only management projections;
- approval assignments remain exact approval grants.

Callers must name an exact target as `{ entityType, entityId }`. Authorization
code must not infer security targets from URL paths, route parameter names, or
component structure. Ordinary reads require Viewer at the resolved owner scope;
an item assignment never raises that ceiling. Approval assignments remain the
explicit exception for approval-specific reads and actions. Work policies must
require both the action-appropriate role level and the exact work target's
assignment.

Protected writes re-resolve grants inside the caller's transaction after the
host locks the caller and every managed user as one ordered principal set. The
lock covers each principal's complete active role-permission graph; management
routes must not acquire those rows again later in the transaction.
`ExactAuthorizationService.canFresh` and the host's
`authorizeFreshAssignedTarget` make the fresh-read distinction explicit.
