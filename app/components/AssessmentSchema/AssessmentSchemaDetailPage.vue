<script setup lang="ts">
import { computed, ref } from 'vue'
import { useAssessmentSchemaDetailPage } from '~/composables/useAssessmentSchemaDetailPage'
import { provideAssessmentSchemaHelperDefinitions } from '~/composables/useAssessmentSchemaHelpers'
import type { Ref } from 'vue'

const {
  schema,
  loadError,
  loadStatus,
  retryLoad,
  generalState,
  assessmentDefinitionState,
  overallScoringMatrixState,
  breadcrumbItems,
  helperDefinitions,
  isHeroCollapsed,
  heroName,
  sectionTabs,
  selectedSection,
  isSavingGeneral,
  isSavingSchema,
  isPublishing,
  isRetiring,
  canManagePublication,
  canEdit,
  canEditFields,
  isMutationPending,
  saveAll,
  publishSchema,
  retireSchema
} = await useAssessmentSchemaDetailPage()

const { t } = useI18n()

const outcomesEditor: Ref<{ openCreateEditor: () => void } | null> = ref(null)
const impactorsEditor: Ref<{ openCreateEditor: () => void } | null> = ref(null)
const isSaving = computed(() => isSavingGeneral.value || isSavingSchema.value)
provideAssessmentSchemaHelperDefinitions(helperDefinitions)
</script>

<template>
  <UDashboardPanel id="transfer-payment-assessment-schema-detail">
    <template #header>
      <UDashboardNavbar>
        <template #leading>
          <UDashboardSidebarCollapse />
          <UBreadcrumb :items="breadcrumbItems" class="ml-2" />
        </template>
        <template #right>
          <div class="flex items-center gap-2">
            <UButton
              color="neutral"
              variant="ghost"
              :icon="isHeroCollapsed ? 'i-lucide-chevron-down' : 'i-lucide-chevron-up'"
              :aria-label="t(isHeroCollapsed ? 'common.expand' : 'common.collapse')"
              @click="isHeroCollapsed = !isHeroCollapsed" />
            <CommonNavbarSide />
          </div>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <CommonLoadingState v-if="loadStatus === 'pending' && !schema" :label="t('common.loading')" />
      <UAlert
        v-else-if="loadError"
        color="error"
        icon="i-lucide-circle-alert"
        :title="t('common.load_failed')"
        :description="t('common.try_again')">
        <template #actions>
          <UButton :label="t('common.retry')" color="error" variant="soft" @click="retryLoad" />
        </template>
      </UAlert>
      <div v-else-if="schema" class="flex flex-1 flex-col">
        <AssessmentSchemaDetailHero
          :name="heroName"
          :entity-type="schema?.egcs_cn_entitytype"
          :publication-version="schema?.publicationVersion"
          :publication-state="schema?.publicationState"
          :has-unpublished-changes="schema?.hasUnpublishedChanges === true"
          :is-collapsed="isHeroCollapsed"
          :is-publishing="isPublishing"
          :is-retiring="isRetiring"
          :is-mutation-pending="isMutationPending"
          :can-manage="canManagePublication"
          @publish="publishSchema"
          @retire="retireSchema" />

        <div class="flex min-h-0 flex-1 flex-col gap-6 overflow-visible px-6 pt-0 pb-6 lg:flex-row lg:gap-0">
          <AssessmentSchemaDetailSidebar
            v-if="canEdit"
            v-model="selectedSection"
            :section-tabs="sectionTabs"
            :is-saving="isSaving"
            :disabled="isMutationPending"
            :ui="{
              trigger: 'w-full justify-start whitespace-normal break-words text-left'
            }"
            @save="saveAll" />
          <aside v-else class="w-full shrink-0 lg:sticky lg:top-6 lg:self-start lg:w-72 lg:border-r lg:border-zinc-200 lg:pr-4 dark:lg:border-zinc-800">
            <div class="pt-6">
              <CommonRouteTabs v-model="selectedSection" :items="sectionTabs" orientation="vertical" />
            </div>
          </aside>

          <div class="min-h-0 min-w-0 flex-1 pt-6 lg:pl-6">
            <fieldset :disabled="!canEditFields">
              <div class="w-full space-y-10 pb-12">
                <AssessmentSchemaPageSection :section-id="'schema-general'" :title="t('agency.tabs.general')">
                  <ReviewSchemaGeneralFields v-if="generalState" v-model:state="generalState" />
                </AssessmentSchemaPageSection>

                <AssessmentSchemaMatrices
                  v-if="assessmentDefinitionState"
                  v-model="assessmentDefinitionState"
                  v-model:overall-scoring-matrix="overallScoringMatrixState" />
                <AssessmentSchemaSectionsEditor v-if="assessmentDefinitionState" v-model="assessmentDefinitionState" />
                <AssessmentSchemaPageSection :section-id="'schema-outcomes'" :title="t('transfer_payment.outcomes')">
                  <template #actions>
                    <UButton
                      icon="i-lucide-plus"
                      :label="t('common.add')"
                      variant="outline"
                      class="cursor-default"
                      @click="outcomesEditor?.openCreateEditor()" />
                  </template>

                  <AssessmentSchemaMitigationsEditor
                    v-if="assessmentDefinitionState"
                    ref="outcomesEditor"
                    v-model="assessmentDefinitionState" />
                </AssessmentSchemaPageSection>

                <AssessmentSchemaPageSection :section-id="'schema-impactors'" :title="t('transfer_payment.impactors')">
                  <template #actions>
                    <UButton
                      icon="i-lucide-plus"
                      :label="t('common.add')"
                      variant="outline"
                      class="cursor-default"
                      @click="impactorsEditor?.openCreateEditor()" />
                  </template>

                  <AssessmentSchemaImpactorsEditor
                    v-if="assessmentDefinitionState"
                    ref="impactorsEditor"
                    v-model="assessmentDefinitionState" />
                </AssessmentSchemaPageSection>
              </div>
            </fieldset>
          </div>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
