import type { ComputedRef, InjectionKey } from 'vue'

export type DetailSectionWidth = 'readable' | 'full'

export type DetailSectionContext = {
  title: ComputedRef<string>
  description: ComputedRef<string | undefined>
}

export const DETAIL_SECTION_CONTEXT: InjectionKey<DetailSectionContext> = Symbol('detail-section')

const descriptions: Record<string, string> = {
  'funding_opportunity.applications': 'funding_opportunity.applications_description',
  'supplementary_information.title': 'supplementary_information.description'
}

/** Resolves presentation only; record capabilities and business behavior stay with the caller.
 * @param key - The section's stable translation key, independent of its localized URL value.
 * @returns Shared content width and optional description key.
 */
export const getDetailSectionPresentation = (key: string): { width: DetailSectionWidth, descriptionKey?: string } => ({
  width: key.endsWith('.general') || key.endsWith('.completion.title') || ['supplementary_information.title', 'funding_case_intake.details', 'account_receivable.summary', 'account_receivable.credit_memo_summary'].includes(key)
    ? 'readable'
    : 'full',
  descriptionKey: descriptions[key]
})
