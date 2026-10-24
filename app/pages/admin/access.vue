<script setup lang="ts">
definePageMeta({ middleware: 'admin-audit', i18n: { paths: { en: '/admin/access', fr: '/admin/access' } } })
</script>

<template>
  <AdminAuditLogPage kind="access" />
</template>
