/* eslint-disable jsdoc/require-jsdoc, jsdoc/require-param, jsdoc/require-returns -- Temporary coverage while extension operation helpers receive complete documentation. */
import type { Kysely } from 'kysely'
import type { AuthContext } from '~~/server/utils/authorize'
import {
  canAccessExtensionEntity,
  getExtensionConfigurationForEntity,
  getRegisteredExtensions,
  type ExtensionEntityContext
} from '~~/server/utils/extensions'
import type { Database } from '~~/shared/types/database'
import type {
  ExtensionCreateActionItem,
  ExtensionPaymentAmountCalculatorItem
} from '~~/shared/types/schemas/extensions'
import type {
  GcsExtensionCreateOperation,
  GcsExtensionJsonConfig,
  GcsExtensionRbacRequirement
} from '~~/shared/utils/extensions'

interface ExtensionAgreementOperationContext<Operation extends GcsExtensionCreateOperation> {
  operation: Operation
  agencyId: string
  streamId: string
  agreementId: string
  scope: ExtensionEntityContext['scope']
}

const buildExtensionAgreementOperationContext = <Operation extends GcsExtensionCreateOperation>(
  operation: Operation,
  entityContext: ExtensionEntityContext
): ExtensionAgreementOperationContext<Operation> => ({
  operation,
  agencyId: entityContext.agencyId,
  streamId: entityContext.streamId ?? '',
  agreementId: entityContext.agreementId ?? '',
  scope: entityContext.scope
})

const resolveComponentName = (definition: { componentName?: unknown }) => {
  if (!('componentName' in definition)) {
    return ''
  }

  return String(definition.componentName)
}

const canAccessExtensionOperation = async (
  authContext: AuthContext,
  db: Kysely<Database>,
  entityContext: ExtensionEntityContext,
  rbac: GcsExtensionRbacRequirement
) => await canAccessExtensionEntity(authContext, rbac, entityContext, db)

/** Lists agreement-create descriptors enabled for the entity and permitted by canAccessExtensionOperation. */
export const listExtensionCreateActionItems = async (
  db: Kysely<Database>,
  authContext: AuthContext,
  operation: GcsExtensionCreateOperation,
  entityContext: ExtensionEntityContext
): Promise<ExtensionCreateActionItem[]> => {
  const extensions = await getRegisteredExtensions()
  const items: ExtensionCreateActionItem[] = []

  for (const extension of extensions) {
    const config = await getExtensionConfigurationForEntity(db, extension.key, entityContext)
    if (!config) continue

    const createActions = (extension.client.createActions ?? []).filter(action => action.operation === operation)
    for (const createAction of createActions) {
      const componentName = resolveComponentName(createAction)
      if (!componentName) continue

      const canAccessAction = await canAccessExtensionOperation(authContext, db, entityContext, createAction.rbac)
      if (!canAccessAction) continue

      items.push({
        extensionKey: extension.key,
        actionId: createAction.id,
        operation: createAction.operation,
        mode: createAction.mode,
        value: createAction.value ?? `extension:${extension.key}:${createAction.operation}:${createAction.id}`,
        label: createAction.label,
        icon: createAction.icon,
        componentName,
        config: config as GcsExtensionJsonConfig,
        context: buildExtensionAgreementOperationContext(operation, entityContext),
        rbac: createAction.rbac
      })
    }
  }

  return items
}

/** Lists payment-amount calculators enabled for the entity and permitted by canAccessExtensionOperation. */
export const listExtensionPaymentAmountCalculatorItems = async (
  db: Kysely<Database>,
  authContext: AuthContext,
  operation: 'agreement.payments.create',
  entityContext: ExtensionEntityContext
): Promise<ExtensionPaymentAmountCalculatorItem[]> => {
  const extensions = await getRegisteredExtensions()
  const items: ExtensionPaymentAmountCalculatorItem[] = []

  for (const extension of extensions) {
    const config = await getExtensionConfigurationForEntity(db, extension.key, entityContext)
    if (!config) continue

    const calculators = (extension.client.paymentAmountCalculators ?? [])
      .filter(calculator => calculator.operation === operation)

    for (const calculator of calculators) {
      const componentName = resolveComponentName(calculator)
      if (!componentName) continue

      const canAccessAction = await canAccessExtensionOperation(authContext, db, entityContext, calculator.rbac)
      if (!canAccessAction) continue

      items.push({
        extensionKey: extension.key,
        calculatorId: calculator.id,
        operation: calculator.operation,
        value: calculator.value ?? `extension:${extension.key}:${calculator.operation}:${calculator.id}`,
        label: calculator.label,
        componentName,
        config: config as GcsExtensionJsonConfig,
        context: buildExtensionAgreementOperationContext(operation, entityContext),
        rbac: calculator.rbac
      })
    }
  }

  return items
}
