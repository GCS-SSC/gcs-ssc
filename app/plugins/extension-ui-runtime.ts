import {
  clearExtensionUiRuntime,
  setExtensionUiRuntime,
  type GcsExtensionConfirmDialog,
  type GcsExtensionI18n,
  type GcsExtensionToast,
  type GcsExtensionUiRuntime,
  type GcsGroupedTableExpansionOptions,
  type GcsGroupedTableExpansionResult
} from '@gcs-ssc/extensions/ui'
import type { Component } from 'vue'
import CommonFlowDiagram from '~/components/Common/FlowDiagram.vue'
import CommonCompletionSection from '~/components/Common/Completions/Section.vue'
import CommonCompletionPanel from '~/components/Common/Completions/Panel.vue'
import { useUrlTabState } from '~/composables/useUrlTabState'
import CommonWorkflowSection from '~/components/Common/Workflow/Section.vue'
import CommonWorkflowSupplementaryInformation from '~/components/Common/Workflow/SupplementaryInformation.vue'
import {
  AssessmentSchemaAccordionSection,
  AssessmentSchemaPageSection,
  CommonEntityEditorWorkspace,
  CommonDetailPage,
  CommonDetailWorkspace,
  CommonEntityHero,
  CommonCompactTable,
  CommonSelectableTable,
  CommonCurrencyInput,
  CommonPaymentCalculationBreakdown,
  CommonResourceLayoutCard,
  CommonRouteTabs,
  CommonSaveButton,
  CommonSection,
  CommonStatusBadge,
  CommonStatusSelect,
  CommonStreamWorkflowLinks,
  UAccordion,
  UAlert,
  UBadge,
  CommonActionButton,
  UCheckbox,
  UFormField,
  UIcon,
  UInput,
  UInputTags,
  UModal,
  UProgress,
  USelect,
  USelectMenu,
  USwitch,
  UTable,
  UTextarea,
  UTooltip
} from '#components'
import {
  useConfirmDialog,
  useFetch,
  useGroupedTableExpansion,
  useI18n,
  useToast
} from '#imports'

const asExtensionHostComponent = (component: object): Component => component as Component

const extensionHostComponents = {
  CommonFlowDiagram,
  CommonAssessmentSchemaAccordionSection: AssessmentSchemaAccordionSection,
  CommonAssessmentSchemaPageSection: AssessmentSchemaPageSection,
  CommonCompletionSection,
  CommonCompletionPanel,
  CommonEntityEditorWorkspace,
  CommonDetailPage,
  CommonDetailWorkspace,
  CommonEntityHero,
  CommonCompactTable,
  CommonSelectableTable: asExtensionHostComponent(CommonSelectableTable),
  CommonCurrencyInput,
  CommonPaymentCalculationBreakdown,
  CommonResourceLayoutCard,
  CommonRouteTabs,
  CommonSaveButton,
  CommonSection,
  CommonStatusBadge,
  CommonStatusSelect,
  CommonStreamWorkflowLinks,
  CommonWorkflowSection,
  CommonWorkflowSupplementaryInformation,
  UAccordion: asExtensionHostComponent(UAccordion),
  UAlert,
  UBadge,
  UButton: CommonActionButton,
  UCheckbox,
  UFormField,
  UIcon,
  UInput: asExtensionHostComponent(UInput),
  UInputTags: asExtensionHostComponent(UInputTags),
  UModal,
  UProgress,
  USelect: asExtensionHostComponent(USelect),
  USelectMenu: asExtensionHostComponent(USelectMenu),
  USwitch,
  UTable: asExtensionHostComponent(UTable),
  UTextarea: asExtensionHostComponent(UTextarea),
  UTooltip
} satisfies GcsExtensionUiRuntime['components']

const useExtensionFetch: GcsExtensionUiRuntime['composables']['useFetch'] = useFetch

const extensionHostComposables = {
  useUrlTabState,
  useConfirmDialog: (): GcsExtensionConfirmDialog => {
    const confirm = useConfirmDialog()
    return options => confirm(options)
  },
  useFetch: useExtensionFetch,
  /**
   * Exposes only the extension-facing grouped table expansion contract.
   *
   * @param options - Grouping configuration supplied by an extension.
   * @returns Grouped table state and helpers supported by the extension API.
   */
  useGroupedTableExpansion: <Row>(
    options: GcsGroupedTableExpansionOptions<Row>
  ): GcsGroupedTableExpansionResult<Row> => {
    const result = useGroupedTableExpansion<Row>(options)
    return {
      expandedRows: result.expandedRows,
      grouping: result.grouping,
      columnVisibility: result.columnVisibility,
      groupingOptions: result.groupingOptions,
      getGroupRowId: result.getGroupRowId,
      isGroupedRow: result.isGroupedRow,
      isGroupRow: result.isGroupRow,
      getLeafRows: result.getLeafRows,
      getGroupedRowCount: result.getGroupedRowCount,
      canExpandGroupedRow: result.canExpandGroupedRow,
      updateExpandedRows: result.updateExpandedRows
    }
  },
  /**
   * Adapts the host i18n signatures to the extension runtime contract.
   *
   * @returns Locale, translation, and number-formatting helpers.
   */
  useI18n: (): GcsExtensionI18n => {
    const i18n = useI18n()
    return {
      locale: i18n.locale,
      n: (value: number, options?: Intl.NumberFormatOptions) => options === undefined
        ? i18n.n(value)
        : i18n.n(value, options)
    }
  },
  /**
   * Restricts host toast access to extension-supported notifications.
   *
   * @returns The extension-facing toast adapter.
   */
  useToast: (): GcsExtensionToast => {
    const toast = useToast()
    return {
      add: notification => toast.add(notification)
    }
  }
} satisfies GcsExtensionUiRuntime['composables']

export default defineNuxtPlugin(nuxtApp => {
  const runtime: GcsExtensionUiRuntime = {
    components: extensionHostComponents,
    composables: extensionHostComposables
  }

  setExtensionUiRuntime(runtime)
  const originalUnmount = nuxtApp.vueApp.unmount
  nuxtApp.vueApp.unmount = (...args) => {
    clearExtensionUiRuntime()
    return originalUnmount(...args)
  }
})
