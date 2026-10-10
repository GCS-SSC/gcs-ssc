<script setup lang="ts">
import CommonSubmittedAnswer from './Answer.vue'
import { readSubmittedApplication } from '~/utils/submitted-application'

const { snapshot, externalSourceId = null, showHeader = true } = defineProps<{
  snapshot: unknown
  externalSourceId?: string | null
  showHeader?: boolean
}>()
const { t, locale } = useI18n()
const document = computed(() => readSubmittedApplication(snapshot, locale.value, t))
const submittedAt = computed(() => {
  const value = new Date(document.value.submittedAt)
  return Number.isNaN(value.getTime()) ? document.value.submittedAt : new Intl.DateTimeFormat(locale.value, { dateStyle: 'long', timeStyle: 'short' }).format(value)
})
</script>

<template>
  <CommonPreActionReport :title="t('submitted_application.title')" :description="t('submitted_application.intro')" :show-header="showHeader" data-testid="submitted-application">
    <template #action>
      <UBadge color="neutral" variant="subtle" icon="i-lucide-lock-keyhole" :label="t('submitted_application.read_only')" />
    </template>
    <template #notices>
      <dl v-if="externalSourceId || document.submittedAt" class="flex flex-wrap gap-x-10 gap-y-3 border-y border-default py-4 text-sm">
        <div v-if="externalSourceId">
          <dt class="text-muted">
            {{ t('funding_case_intake.external_source_id') }}
          </dt><dd class="mt-1 font-medium text-highlighted">
            {{ externalSourceId }}
          </dd>
        </div>
        <div v-if="document.submittedAt">
          <dt class="text-muted">
            {{ t('submitted_application.submitted_at') }}
          </dt><dd class="mt-1 font-medium text-highlighted">
            {{ submittedAt }}
          </dd>
        </div>
      </dl>
    </template>
    <div v-if="!document.forms.length" class="flex flex-col items-center gap-3 rounded-lg border border-dashed border-default px-6 py-12 text-center">
      <UIcon name="i-lucide-file-text" class="size-8 text-muted" />
      <h3 class="font-semibold text-highlighted">
        {{ t('submitted_application.empty_title') }}
      </h3>
      <p class="max-w-md text-sm text-muted">
        {{ t('submitted_application.empty_description') }}
      </p>
    </div>
    <article v-for="(form, formIndex) in document.forms" :key="formIndex" class="min-w-0 space-y-8">
      <header>
        <p class="mb-2 text-xs font-medium tracking-wide text-muted uppercase">
          {{ t('submitted_application.form') }} {{ formIndex + 1 }} / {{ document.forms.length }}
        </p>
        <h3 class="text-xl font-semibold text-highlighted [overflow-wrap:anywhere]">
          {{ form.title }}
        </h3>
        <p v-if="form.description" class="mt-2 max-w-3xl whitespace-pre-wrap text-sm leading-relaxed text-muted">
          {{ form.description }}
        </p>
      </header>
      <p v-if="!form.sections.length" class="text-sm text-muted">
        {{ t('submitted_application.no_answers') }}
      </p>
      <nav v-if="form.sections.length > 1" :aria-label="t('submitted_application.sections')" class="flex flex-wrap gap-x-5 gap-y-2 text-sm">
        <a v-for="(section, sectionIndex) in form.sections" :key="sectionIndex" :href="`#submitted-form-${formIndex}-section-${sectionIndex}`" class="text-primary underline-offset-4 hover:underline">{{ section.title }}</a>
      </nav>
      <CommonNumberedSection v-for="(section, sectionIndex) in form.sections" :id="`submitted-form-${formIndex}-section-${sectionIndex}`" :key="sectionIndex" :number="sectionIndex + 1" :title="section.title" class="scroll-mt-6 border-t border-default pt-6">
        <p v-if="section.description" class="whitespace-pre-wrap text-sm text-muted">
          {{ section.description }}
        </p>
        <div class="max-w-4xl space-y-6 sm:pl-10">
          <CommonSubmittedAnswer v-for="(answer, answerIndex) in section.answers" :key="answerIndex" :answer="answer" />
        </div>
      </CommonNumberedSection>
    </article>
  </CommonPreActionReport>
</template>
