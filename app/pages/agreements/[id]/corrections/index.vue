<script setup lang="ts">
import { appRouteLocations } from '~/utils/route-locations'

definePageMeta({
  key: route => route.path,
  i18n: { paths: {
    en: '/agreements/[id]/corrections', fr: '/ententes/[id]/corrections'
  } },
  middleware: to => {
    const localePath = useLocalePath()
    return navigateTo(localePath(appRouteLocations.agreementCorrectionCollection(String(to.params.id))), { replace: true })
  }
})
</script>

<template>
  <div />
</template>
