<script setup lang="ts">
definePageMeta({ middleware: 'admin-audit', i18n: { paths: { en: '/admin/audit', fr: '/admin/audit' } } })
</script>

<template>
  <AdminAuditLogPage kind="events" />
</template>
