# Agency catalog with Stream assignments

  ## Summary

  Make Review Sets, Recommendation Sets, Approval Templates, Workflows, and custom-field definitions Agency-owned. Streams select the items they use. This is a cleaner long-term model for reuse, but it is a substantial migration: current publications and runtime checks assume a single owning Stream.

  Link assigns the same Agency item to another Stream. Clone creates an independent Agency item as a draft, then assigns it. Clones have new IDs and are never treated as equivalent to their source.

  ## Implementation

  - Add Agency ownership and Stream-assignment records. Preserve existing item and custom-field IDs; backfill each existing Stream item’s assignment. Migrate only Stream-scoped variants and preserve other supported scopes and immutable historical publications. Record the original Stream as provenance for migrated items, and show it alongside assigned Streams without
    presenting it as the new owner.

  - Move custom-field definitions, option IDs, and labels to the Agency catalog. Keep each Stream’s section, display order, required, and active settings on its assignment. Agreement values remain keyed by the preserved field IDs.
  - Publish Agency definitions to all assigned Streams atomically. Check each Stream first; report specific incompatibilities and leave the current published versions active if any check fails. A Workflow cannot be assigned where a field it references is unavailable; missing fields do not silently skip steps.
  - Give each Workflow assignment a Stream-specific, immutable deployment snapshot. It binds the Agency Workflow version to that Stream’s risk ratings and other local values. Convert new subtype and holdback conditions to stable Agency catalog IDs while retaining readers for historical Stream-ID publications and retries.
  - Provide an “Add existing” preview on each Stream tab. It shows the full dependency graph, including approvals inside sets, and lets an Agency Contributor choose Link or Clone per missing item. A linked parent requires its exact referenced items to be linked; a cloned parent can reference linked or newly cloned dependencies. Add the graph in one transaction. Cloned items
    remain drafts and are published in dependency order. Block conflicting active Recommendation Set or Workflow selections rather than replacing them.

  - Use the confirmed transfer_payment boundary: Agency Contributors author and publish catalog items; Program Contributors assign them to Streams; Managers handle eligible deletion or removal at their respective scopes. Program Viewers can read assigned items. No separate assignment roster or casework grant is introduced.

  ## Verification

  Test populated migration and retained runtime evidence; same-Agency sharing and cross-Agency rejection; Program and Agency grants; dependency previews and atomic adds; publication compatibility and selection conflicts; field requirements per Stream; Workflow conditions and risk-rating deployments; and runs and retries pinned to older versions. Cover the bilingual picker
  and blocker flow in a managed browser journey. Register every new core table for audit ownership and add concrete-row ownership tests. Run the repository’s lint, typecheck, unit, coverage, PostgreSQL, relevant browser, and forms:check gates.

  ## Assumptions

  Agency catalog creation and cloning require an Agency Contributor. A Program Contributor can assign existing catalog items. Agency publication reaches every assigned Stream only when all are compatible. Existing drafts remain visible for assignment but cannot run until published.
