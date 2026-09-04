<script setup lang="ts">
import type { ExtensionCreateActionItem } from '~~/shared/types/schemas/extensions'
import { getGcsExtensionComponent } from '#gcs-extensions/registry'

const { item } = defineProps<{
  item?: ExtensionCreateActionItem
}>()

const emit = defineEmits<{
  created: []
}>()

const extensionComponent = computed(() => item ? getGcsExtensionComponent(item.componentName) : null)

const onCreated = () => {
  emit('created')
}
</script>

<template>
  <component
    :is="extensionComponent"
    v-if="item && extensionComponent"
    :extension-key="item.extensionKey"
    :operation="item.operation"
    :context="item.context"
    :agency-id="item.context.agencyId"
    :stream-id="item.context.streamId"
    :agreement-id="item.context.agreementId"
    :label="item.label"
    :icon="item.icon"
    :mode="item.mode"
    :config="item.config"
    :rbac="item.rbac"
    :on-created="onCreated" />
</template>
