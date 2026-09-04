<!-- eslint-disable jsdoc/require-jsdoc, jsdoc/require-param, jsdoc/require-param-description, jsdoc/require-returns -->
<script setup lang="ts">
import lucideIcons from '@iconify-json/lucide/icons.json'
import { nanoid } from 'nanoid'
import type { AssessmentDefinitionEditorState } from '~/composables/useAssessmentSchemaEditorState'
import {
  createAssessmentSectionRow,
  createAssessmentSubSectionRow,
  normalizeAssessmentDefinitionEditorState
} from '~/composables/useAssessmentSchemaEditorState'
import {
  buildAssessmentAnswerPathTree,
  getAssessmentLocaleLabel
} from '~/utils/assessment-schema'

const state = defineModel<AssessmentDefinitionEditorState>({
  default: () => normalizeAssessmentDefinitionEditorState({})
})

const { t, locale } = useI18n()
const activeLocale = computed<'en' | 'fr'>(() => locale.value === 'fr' ? 'fr' : 'en')
const iconSearchBySection = ref<Record<string, string>>({})
const lucideIconNames = Object.keys(lucideIcons.icons).map(name => `i-lucide-${name}`)
const sectionRenderIdMap = ref<Record<string, string>>({})
const subSectionRenderIdMap = ref<Record<string, string>>({})
type SectionRow = AssessmentDefinitionEditorState['sections'][number]
type SubSectionRow = SectionRow['subSections'][number]
type AnswerPathItem = {
  label: string
  sectionLabel: string
  subSectionLabel: string
  questionLabel: string
  value: string
}
type SectionEntry = {
  sectionKey: string
  renderId: string
  section: SectionRow
  sourceIndex: number
  sortOrder: number
}
type SubSectionEntry = {
  subSectionKey: string
  renderId: string
  subSection: SubSectionRow
  sourceIndex: number
  sortOrder: number
}

/**
 *
 */
const getSectionIndexByKey = (sectionKey: string) => state.value.sections.findIndex(section => section._key === sectionKey)

/**
 *
 * @param sectionKey
 */
const getSectionRenderId = (sectionKey: string) => {
  const existing = sectionRenderIdMap.value[sectionKey]
  if (existing) {
    return existing
  }

  const generated = nanoid()
  sectionRenderIdMap.value[sectionKey] = generated
  return generated
}

/**
 *
 * @param section
 * @param fallbackIndex
 */
const getSectionOrderValue = (section: SectionRow, fallbackIndex: number) => {
  const parsedOrder = Number.parseInt(section.number, 10)
  if (Number.isNaN(parsedOrder)) {
    return fallbackIndex + 1
  }

  return parsedOrder
}

/**
 *
 * @param subSection
 * @param fallbackIndex
 */
const getSubSectionOrderValue = (subSection: SubSectionRow, fallbackIndex: number) => {
  const parsedOrder = Number.parseInt(subSection.number, 10)
  if (Number.isNaN(parsedOrder)) {
    return fallbackIndex + 1
  }

  return parsedOrder
}

const sortedSectionEntries = computed<SectionEntry[]>(() => state.value.sections
  .map((section, sourceIndex) => ({
    sectionKey: section._key,
    renderId: getSectionRenderId(section._key),
    section,
    sourceIndex,
    sortOrder: getSectionOrderValue(section, sourceIndex)
  }))
  .sort((a, b) => a.sortOrder - b.sortOrder || a.sourceIndex - b.sourceIndex))

const answerPathItems = computed<AnswerPathItem[]>(() => state.value.sections.flatMap((section) => {
  const sectionLabel = getAssessmentLocaleLabel(section.label, activeLocale.value, section.name) || section.name

  return section.subSections.flatMap((subSection) => {
    const subSectionLabel = getAssessmentLocaleLabel(subSection.label, activeLocale.value, subSection.name) || subSection.name

    return subSection.questions.map((item) => {
      const questionLabel = getAssessmentLocaleLabel(item.question, activeLocale.value, item.name) || item.name
      return {
        label: `${sectionLabel} > ${subSectionLabel} > ${questionLabel}`,
        sectionLabel,
        subSectionLabel,
        questionLabel,
        value: JSON.stringify([section.name, subSection.name, item.name])
      }
    })
  })
}))

const answerPathTree = computed(() => buildAssessmentAnswerPathTree(answerPathItems.value))

const getSubSectionCompositeKey = (sectionKey: string, subSectionKey: string) => `${sectionKey}|${subSectionKey}`

/**
 *
 * @param sectionKey
 * @param subSectionKey
 */
const getSubSectionRenderId = (sectionKey: string, subSectionKey: string) => {
  const compositeKey = getSubSectionCompositeKey(sectionKey, subSectionKey)
  const existing = subSectionRenderIdMap.value[compositeKey]
  if (existing) {
    return existing
  }

  const generated = nanoid()
  subSectionRenderIdMap.value[compositeKey] = generated
  return generated
}

/**
 *
 */
const addSection = () => {
  if (!Array.isArray(state.value.sections)) {
    state.value.sections = []
  }

  const usedOrders = new Set(state.value.sections.map(section => Number.parseInt(section.number, 10)))
  let nextOrder = 1
  while (usedOrders.has(nextOrder)) nextOrder += 1
  state.value.sections.push({ ...createAssessmentSectionRow(), number: String(nextOrder) })
}

/**
 *
 * @param sectionKey
 */
const removeSection = (sectionKey: string) => {
  const sectionIndex = getSectionIndexByKey(sectionKey)
  if (sectionIndex < 0) {
    return
  }

  state.value.sections.splice(sectionIndex, 1)
}

/**
 *
 * @param sectionKey
 */
const addSubSection = (sectionKey: string) => {
  const sectionIndex = getSectionIndexByKey(sectionKey)
  if (sectionIndex < 0) {
    return
  }

  const section = state.value.sections[sectionIndex]
  if (!section) {
    return
  }

  const subSection = createAssessmentSubSectionRow()
  subSection.number = String(section.subSections.length + 1)
  section.subSections.push(subSection)
}

const getSubSectionIndexByKey = (section: SectionRow, subSectionKey: string) => section.subSections.findIndex(subSection => subSection._key === subSectionKey)

/**
 *
 * @param sectionKey
 * @param subSectionKey
 */
const removeSubSection = (sectionKey: string, subSectionKey: string) => {
  const sectionIndex = getSectionIndexByKey(sectionKey)
  if (sectionIndex < 0) {
    return
  }

  const section = state.value.sections[sectionIndex]
  if (!section) {
    return
  }

  const subSectionIndex = getSubSectionIndexByKey(section, subSectionKey)
  if (subSectionIndex < 0) {
    return
  }

  section.subSections.splice(subSectionIndex, 1)
}

/**
 *
 * @param section
 */
const getSectionTitle = (section: SectionRow, _fallbackOrder: number) => {
  const label = getAssessmentLocaleLabel(section.label, activeLocale.value, section.name)
  return label || t('transfer_payment.assessment_section')
}

const getIconSearch = (sectionRenderId: string) => iconSearchBySection.value[sectionRenderId] ?? ''

const setIconSearch = (sectionRenderId: string, value: string) => {
  iconSearchBySection.value[sectionRenderId] = value
}

/**
 *
 * @param sectionRenderId
 */
const getFilteredIcons = (sectionRenderId: string) => {
  const query = getIconSearch(sectionRenderId).trim().toLowerCase()
  if (!query) {
    return lucideIconNames.slice(0, 180)
  }

  return lucideIconNames
    .filter(iconName => iconName.toLowerCase().includes(query))
    .slice(0, 300)
}

/**
 *
 * @param sectionKey
 * @param iconName
 */
const selectSectionIcon = (sectionKey: string, iconName: string) => {
  const sectionIndex = getSectionIndexByKey(sectionKey)
  if (sectionIndex < 0) {
    return
  }

  const section = state.value.sections[sectionIndex]
  if (!section) {
    return
  }

  section.icon = iconName
}

/**
 *
 * @param section
 * @param sectionKey
 */
const getSortedSubSectionEntries = (section: SectionRow, sectionKey: string): SubSectionEntry[] => section.subSections
  .map((subSection, sourceIndex) => ({
    subSectionKey: subSection._key,
    renderId: getSubSectionRenderId(sectionKey, subSection._key),
    subSection,
    sourceIndex,
    sortOrder: getSubSectionOrderValue(subSection, sourceIndex)
  }))
  .sort((a, b) => a.sortOrder - b.sortOrder || a.sourceIndex - b.sourceIndex)
</script>

<template>
  <AssessmentSchemaPageSection section-id="schema-sections" :title="t('transfer_payment.assessment_sections')">
    <template #actions>
      <UButton
        icon="i-lucide-plus"
        :label="t('transfer_payment.add_section')"
        variant="outline"
        class="cursor-default"
        @click="addSection" />
    </template>

    <div class="space-y-4">
      <div
        v-if="state.sections.length === 0"
        class="border-default border-t pt-4 text-sm text-zinc-500 dark:text-zinc-400">
        {{ t('transfer_payment.no_sections_configured') }}
      </div>

      <div
        v-for="(entry, displayIndex) in sortedSectionEntries"
        :key="entry.renderId"
        class="space-y-0">
        <AssessmentSchemaAccordionSection
          :title="getSectionTitle(entry.section, displayIndex + 1)"
        >
          <div class="space-y-6">
            <div class="flex items-center justify-between gap-3">
              <div />
              <UButton
                icon="i-lucide-trash"
                color="error"
                variant="ghost"
                class="cursor-default"
                :aria-label="t('transfer_payment.remove_section_named', {
                  position: displayIndex + 1,
                  name: getSectionTitle(entry.section, displayIndex + 1)
                })"
                @click="removeSection(entry.sectionKey)" />
            </div>

            <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
              <UFormField :label="t('transfer_payment.name_en')" :name="`sections.${entry.sourceIndex}.label.en`">
                <UInput v-model="entry.section.label.en" />
              </UFormField>

              <UFormField :label="t('transfer_payment.name_fr')" :name="`sections.${entry.sourceIndex}.label.fr`">
                <UInput v-model="entry.section.label.fr" />
              </UFormField>
            </div>

            <div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <UFormField :label="t('common.order')" :name="`sections.${entry.sourceIndex}.number`">
                <UInput v-model="entry.section.number" />
              </UFormField>

              <UFormField :label="t('common.weight')" :name="`sections.${entry.sourceIndex}.weight`">
                <UInput v-model.number="entry.section.weight" type="number" />
              </UFormField>

              <UFormField :label="t('transfer_payment.language_independent_code')" :name="`sections.${entry.sourceIndex}.name`">
                <UInput v-model="entry.section.name" />
              </UFormField>

              <UFormField :label="t('common.icon')" :name="`sections.${entry.sourceIndex}.icon`">
                <UPopover>
                  <UButton color="neutral" variant="outline" class="w-full cursor-default justify-start">
                    <template #leading>
                      <UIcon :name="entry.section.icon || 'i-lucide-circle'" class="size-4" />
                    </template>
                    <span class="truncate text-xs">
                      {{ entry.section.icon || t('transfer_payment.choose_icon') }}
                    </span>
                  </UButton>

                  <template #content>
                    <div class="w-[420px] space-y-3 p-3">
                      <UInput
                        :model-value="getIconSearch(entry.renderId)"
                        :placeholder="t('transfer_payment.search_icons')"
                        icon="i-lucide-search"
                        @update:model-value="value => setIconSearch(entry.renderId, String(value ?? ''))" />
                      <div class="grid max-h-72 grid-cols-3 gap-2 overflow-y-auto pr-1">
                        <UButton
                          v-for="iconName in getFilteredIcons(entry.renderId)"
                          :key="iconName"
                          color="neutral"
                          variant="ghost"
                          class="cursor-default justify-start text-xs"
                          @click="selectSectionIcon(entry.sectionKey, iconName)">
                          <template #leading>
                            <UIcon :name="iconName" class="size-4" />
                          </template>
                          <span class="truncate">{{ iconName.replace('i-lucide-', '') }}</span>
                        </UButton>
                      </div>
                    </div>
                  </template>
                </UPopover>
              </UFormField>
            </div>

            <AssessmentSchemaAccordionSection
              :title="t('transfer_payment.assessment_subsections')"
              level="sub"
            >
              <div class="space-y-4">
                <div class="flex justify-end">
                  <UButton
                    icon="i-lucide-plus"
                    :label="t('transfer_payment.add_subsection')"
                    variant="outline"
                    class="cursor-default"
                    @click="addSubSection(entry.sectionKey)" />
                </div>

                <AssessmentSchemaSubSectionEditor
                  v-for="(subSectionEntry, subSectionDisplayIndex) in getSortedSubSectionEntries(entry.section, entry.sectionKey)"
                  :key="subSectionEntry.renderId"
                  v-model:sub-section="entry.section.subSections[subSectionEntry.sourceIndex]!"
                  :section-key="entry.sectionKey"
                  :sub-section-index="subSectionEntry.sourceIndex"
                  :display-order="subSectionDisplayIndex + 1"
                  :section-title="getSectionTitle(entry.section, displayIndex + 1)"
                  :answer-path-tree="answerPathTree"
                  @remove="removeSubSection(entry.sectionKey, subSectionEntry.subSectionKey)" />
              </div>
            </AssessmentSchemaAccordionSection>
          </div>
        </AssessmentSchemaAccordionSection>
      </div>
    </div>
  </AssessmentSchemaPageSection>
</template>
