/* eslint-disable jsdoc/require-jsdoc -- Internal scope synchronization callbacks are covered by focused composable tests. */
import { computed, ref, watch } from 'vue'
import type { Ref, ComputedRef } from 'vue'
import type { RoleInput } from '~~/shared/types/schemas/rbac'

const GLOBAL_SCOPE_VALUE = '__global__'

export interface RoleScopeSelection {
  canCreateGlobal: ComputedRef<boolean>
  agencyOptions: ComputedRef<Array<{ label: string; value: string }>>
  agencySelection: Ref<string | undefined>
  updateAgencySelection: (value: string | undefined) => void
}

/**
 * Derives role scope selection state for create/update role forms.
 *
 * @param state - Mutable role form state.
 * @returns Global capability, options, and agency selection binding.
 */
export const useRoleScopeSelection = (state: Ref<Partial<RoleInput>>): RoleScopeSelection => {
  const { t } = useI18n()
  const { can } = useCan()

  const canCreateGlobal = computed(() => can('role', 'create', { type: 'global' }))

  const agencyOptions = computed(() =>
    canCreateGlobal.value ? [{ label: t('role.scope.global'), value: GLOBAL_SCOPE_VALUE }] : []
  )

  const resolveAgencySelection = (): string | undefined => {
    if (state.value.agency_id) {
      return String(state.value.agency_id)
    }
    return canCreateGlobal.value ? GLOBAL_SCOPE_VALUE : undefined
  }
  const agencySelection: Ref<string | undefined> = ref(resolveAgencySelection())

  watch([() => state.value.agency_id, canCreateGlobal], () => {
    agencySelection.value = resolveAgencySelection()
  })

  const updateAgencySelection = (value: string | undefined) => {
    agencySelection.value = value
    state.value.agency_id = value === GLOBAL_SCOPE_VALUE ? null : value
  }

  return {
    canCreateGlobal,
    agencyOptions,
    agencySelection,
    updateAgencySelection
  }
}
