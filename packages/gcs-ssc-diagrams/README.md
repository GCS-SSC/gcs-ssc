# @gcs-ssc/diagrams

Host-owned Vue flow diagrams. The package owns responsive layout, measured SVG
connections, decision shapes, selection semantics, print styles and exports. It
has no dependency on surveys, workflow execution, Nuxt or host translation catalogs.

Host pages use `CommonFlowDiagram`; extensions use `ExtensionFlowDiagram` and
the `FlowDiagramDefinition` type from `@gcs-ssc/extensions/ui` (SDK 0.3.14).
Callers provide localized display content and translate their domain definitions
into ordered nodes and explicit routes. The host adapter supplies bilingual
renderer controls and connection legend labels.

```vue
<script setup lang="ts">
import { ExtensionFlowDiagram } from '@gcs-ssc/extensions/ui'
import type { FlowDiagramDefinition } from '@gcs-ssc/extensions/ui'

const definition: FlowDiagramDefinition = {
  title: 'Application flow',
  nodes: [
    { id: 'start', kind: 'start', title: 'Start',
      routes: [{ targetId: 'details', kind: 'direct' }] },
    { id: 'details', kind: 'step', title: 'Project details',
      selectLabel: 'Edit project details',
      routes: [{ targetId: 'end', kind: 'direct' }] },
    { id: 'end', kind: 'end', title: 'Submit' }
  ]
}
</script>

<template>
  <ExtensionFlowDiagram :definition="definition" filename="application-flow"
    @select-node="openEditor($event)" />
</template>
```

Node kinds are `start`, `step`, `decision` and `end`. Route kinds are `direct`,
`conditional`, `default` and `failure`. IDs must be unique; every route targets a
node ID. Optional `eyebrow`, `lines`, route `label`/`detail`/`targetLabel`,
description, statistics and order/hint text are already-localized plain text.
Only nodes with `selectLabel` render as buttons and emit `select-node`; the
optional `selectedNodeId` identifies the current step. Text is escaped by Vue
and the SVG serializer.

The host adapter and renderer also support opt-in `editable` controls. The add-first control
emits `add-node` with no argument for either an empty or populated graph; each non-end node's insertion control emits
`add-node` with its ID, and its branch control emits `add-branch` with its ID.
Callers own all graph mutations. `branchNodeIds` restricts branch controls to the
listed IDs; omitted permits all nodes, while an empty list disables every branch
control. Renderer consumers provide optional localized `addNode`, `addBranch`
and `addFirstNode` labels; host consumers receive host translations. These controls
are absent by default and excluded from exports. Editing is currently host-only;
the extension SDK's read-only component contract is unchanged.

`direction="auto"` keeps the portal's horizontal flow and stacks it in narrow
containers. `direction="vertical"` keeps workflows on a vertical spine. Routes
that skip nodes or would cross another route tile use bounded outside lanes.

Host callers can opt into `layout="branches"` for a fixed top-to-bottom graph.
Alternative paths occupy separate columns, with their route labels above the
receiving cards, and shared successors appear once below their incoming paths.
Sibling cards stay aligned even when branch labels wrap. The graph uses stable
longest-path rows and non-overlapping columns; nested branches, uneven paths and
disconnected draft nodes remain visible. Skipping routes use outside rails to
avoid intervening cards. Cyclic malformed drafts are retained on additional rows
with outside routes, rather than disappearing. Narrow containers scroll
horizontally without collapsing parallel paths or enabling free dragging.
Selection, editing and full-canvas exports use the same renderer contracts.
Both layouts share a bordered, theme-aware dotted canvas surface and thin accent-color
scrollbars. Guided Help bounds its viewport for two-direction panning; ordered diagrams grow to fit their content and use the main page scroll. SVG and PNG export controls stay
in the canvas toolbar in both normal and full-window modes. Optional host-localized
`zoomOut`, `resetZoom` and `zoomIn` labels enable a compact toolbar: 25% steps from
25–200%, starting at 100%. The displayed percentage resets to 100%. Zoom keeps the
viewport's focal point where scroll boundaries allow, and scales cards and connectors
together. The controls and surface grid are excluded from exports; SVG geometry and
4× PNG dimensions always use the complete canvas at 100%, regardless of zoom or pan.
Optional `enterFullscreen` and `exitFullscreen` labels add a full-window workspace.
Zoom, exports and authoring remain available; step and branch dialogs stay above the
canvas. Escape closes an open dialog first, then exits the workspace. Keyboard focus
stays within the canvas controls while full-window mode is active, and exit restores
the previous focus and page scrolling. Terminal icons and titles share one horizontal line.
`layout="ordered"` is the default and preserves the existing workflow/portal
node arrangement and responsive behavior, with the same toolbar, zoom and full-window controls. This layout option is host-only; the extension
SDK component remains unchanged.

Export SVG retains native shapes, arrows and searchable text, resolves current
theme colors, includes the title/legend, and captures the complete canvas even
when the view is scrolled. Export PNG rasterizes that same SVG at exactly four
times its CSS width and height with an opaque background. Exports are local
downloads; failures retain the diagram and show a localized retry message.
SVG uses the declared font family with system fallback when opened elsewhere.

Host checks are owned by `tooling/gcs-ssc/tests/unit/diagrams/`. Run the package
coverage gate from the host: `bun x vitest run --coverage --config vitest.diagrams.config.ts`.
