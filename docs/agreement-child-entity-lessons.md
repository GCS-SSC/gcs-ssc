# Agreement child resources

Current contracts are maintained in the private canonical documentation:

- [Authorization and exact assignment](../tooling/gcs-ssc/architecture/auth.md).
- [Budget fiscal-year sources and read snapshots](../tooling/gcs-ssc/architecture/agreement-financial-budget-controls.md#budget-overview-and-fiscal-year-reads).
- [Stream-linked budget cost-category availability](../tooling/gcs-ssc/architecture/cost-category-availability.md).
- [Form, lookup, and editor ownership](../tooling/gcs-ssc/architecture/ui-patterns.md#createupdate-modals).
- [Required fields and validation](../tooling/gcs-ssc/architecture/required-fields.md).
- [Clean-cutover migrations](../tooling/gcs-ssc/architecture/migration-policy.md).

Child nesting does not establish a permission or assignment boundary. Each child
resolves its declared owning target under the authorization contract.
