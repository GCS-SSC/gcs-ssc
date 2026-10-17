import { h } from 'vue'
import type { VNode } from 'vue'
import type { z } from 'zod'
import { localizeBilingualIssueParams, translateZodIssueMessage } from '~~/shared/utils/zod-i18n'

export type LocalizedToastText = string | (() => VNode)

/** Keeps host notification messages reactive while snapshotting their event-time parameters.
 * @returns Nuxt UI toast lifecycle methods and a localized message renderer.
 */
export const useLocalizedToast = () => {
  const toast = useToast()
  const { t, locale } = useI18n({ useScope: 'global' })

  /** Captures a catalog message for Nuxt UI's supported render-function text API.
   * @param key Host catalog message key.
   * @param params Event-time interpolation values.
   * @returns A reactive Nuxt UI text renderer.
   */
  const localized = (key: string, params: Record<string, unknown> = {}) => {
    const snapshot = { ...params }
    return () => h('span', t(key, snapshot))
  }

  /** Retains a client validation issue so its feedback follows the active locale.
   * @param issue The immutable issue returned by Zod validation.
   * @returns A reactive Nuxt UI text renderer.
   */
  const validation = (issue: z.ZodIssue) => () => h('span', translateZodIssueMessage(
    issue.message,
    issue,
    (key, params) => t(key, localizeBilingualIssueParams(params ?? {}, locale.value === 'fr' ? 'fr' : 'en'))
  ))

  return { ...toast, localized, validation }
}
