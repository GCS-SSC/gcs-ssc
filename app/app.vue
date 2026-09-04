<script setup lang="ts">
import * as locales from '@nuxt/ui/locale'

const { locale } = useI18n()

const uiLocale = computed(() => {
  const localeMap: Record<string, typeof locales.en> = {
    en: {
      ...locales.en,
      code: 'en-CA'
    },
    fr: {
      ...locales.fr,
      code: 'fr-CA'
    }
  }

  if (locale.value === 'fr') {
    return localeMap.fr
  }

  return localeMap.en
})

const colorMode = useColorMode()

const color = computed(() => (colorMode.value === 'dark' ? '#1b1718' : 'white'))

useHead({
  meta: [
    { charset: 'utf-8' },
    { name: 'viewport', content: 'width=device-width, initial-scale=1' },
    { key: 'theme-color', name: 'theme-color', content: color }
  ],
  link: [{ rel: 'icon', href: '/favicon.ico' }],
  htmlAttrs: {
    lang: computed(() => locale.value)
  }
})

const title = 'GCS-SSC'
const description = computed(() =>
  locale.value === 'fr' ? 'Système de subventions et de contributions' : 'Grants and Contributions System'
)

useSeoMeta({
  title,
  description,
  ogTitle: title,
  ogDescription: description,
  ogImage: 'https://ui.nuxt.com/assets/templates/nuxt/dashboard-light.png',
  twitterImage: 'https://ui.nuxt.com/assets/templates/nuxt/dashboard-light.png',
  twitterCard: 'summary_large_image'
})
</script>

<template>
  <UApp :locale="uiLocale">
    <NuxtLoadingIndicator />

    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
