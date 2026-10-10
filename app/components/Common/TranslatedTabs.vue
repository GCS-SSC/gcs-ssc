<script setup lang="ts">
import { computed, nextTick, onMounted, onUpdated, ref, useId } from 'vue'
import type { ComponentPublicInstance, Ref } from 'vue'
import type { TranslatedTabItem } from '~~/shared/types/ui'

const {
  items,
  variant = 'link',
  size = 'sm',
  orientation = 'vertical',
  content = false,
  mobileCollapsible = true,
  mobileAutoCloseOnSelect = true,
  externalPanelId,
  ui
} = defineProps<{
  items: TranslatedTabItem[]
  variant?: 'link' | 'pill'
  size?: 'xs' | 'sm' | 'md' | 'lg'
  orientation?: 'horizontal' | 'vertical'
  content?: boolean
  mobileCollapsible?: boolean
  mobileAutoCloseOnSelect?: boolean
  externalPanelId?: string
  ui?: Record<string, string>
}>()

const modelValue = defineModel<string>({ required: true })

const { t } = useI18n()

const translatedItems = computed(() =>
  items.map(item => ({
    ...item,
    label: item.label ?? t(item.key)
  }))
)
// Nuxt UI keys triggers by array index. Remount when ordered values change so
// Reka's roving-focus collection stays paired with their visible triggers.
const itemsIdentity = computed(() => translatedItems.value.map(item => item.value).join('\u0000'))

const isMobileExpanded = ref(false)
const mobileToggleContainer: Ref<HTMLElement | null> = ref(null)
const mobilePanelId = `translated-tabs-mobile-panel-${useId()}`
const mobileTabs = ref<ComponentPublicInstance | null>(null)
const desktopTabs = ref<ComponentPublicInstance | null>(null)
const inlineTabs = ref<ComponentPublicInstance | null>(null)
const nativePanelIds = new WeakMap<HTMLElement, string | null>()

/** Associates content-free Nuxt tab triggers with the owner's rendered section.
 * @returns Resolves after Nuxt UI has rendered the triggers.
 */
const associateExternalPanel = async () => {
  await nextTick()
  for (const tabs of [mobileTabs.value, desktopTabs.value, inlineTabs.value]) {
    const triggers = (tabs as { triggersRef?: ComponentPublicInstance[] } | null)?.triggersRef ?? []
    for (const [index, trigger] of triggers.entries()) {
      const element = trigger?.$el
      if (!(element instanceof HTMLElement)) continue
      const panelId = content ? undefined : translatedItems.value[index]?.panelId ?? externalPanelId
      if (panelId) {
        if (!nativePanelIds.has(element)) nativePanelIds.set(element, element.getAttribute('aria-controls'))
        element.setAttribute('aria-controls', panelId)
      } else if (nativePanelIds.has(element)) {
        const nativeId = nativePanelIds.get(element)
        if (nativeId) element.setAttribute('aria-controls', nativeId)
        else element.removeAttribute('aria-controls')
        nativePanelIds.delete(element)
      }
    }
  }
}
onMounted(() => {
  void associateExternalPanel()
})
onUpdated(() => {
  void associateExternalPanel()
})

const selectedItem = computed(() => {
  const matched = translatedItems.value.find(item => item.value === modelValue.value)
  if (matched) {
    return matched
  }

  return translatedItems.value[0]
})

const toggleMobileTabs = () => {
  isMobileExpanded.value = !isMobileExpanded.value
}

/** Collapses the mobile list and restores focus after keyboard activation settles. */
const closeMobileTabs = async () => {
  if (!mobileAutoCloseOnSelect) return
  isMobileExpanded.value = false
  await nextTick()
  await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  mobileToggleContainer.value?.querySelector<HTMLButtonElement>('button')?.focus()
}

/**
 * Updates the selected tab from mobile list interactions.
 *
 * @param value Selected tab value emitted by UTabs.
 */
const onMobileTabUpdate = async (value: string | number) => {
  modelValue.value = value.toString()
  await closeMobileTabs()
}

/**
 * Closes link-backed mobile tabs, which navigate without emitting a model update.
 *
 * @param event The click activation bubbling from a tab trigger.
 */
const onMobilePanelClick = async (event: MouseEvent) => {
  if (!(event.target instanceof HTMLElement) || !event.target.closest('[role="tab"]')) return
  await closeMobileTabs()
}
</script>

<template>
  <div v-if="mobileCollapsible && orientation === 'vertical'" class="w-full">
    <div ref="mobileToggleContainer" class="lg:hidden">
      <UButton
        variant="outline"
        color="neutral"
        class="w-full justify-between"
        :aria-label="`${t('common.toggle_navigation')}: ${selectedItem?.label ?? ''}`"
        :aria-expanded="isMobileExpanded"
        :aria-controls="mobilePanelId"
        @click="toggleMobileTabs">
        <span class="flex items-center gap-2 truncate">
          <UIcon v-if="selectedItem?.icon" :name="selectedItem.icon" class="size-4" />
          <span class="truncate">{{ selectedItem?.label }}</span>
        </span>
        <UIcon :name="isMobileExpanded ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" class="size-4" />
      </UButton>

      <div v-if="isMobileExpanded" :id="mobilePanelId" class="mt-3" @click.capture="onMobilePanelClick">
        <UTabs
          ref="mobileTabs"
          :key="itemsIdentity"
          activation-mode="manual"
          :model-value="modelValue"
          :items="translatedItems"
          :variant="variant"
          :size="size"
          :orientation="orientation"
          :content="content"
          :ui="ui"
          @update:model-value="onMobileTabUpdate">
          <template #leading="{ item }">
            <UIcon v-if="item.icon" :name="item.icon" class="mr-2 size-4" />
          </template>
          <template #default="{ item }">
            <span class="block whitespace-normal break-words text-left leading-5">{{ item.label }}</span>
          </template>
        </UTabs>
      </div>
    </div>

    <div class="hidden lg:block">
      <UTabs
        ref="desktopTabs"
        :key="itemsIdentity"
        v-model="modelValue"
        activation-mode="manual"
        :items="translatedItems"
        :variant="variant"
        :size="size"
        :orientation="orientation"
        :content="content"
        :ui="ui">
        <template #leading="{ item }">
          <UIcon v-if="item.icon" :name="item.icon" class="mr-2 size-4" />
        </template>
        <template #default="{ item }">
          <span class="block whitespace-normal break-words text-left leading-5">{{ item.label }}</span>
        </template>
      </UTabs>
    </div>
  </div>

  <UTabs
    v-else
    ref="inlineTabs"
    :key="itemsIdentity"
    v-model="modelValue"
    activation-mode="manual"
    :items="translatedItems"
    :variant="variant"
    :size="size"
    :orientation="orientation"
    :content="content"
    :ui="ui">
    <template #leading="{ item }">
      <UIcon v-if="item.icon" :name="item.icon" class="mr-2 size-4" />
    </template>
    <template #default="{ item }">
      <span class="block whitespace-normal break-words text-left leading-5">{{ item.label }}</span>
    </template>
  </UTabs>
</template>
