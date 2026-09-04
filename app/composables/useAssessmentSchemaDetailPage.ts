import type { FetchError } from 'ofetch'
/* eslint-disable jsdoc/require-jsdoc, jsdoc/require-param-description, jsdoc/require-returns -- schema editor helpers use self-descriptive local signatures */
import type { ComputedRef, Ref } from 'vue'
import { computed, ref, watch } from 'vue'
import type {
  AssessmentBandRow,
  AssessmentDefinitionEditorState
} from '~/composables/useAssessmentSchemaEditorState'
import type { TranslatedTabItem } from '~~/shared/types/ui'
import type { Entity_Type } from '~~/shared/types/database'
import type { PublicationState } from '~~/shared/constants/system-lifecycle'
import type { Scope } from '~~/shared/utils/scopes'
import {
  normalizeBandRows,
  normalizeAssessmentDefinitionEditorState,
  serializeAssessmentDefinitionEditorState
} from '~/composables/useAssessmentSchemaEditorState'
import {
  AssessmentReviewSchemaDefinitionPatchSchema,
  AssessmentReviewSchemaGeneralPatchSchema
} from '~~/shared/types/schemas'
import { appRouteLocations } from '~/utils/route-locations'
import {
  getAssessmentHelperDefinitionsForEntityType
} from '~~/shared/utils/assessment-helpers'
import type { AssessmentEntityHelperDefinition } from '~~/shared/utils/assessment-helpers'
import type { EditorMutationToken } from '~/composables/useEditorMutationCoordinator'
import { useEditorMutationCoordinator } from '~/composables/useEditorMutationCoordinator'

type AssessmentSchemaDetail = {
  id: string
  egcs_cn_name_en?: string | null
  egcs_cn_name_fr?: string | null
  egcs_cn_outcomename_en?: string | null
  egcs_cn_outcomename_fr?: string | null
  egcs_cn_disablecustomoutcomes?: boolean | null
  egcs_cn_disablealignment?: boolean | null
  egcs_cn_disablereviewers?: boolean | null
  egcs_cn_entitytype?: Entity_Type
  publicationId: string
  publicationState: PublicationState
  publicationVersionId: string | null
  publicationVersion: number | null
  hasUnpublishedChanges: boolean
  egcs_cn_assessmentschema: unknown
  egcs_cn_scoringmatrix: unknown
}

type TransferPaymentNameResponse = {
  egcs_tp_name_en: string
  egcs_tp_name_fr: string
  egcs_tp_agency?: string
}

/**
 *
 * @param state
 */
/** Coordinates assessment-schema detail fetching, editing, and save flows. */
export const useAssessmentSchemaDetailPage = async () => {
  const route = useRoute()
  const localePath = useLocalePath()
  const toast = useToast()
  const { showError } = useApiErrorToast()
  const { t } = useI18n()
  const { getBilingualValue } = useBilingualValue()
  const { getHeroCollapsed } = useDashboard()
  const { saveJson, sendJson } = useJsonRequest()
  const { can } = useCan()

  const transferPaymentId = computed(() => String(route.params.id))
  const streamId = computed(() => String(route.params.streamId))
  const schemaId = computed(() => String(route.params.schemaId))

  const selectedSection: Ref<string> = ref('schema-general')

  const schemaEndpoint = computed(() => `/api/transfer-payments/${transferPaymentId.value}/streams/${streamId.value}/assessment-schemas/${schemaId.value}`)
  const profileRequest = useFetch<TransferPaymentNameResponse, FetchError, string>(computed(() => `/api/transfer-payments/${transferPaymentId.value}`))
  const streamRequest = useFetch<TransferPaymentNameResponse, FetchError, string>(computed(() => `/api/transfer-payments/${transferPaymentId.value}/streams/${streamId.value}`))
  const schemaRequest = useFetch<AssessmentSchemaDetail, FetchError, string>(schemaEndpoint)
  const { data: profile } = profileRequest
  const { data: stream } = streamRequest
  const { data: schema, refresh: refreshSchemaRequest } = schemaRequest
  const loadError = computed(() => profileRequest.error.value ?? streamRequest.error.value ?? schemaRequest.error.value)
  const loadStatus = computed(() => [profileRequest.status.value, streamRequest.status.value, schemaRequest.status.value].includes('pending') ? 'pending' : loadError.value ? 'error' : 'success')
  const retryLoad = async () => {
    await Promise.all([profileRequest.refresh(), streamRequest.refresh(), schemaRequest.refresh()])
  }

  const generalState: Ref<Record<string, unknown> | null> = ref(null)
  const assessmentDefinitionState: Ref<AssessmentDefinitionEditorState | null> = ref(null)
  const overallScoringMatrixState: Ref<AssessmentBandRow[]> = ref([])
  const profileScope = computed<Scope>(() => ({
    type: 'entity',
    agencyId: String(profile.value?.egcs_tp_agency ?? ''),
    path: [{ type: 'transfer_payment', id: transferPaymentId.value }]
  }))
  const canManagePublication = computed(() => Boolean(profile.value) && can('transfer_payment', 'update', profileScope.value))
  const canEdit = computed(() => canManagePublication.value && schema.value?.publicationState !== 'retired')

  const breadcrumbItems = computed(() => [
    { label: t('transfer_payment.title'), to: localePath(appRouteLocations.transferPayments()) },
    {
      label: getBilingualValue(profile.value, 'egcs_tp_name'),
      to: localePath(appRouteLocations.transferPaymentDetail(transferPaymentId.value))
    },
    {
      label: getBilingualValue(stream.value, 'egcs_tp_name'),
      to: localePath(appRouteLocations.transferPaymentStreamDetail(transferPaymentId.value, streamId.value, { section: 'assessment-sets' }))
    },
    { label: String(schema.value?.egcs_cn_name_en ?? '') }
  ])

  const isHeroCollapsed = getHeroCollapsed('transfer-payment-assessment-schema-detail')
  const helperDefinitions: ComputedRef<AssessmentEntityHelperDefinition[]> = computed(() => {
    const entityType = schema.value?.egcs_cn_entitytype
    if (!entityType) {
      return []
    }

    return getAssessmentHelperDefinitionsForEntityType(entityType)
  })
  const heroName = computed(() => getBilingualValue(schema.value, 'egcs_cn_name'))
  const sectionTabs = computed<TranslatedTabItem[]>(() => [
    { key: 'agency.tabs.general', icon: 'i-lucide-info', value: 'schema-general' },
    { key: 'transfer_payment.scoring_matrix_record', icon: 'i-lucide-chart-column', value: 'schema-matrices' },
    { key: 'transfer_payment.assessment_sections', icon: 'i-lucide-layers', value: 'schema-sections' },
    { key: 'transfer_payment.outcomes', icon: 'i-lucide-shield-check', value: 'schema-outcomes' },
    { key: 'transfer_payment.impactors', icon: 'i-lucide-zap', value: 'schema-impactors' }
  ])

  /**
   *
   * @param sectionId
   */
  const scrollToSection = (sectionId: string) => {
    if (!import.meta.client) {
      return
    }

    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  watch(selectedSection, value => {
    scrollToSection(value)
  })

  const buildGeneralPayload = () => {
    if (!generalState.value) {
      return null
    }
    const payload = {
      egcs_cn_name_en: String(generalState.value.egcs_cn_name_en ?? ''),
      egcs_cn_name_fr: String(generalState.value.egcs_cn_name_fr ?? ''),
      egcs_cn_outcomename_en: String(generalState.value.egcs_cn_outcomename_en ?? ''),
      egcs_cn_outcomename_fr: String(generalState.value.egcs_cn_outcomename_fr ?? ''),
      egcs_cn_disablecustomoutcomes: generalState.value.egcs_cn_disablecustomoutcomes === true,
      egcs_cn_disablealignment: generalState.value.egcs_cn_disablealignment === true,
      egcs_cn_disablereviewers: generalState.value.egcs_cn_disablereviewers === true
    }
    return AssessmentReviewSchemaGeneralPatchSchema.safeParse(payload)
  }

  const buildDefinitionPayload = () => {
    if (!assessmentDefinitionState.value) {
      return null
    }
    const payload = {
      egcs_cn_scoringmatrix: overallScoringMatrixState.value.map(row => ({
        max: Number(row.max),
        label: {
          en: row.label.en,
          fr: row.label.fr
        },
        indicator: row.indicator
      })),
      egcs_cn_assessmentschema: serializeAssessmentDefinitionEditorState(assessmentDefinitionState.value)
    }
    return AssessmentReviewSchemaDefinitionPatchSchema.safeParse(payload)
  }

  const getDraft = () => ({
    general: generalState.value
      ? {
          egcs_cn_name_en: generalState.value.egcs_cn_name_en,
          egcs_cn_name_fr: generalState.value.egcs_cn_name_fr,
          egcs_cn_outcomename_en: generalState.value.egcs_cn_outcomename_en,
          egcs_cn_outcomename_fr: generalState.value.egcs_cn_outcomename_fr,
          egcs_cn_disablecustomoutcomes: generalState.value.egcs_cn_disablecustomoutcomes === true,
          egcs_cn_disablealignment: generalState.value.egcs_cn_disablealignment === true,
          egcs_cn_disablereviewers: generalState.value.egcs_cn_disablereviewers === true
        }
      : null,
    definition: assessmentDefinitionState.value
      ? {
          egcs_cn_scoringmatrix: overallScoringMatrixState.value.map(row => ({
            max: Number(row.max),
            label: { en: row.label.en, fr: row.label.fr },
            indicator: row.indicator
          })),
          egcs_cn_assessmentschema: serializeAssessmentDefinitionEditorState(assessmentDefinitionState.value)
        }
      : null
  })
  const mutation = useEditorMutationCoordinator({ getDraft })
  const isSavingGeneral = computed(() => mutation.isActionPending('save-general') || mutation.isActionPending('save-all'))
  const isSavingSchema = computed(() => mutation.isActionPending('save-schema') || mutation.isActionPending('save-all'))
  const isPublishing = computed(() => mutation.isActionPending('publish'))
  const isRetiring = computed(() => mutation.isActionPending('retire'))
  const canEditFields = computed(() => canEdit.value && !mutation.isPending.value)
  const applySchemaDraft = (value: AssessmentSchemaDetail) => {
    generalState.value = {
      id: value.id,
      egcs_cn_name_en: value.egcs_cn_name_en,
      egcs_cn_name_fr: value.egcs_cn_name_fr,
      egcs_cn_outcomename_en: value.egcs_cn_outcomename_en,
      egcs_cn_outcomename_fr: value.egcs_cn_outcomename_fr,
      egcs_cn_disablecustomoutcomes: value.egcs_cn_disablecustomoutcomes,
      egcs_cn_disablealignment: value.egcs_cn_disablealignment,
      egcs_cn_disablereviewers: value.egcs_cn_disablereviewers
    }
    assessmentDefinitionState.value = normalizeAssessmentDefinitionEditorState(value.egcs_cn_assessmentschema)
    overallScoringMatrixState.value = normalizeBandRows(value.egcs_cn_scoringmatrix)
  }
  watch(schema, value => {
    if (value && !mutation.isDirty.value) mutation.replaceSessionDraft(() => applySchemaDraft(value))
  }, { immediate: true })
  watch([transferPaymentId, streamId, schemaId], () => {
    selectedSection.value = 'schema-general'
    mutation.replaceSessionDraft(() => {
      generalState.value = null
      assessmentDefinitionState.value = null
      overallScoringMatrixState.value = []
    })
  })

  const showPreservedDraft = () => toast.add({
    title: t('common.warning'),
    description: t('common.newer_changes_preserved'),
    color: 'warning'
  })
  const blockDirtyAction = () => {
    if (!mutation.isDirty.value) return false
    toast.add({
      title: t('common.warning'),
      description: t('common.save_changes_before_action'),
      color: 'warning'
    })
    return true
  }
  const refreshForMutation = async (token: EditorMutationToken) => {
    await refreshSchemaRequest()
    const refreshedSchema = schema.value
    if (!refreshedSchema) return false
    return mutation.applyMutationRefresh(token, {
      apply: () => applySchemaDraft(refreshedSchema),
      mergeMetadata: () => undefined
    })
  }
  const persistPayload = async (
    token: EditorMutationToken,
    payload: Record<string, unknown>,
    showSuccess: boolean
  ) => {
    await saveJson(schemaEndpoint.value, 'PATCH', payload)
    if (!await refreshForMutation(token)) {
      if (mutation.isTokenCurrent(token)) showPreservedDraft()
      return false
    }
    if (showSuccess) {
      toast.add({ title: t('common.success'), description: t('common.updated_success'), color: 'success' })
    }
    return true
  }

  /**
   *
   */
  const saveGeneral = async () => {
    await saveAll()
  }

  /**
   *
   */
  const saveSchemaDefinition = async () => {
    await saveAll()
  }

  type GeneralPayloadResult = ReturnType<typeof buildGeneralPayload>
  type SchemaPayloadResult = ReturnType<typeof buildDefinitionPayload>

  const showSaveAllValidationError = (
    result: NonNullable<GeneralPayloadResult> | NonNullable<SchemaPayloadResult>
  ) => {
    if (result.success) {
      return false
    }

    toast.add({ title: t('common.error'), description: t(result.error.issues[0]?.message ?? 'common.error'), color: 'error' })
    return true
  }

  const validateSaveAllPayloads = () => {
    const generalResult = buildGeneralPayload()
    if (generalResult && showSaveAllValidationError(generalResult)) {
      return null
    }

    const schemaResult = buildDefinitionPayload()
    if (schemaResult && showSaveAllValidationError(schemaResult)) {
      return null
    }

    return { generalResult, schemaResult }
  }

  const combineSaveAllPayloads = (
    generalResult: GeneralPayloadResult,
    schemaResult: SchemaPayloadResult
  ) => ({
    ...(generalResult?.success ? generalResult.data : {}),
    ...(schemaResult?.success ? schemaResult.data : {})
  })

  const saveAll = async () => {
    if (!canEdit.value || mutation.isPending.value) {
      return
    }

    const payloads = validateSaveAllPayloads()
    if (!payloads) return

    await mutation.run('save-all', async token => {
      try {
        await persistPayload(token, combineSaveAllPayloads(payloads.generalResult, payloads.schemaResult), true)
      } catch (error) {
        showError(error)
      }
    })
  }

  const performSchemaAction = async (
    action: 'publish' | 'retire',
    successKey: 'common.published_success' | 'common.retired_success'
  ) => {
    if (!canManagePublication.value || schema.value?.publicationState === 'retired' || mutation.isPending.value) {
      return
    }
    if (action === 'retire' && blockDirtyAction()) return

    await mutation.run(action, async token => {
      try {
        if (action === 'publish' && mutation.isDirty.value) {
          const payloads = validateSaveAllPayloads()
          if (!payloads) return
          const saved = await persistPayload(
            token,
            combineSaveAllPayloads(payloads.generalResult, payloads.schemaResult),
            false
          )
          if (!saved) return
        }
        await sendJson(`${schemaEndpoint.value}/${action}`, 'POST')
        if (!await refreshForMutation(token)) {
          if (mutation.isTokenCurrent(token)) showPreservedDraft()
          return
        }
        toast.add({ title: t('common.success'), description: t(successKey), color: 'success' })
      } catch (error) {
        showError(error)
      }
    })
  }

  const publishSchema = async () => {
    await performSchemaAction('publish', 'common.published_success')
  }

  const retireSchema = async () => {
    await performSchemaAction('retire', 'common.retired_success')
  }

  return {
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
    isMutationPending: mutation.isPending,
    isDirty: mutation.isDirty,
    saveGeneral,
    saveSchemaDefinition,
    saveAll,
    publishSchema,
    retireSchema
  }
}
