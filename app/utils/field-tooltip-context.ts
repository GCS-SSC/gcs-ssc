import type { ComputedRef, InjectionKey } from 'vue'
import type { z } from 'zod'
import type { FieldTooltipRuntimeQuerySchema } from '~~/shared/types/schemas/field-tooltip'

export type FieldTooltipResource = z.infer<typeof FieldTooltipRuntimeQuerySchema>

export type FieldTooltipRuntime = {
  agencyId: string | null
  items: { targetKey: string, text: { en: string, fr: string } }[]
}

export const fieldTooltipKey: InjectionKey<ComputedRef<FieldTooltipRuntime['items']>> = Symbol('field-tooltips')
export const fieldTooltipRefreshKey: InjectionKey<() => Promise<void>> = Symbol('refresh-field-tooltips')
export const fieldScopeKey: InjectionKey<ComputedRef<string | undefined>> = Symbol('field-scope')
