import { computed, inject, toValue } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import { DETAIL_SECTION_CONTEXT } from '~/utils/detail-sections'

/** Checks whether an enclosing detail section already presents this exact heading.
 * @param title - Reactive localized heading; numbered or distinct nested headings stay with their component.
 * @returns Reactive ownership without changing domain controls or data.
 */
export const useDetailSectionOwnership = (title: MaybeRefOrGetter<string>) => {
  const context = inject(DETAIL_SECTION_CONTEXT, null)
  return computed(() => Boolean(context && context.title.value === toValue(title)))
}
