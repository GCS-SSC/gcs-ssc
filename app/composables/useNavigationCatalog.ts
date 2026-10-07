/* eslint-disable jsdoc/require-jsdoc -- Navigation entries declare the existing sidebar policy. */
import { computed, toValue } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import type { NavigationMenuItem } from '@nuxt/ui'
import type { ExtensionAgencyWorkspaceListItem } from '~~/shared/types/schemas/extensions'
import { appRouteLocations } from '~/utils/route-locations'

export type NavigationCatalogItem = NavigationMenuItem & {
  id: string
  label: string
  to: string
  searchLabels: string[]
}

/**
 * Supplies the same permitted page destinations to the sidebar and global search.
 * @param workspaces - Server-permitted extension workspace entries.
 * @returns Reactive sidebar groups and searchable page destinations.
 */
export const useNavigationCatalog = (workspaces: MaybeRefOrGetter<ExtensionAgencyWorkspaceListItem[]>) => {
  const { t, locale } = useI18n()
  const localePath = useLocalePath()
  const { can, canAny, canManageAssignments = () => false } = useCan()
  const pages = computed<NavigationCatalogItem[]>(() => {
    const entries: NavigationCatalogItem[] = []
    const add = (
      id: string,
      labelKey: string,
      icon: string,
      destination: Parameters<typeof localePath>[0],
      permitted = true,
      presentation: Pick<NavigationMenuItem, 'defaultOpen' | 'type'> = {}
    ) => {
      if (!permitted) return
      entries.push({
        ...presentation, id, label: t(labelKey), icon, to: localePath(destination),
        searchLabels: [t(labelKey, {}, { locale: 'en' }), t(labelKey, {}, { locale: 'fr' })]
      })
    }
    add('home', 'nav.home', 'i-lucide-house', appRouteLocations.home())
    add('agencies', 'nav.agencies', 'i-lucide-settings', appRouteLocations.agencies(), canAny('agency', 'read'), { defaultOpen: true, type: 'trigger' })
    add('programs', 'nav.transfer_payments', 'i-lucide-banknote', appRouteLocations.transferPayments(), canAny('transfer_payment', 'read'))
    add('opportunities', 'nav.funding_opportunities', 'i-lucide-megaphone', appRouteLocations.fundingOpportunities(), canAny('transfer_payment', 'read'))
    add('intakes', 'nav.funding_case_intakes', 'i-lucide-inbox', appRouteLocations.fundingCaseIntakes(), canAny('funding_case', 'read'))
    add('journal-vouchers', 'journal_voucher.title', 'i-lucide-book-open-check', '/journal-vouchers', canAny('journal_voucher', 'read'))
    add('agreements', 'nav.agreements', 'i-lucide-file-signature', appRouteLocations.agreements(), canAny('agreement', 'read'))
    entries.push(...toValue(workspaces).map(workspace => ({
      id: `extension:${workspace.key}`,
      label: locale.value === 'fr' ? workspace.label.fr : workspace.label.en,
      icon: workspace.icon ?? 'i-lucide-panels-top-left',
      to: localePath(appRouteLocations.extensionAgencyWorkspaceList(workspace.key)),
      searchLabels: [workspace.label.en, workspace.label.fr]
    })))
    add('proponents', 'nav.applicant_recipients', 'i-lucide-store', appRouteLocations.proponents(), canAny('applicant_recipient', 'read'))
    const assignmentSubjects = ['agreement', 'applicant_recipient', 'funding_case', 'journal_voucher', 'correction'] as const
    add('assignment', 'nav.assignment_management', 'i-lucide-user-round-check', appRouteLocations.assignmentManagement(), assignmentSubjects.some(subject => canManageAssignments(subject)))
    add('roles', 'role.title', 'i-lucide-shield', appRouteLocations.roles(), canAny('role', 'read'))
    add('users', 'nav.users', 'i-lucide-user-round', appRouteLocations.users(), canAny('user', 'read'))
    add('groups', 'nav.groups', 'i-lucide-users', appRouteLocations.groups(), canAny('group', 'read'))
    add('audit', 'audit.title', 'i-lucide-clipboard-list', '/admin/audit', canAny('audit', 'read', ['global', 'agency']))
    add('common', 'admin_common.resources.gwcoa', 'i-lucide-database', appRouteLocations.adminGwcoa(), can('system', 'read', { type: 'global' }))
    return entries
  })
  const items = computed<NavigationMenuItem[][]>(() => [pages.value, []])
  return { items, pages }
}
