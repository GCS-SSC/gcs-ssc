<script setup lang="ts">
import type { NuxtError } from '#app'

const { t, locale } = useI18n()
const localePath = useLocalePath()

const { error } = defineProps<{
  error: NuxtError
}>()

const isNotFound = computed(() => error.statusCode === 404)
const statusMessage = computed(() => isNotFound.value
  ? t('error_page.not_found_title')
  : error.statusMessage || t('common.error'))
const message = computed(() => isNotFound.value
  ? t('error_page.not_found_description')
  : error.message)

useSeoMeta({
  title: t('common.error'),
  description: t('common.error')
})

useHead({
  htmlAttrs: {
    lang: locale.value
  }
})
</script>

<template>
  <UApp>
    <UError
      :error="error"
      :redirect="localePath('/')"
      :clear="{ label: t('error_page.return_home') }">
      <template #statusMessage>
        {{ statusMessage }}
      </template>
      <template #message>
        {{ message }}
      </template>
    </UError>
  </UApp>
</template>
