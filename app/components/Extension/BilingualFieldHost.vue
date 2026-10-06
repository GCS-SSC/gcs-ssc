<script setup lang="ts">
import type { GcsBilingualFieldExtensionContext } from '@gcs-ssc/extensions'
import type { BilingualFieldScope } from '~/utils/bilingual-field-context'

const { context, scope } = defineProps<{
  context: GcsBilingualFieldExtensionContext
  scope: BilingualFieldScope
}>()
</script>

<template>
  <ExtensionSlotHost
    slot-name="bilingual-field.after"
    :subject="scope.subject"
    :agency-id="scope.agencyId"
    :stream-id="scope.streamId"
    :permission-action="scope.permissionAction"
    :context="context" />
</template>
