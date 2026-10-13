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

`direction="auto"` keeps the portal's horizontal flow and stacks it in narrow
containers. `direction="vertical"` keeps workflows on a vertical spine. Routes
that skip nodes or would cross another route tile use bounded outside lanes.

Export SVG retains native shapes, arrows and searchable text, resolves current
theme colors, includes the title/legend, and captures the complete canvas even
when the view is scrolled. Export PNG rasterizes that same SVG at exactly four
times its CSS width and height with an opaque background. Exports are local
downloads; failures retain the diagram and show a localized retry message.
SVG uses the declared font family with system fallback when opened elsewhere.

Host checks are owned by `tooling/gcs-ssc/tests/unit/diagrams/`. Run the package
coverage gate from the host: `bun x vitest run --coverage --config vitest.diagrams.config.ts`.
