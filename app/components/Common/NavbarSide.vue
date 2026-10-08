<script setup lang="ts">
const { t, locale } = useI18n()
const switchLocalePath = useSwitchLocalePath()
const isFrench = computed(() => locale.value === 'fr')
const colorMode = useColorMode()
const isDark = computed(() => colorMode.value === 'dark')
const themeToggleLabel = computed(() => t(isDark.value ? 'nav.switch_to_light_mode' : 'nav.switch_to_dark_mode'))

const onThemeToggle = () => {
  colorMode.preference = isDark.value ? 'light' : 'dark'
}

const onLocaleToggle = (value: boolean | 'indeterminate') => {
  const nextLocale = value === true ? 'fr' : 'en'
  navigateTo(switchLocalePath(nextLocale))
}
</script>

<template>
  <div class="mr-2 flex items-center gap-3">
    <UButton
      :icon="isDark ? 'i-lucide-sun' : 'i-lucide-moon'"
      :aria-label="themeToggleLabel"
      :title="themeToggleLabel"
      color="neutral"
      variant="ghost"
      type="button"
      @click="onThemeToggle" />
    <div
      class="border-default flex items-center gap-2 rounded-lg border bg-zinc-100 px-2 py-1 shadow-sm dark:bg-zinc-800/50">
      <span
        class="text-xs font-black tracking-widest uppercase"
        :class="!isFrench ? 'text-primary' : 'text-zinc-400'">
        EN
      </span>
      <USwitch
        :model-value="isFrench"
        :aria-label="t('nav.language_toggle')"
        size="sm"
        color="primary"
        class="scale-90"
        @update:model-value="onLocaleToggle" />
      <span
        class="text-xs font-black tracking-widest uppercase"
        :class="isFrench ? 'text-primary' : 'text-zinc-400'">
        FR
      </span>
    </div>
  </div>
</template>
