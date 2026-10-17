<script setup lang="ts">
definePageMeta({ key: route => route.path, i18n: { paths: {
  en: '/extension/[id]/agencies/[agencyId]/forms/[formId]/flow',
  fr: '/extension/[id]/agences/[agencyId]/formulaires/[formId]/parcours'
} } })
</script>

<template>
  <ExtensionsAgencyFormPage flow-only />
</template>
