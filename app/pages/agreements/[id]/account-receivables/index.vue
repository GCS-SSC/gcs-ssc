<script setup lang="ts">
import { appRouteLocations } from '~/utils/route-locations'

definePageMeta({ i18n: { paths: { en: '/agreements/[id]/account-receivables', fr: '/ententes/[id]/comptes-debiteurs' } } })
const route = useRoute()
const localePath = useLocalePath()
await navigateTo(localePath(appRouteLocations.agreementAccountReceivableCollection(String(route.params.id))), { replace: true })
</script>

<template>
  <div />
</template>
