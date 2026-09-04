/* eslint-disable jsdoc/require-jsdoc -- small canonical workflow lifecycle primitives */
import type { Transaction } from 'kysely'
import type { PublicationKind, RuntimeItemKind, RuntimeState } from '~~/shared/constants/system-lifecycle'
import type { Database } from '~~/shared/types/database'
import { createRuntimeItem, transitionRuntimeItem } from './system-runtime'

export const createWorkflowItem = async (
  trx: Transaction<Database>,
  values: {
    runtimeId: string
    parentRuntimeItemId?: string | null
    itemKind: RuntimeItemKind
    order: number
    publicationId: string
    publicationKind: PublicationKind
    publicationVersionId: string
    publicationVersion: number
  }
) => await createRuntimeItem(trx, {
  egcs_cn_runtime: values.runtimeId,
  egcs_cn_parentruntimeitem: values.parentRuntimeItemId ?? null,
  egcs_cn_kind: values.itemKind,
  egcs_cn_order: values.order,
  egcs_cn_publication: values.publicationId,
  egcs_cn_publicationkind: values.publicationKind,
  egcs_cn_publicationversion: values.publicationVersionId,
  egcs_cn_version: values.publicationVersion
})

export const transitionWorkflowItem = async (
  trx: Transaction<Database>,
  values: {
    runtimeId: string
    runtimeItemId: string
    from: RuntimeState
    to: RuntimeState
    actorId?: string | null
    reason?: string | null
  }
) => await transitionRuntimeItem(trx, {
  runtimeId: values.runtimeId,
  runtimeItemId: values.runtimeItemId,
  from: values.from,
  to: values.to,
  actorId: values.actorId,
  reason: values.reason
})
