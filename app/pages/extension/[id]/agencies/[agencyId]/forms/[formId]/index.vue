<script setup lang="ts">
definePageMeta({ key: route => route.path, i18n: { paths: {
  en: '/extension/[id]/agencies/[agencyId]/forms/[formId]',
  fr: '/extension/[id]/agences/[agencyId]/formulaires/[formId]'
} } })
</script>

<template>
  <ExtensionsAgencyFormPage />
</template>
