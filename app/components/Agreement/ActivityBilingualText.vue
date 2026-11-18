<script setup lang="ts">
const { english, french } = defineProps<{
  english?: string | null
  french?: string | null
}>()
</script>

<template>
  <div>
    <div v-if="english?.trim()" lang="en">
      {{ english }}
    </div>
    <hr v-if="english?.trim() && french?.trim()" class="my-1 w-8 border-default" aria-hidden="true">
    <div v-if="french?.trim()" lang="fr">
      {{ french }}
    </div>
  </div>
</template>
