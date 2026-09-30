<script setup lang="ts">
import type { SubmittedAnswer } from '~/utils/submitted-application'

defineProps<{ answer: SubmittedAnswer }>()
const { t } = useI18n()
</script>

<template>
  <div class="min-w-0">
    <template v-if="answer.children">
      <h4 class="mb-3 text-sm font-semibold text-highlighted">
        {{ answer.label }}
      </h4>
      <div v-if="answer.children.length" class="space-y-5 border-l-2 border-default pl-4 sm:pl-5">
        <Answer v-for="(child, index) in answer.children" :key="index" :answer="child" />
      </div>
      <p v-else class="text-sm text-muted">
        {{ t('submitted_application.none') }}
      </p>
    </template>
    <template v-else-if="answer.columns">
      <div role="region" :aria-label="answer.label" tabindex="0" class="overflow-x-auto rounded-md border border-default focus-visible:outline-2 focus-visible:outline-primary">
        <table class="w-full text-left text-sm">
          <caption class="px-4 py-3 text-left font-semibold text-highlighted">
            {{ answer.label }}
          </caption>
          <thead class="bg-elevated/60">
            <tr>
              <th v-for="(column, index) in answer.columns" :key="index" scope="col" class="px-4 py-3 font-medium whitespace-nowrap">
                {{ column }}
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-default">
            <tr v-for="(row, index) in answer.rows" :key="index">
              <td v-for="(cell, cellIndex) in row" :key="cellIndex" class="px-4 py-3 whitespace-pre-wrap">
                {{ cell || t('submitted_application.none') }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
    <dl v-else>
      <dt class="text-sm font-medium text-muted">
        {{ answer.label }}
      </dt>
      <dd class="mt-1 whitespace-pre-wrap leading-relaxed text-default [overflow-wrap:anywhere]">
        {{ answer.text || t('submitted_application.none') }}
      </dd>
    </dl>
  </div>
</template>
