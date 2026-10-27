/* eslint-disable jsdoc/require-jsdoc -- Durable notification operations use explicit transaction and provider boundaries. */
import { nanoid } from 'nanoid'
import type { Kysely, Selectable, Transaction, Updateable } from 'kysely'
import { z } from 'zod'
import type { GcsExtensionJsonConfig, GcsNotificationMapping } from '@gcs-ssc/extensions'
import { lockGcsExtensionLifecycleScope } from '@gcs-ssc/extensions/server'
import { NOTIFICATION_NOTIFIERS, type ApprovalNotificationFields } from '~~/shared/utils/notification-notifiers'
import type { CommonNotificationTable, Database } from '~~/shared/types/database'
import { createNotificationSecretReader, loadNotificationProvider, readStreamNotificationSelection, resolveStreamNotificationProvider } from './notification-provider'
import { runBoundedExtensionOperation } from './extension-admission'
import { resolveApprovalNotificationDescriptor, resolveApprovalNotificationScope } from './notification-descriptors'

type Db = Kysely<Database> | Transaction<Database>
type NotificationRow = Selectable<CommonNotificationTable>
const RECOVERY_WINDOW_MS = 7 * 86_400_000
const DeliveryContextSchema = z.record(z.string(), z.json())

const readApprovalTarget = async (db: Db, runtimeItemId: string) => await db.selectFrom('Common_Approval')
  .innerJoin('Common_Runtime_Item as Step', 'Step.id', 'Common_Approval.egcs_cn_runtimeitem')
  .innerJoin('Common_Routing_Slip as Slip', 'Slip.id', 'Common_Approval.egcs_cn_routingslip')
  .innerJoin('Common_Runtime_Item as Routing', 'Routing.id', 'Slip.egcs_cn_runtimeitem')
  .innerJoin('Common_Runtime as Runtime', 'Runtime.id', 'Step.egcs_cn_runtime')
  .innerJoin('Common_Approval_Template as Template', 'Template.id', 'Slip.egcs_cn_approvaltemplate')
  .select([
    'Common_Approval.id as approvalId', 'Common_Approval.egcs_cn_assigneduser as userId',
    'Common_Approval.egcs_cn_assignedgroup as groupId', 'Template.egcs_cn_agency as agencyId',
    'Slip.egcs_cn_entitytype as entityType', 'Slip.egcs_cn_entityid as entityId'
  ])
  .where('Step.id', '=', runtimeItemId).where('Step.egcs_cn_kind', '=', 'approval_step')
  .where('Step.egcs_cn_state', '=', 'awaiting_action').where('Step._deleted', '=', false)
  .where('Routing.egcs_cn_state', '=', 'awaiting_action').where('Routing._deleted', '=', false)
  .where('Runtime.egcs_cn_state', 'not in', ['approved', 'denied', 'cancelled', 'failed', 'succeeded', 'unsuccessful'])
  .where('Runtime._deleted', '=', false).where('Slip._deleted', '=', false)
  .where('Common_Approval.egcs_cn_approvalvalue', 'is', null).executeTakeFirst()

const readRecipient = async (db: Db, target: NonNullable<Awaited<ReturnType<typeof readApprovalTarget>>>) => {
  if (target.userId !== null) {
    const user = await db.selectFrom('Common_User').select(['egcs_cn_email', 'egcs_cn_name'])
      .where('id', '=', String(target.userId)).where('_deleted', '=', false).executeTakeFirst()
    return user
      ? { kind: 'user' as const, id: String(target.userId), email: user.egcs_cn_email,
          name: user.egcs_cn_name, nameEn: user.egcs_cn_name, nameFr: user.egcs_cn_name }
      : null
  }
  if (target.groupId !== null) {
    const group = await db.selectFrom('Common_Group').select(['egcs_cn_email', 'egcs_cn_name_en', 'egcs_cn_name_fr'])
      .where('id', '=', String(target.groupId)).where('egcs_cn_agency', '=', String(target.agencyId))
      .where('_deleted', '=', false).executeTakeFirst()
    return group
      ? { kind: 'group' as const, id: String(target.groupId), email: group.egcs_cn_email,
          name: `${group.egcs_cn_name_en} / ${group.egcs_cn_name_fr}`,
          nameEn: group.egcs_cn_name_en, nameFr: group.egcs_cn_name_fr }
      : null
  }
  return null
}

export const enqueueApprovalNotification = async (
  trx: Transaction<Database>, runtimeItemId: string, activation = nanoid()
): Promise<void> => {
  // A resumed or reassigned turn invalidates every unsent intent from its predecessor.
  await trx.updateTable('Common_Notification').set({
    egcs_cn_status: 'cancelled', egcs_cn_leaseowner: null, egcs_cn_leaseexpiry: null, egcs_cn_updated: new Date()
  }).where('egcs_cn_runtimeitem', '=', runtimeItemId).where('egcs_cn_activation', '!=', activation)
    .where('egcs_cn_status', 'in', ['pending', 'processing', 'uncertain']).execute()
  const target = await readApprovalTarget(trx, runtimeItemId)
  if (!target) return
  const scope = await resolveApprovalNotificationScope(trx, { entityType: target.entityType, entityId: String(target.entityId) })
  if (!scope || scope.agencyId !== String(target.agencyId)) return
  const selection = await readStreamNotificationSelection(trx, scope)
  if (!selection) return
  try {
    const provider = await loadNotificationProvider(selection.providerKey)
    if (!provider || !provider.adapter.resolveMapping({ agencyConfig: selection.agencyConfig, streamId: scope.streamId, streamConfig: selection.streamConfig, notifierId: 'approval.action_required' })) return
  } catch {
    // Preserve intent when a selected provider's configuration or module needs repair.
  }
  const recipient = await readRecipient(trx, target)
  if (!recipient) return
  await trx.insertInto('Common_Notification').values({
    egcs_cn_agency: scope.agencyId, egcs_cn_stream: scope.streamId, egcs_cn_approval: String(target.approvalId),
    egcs_cn_runtimeitem: runtimeItemId, egcs_cn_activation: activation,
    egcs_cn_providerkey: selection.providerKey, egcs_cn_notifier: 'approval.action_required',
    egcs_cn_recipientkind: recipient.kind, egcs_cn_recipientid: recipient.id,
    egcs_cn_recipientemail: recipient.email, egcs_cn_recipientname: recipient.name,
    egcs_cn_reference: `gcs-ssc:${nanoid(32)}`,
    egcs_cn_payload: {}
  }).onConflict(conflict => conflict.columns(['egcs_cn_approval', 'egcs_cn_activation', 'egcs_cn_recipientkind', 'egcs_cn_recipientid']).doNothing()).execute()
}

export const claimNotification = async (db: Kysely<Database>, workerId: string, now = new Date()) =>
  await db.transaction().execute(async trx => {
    const row = await trx.selectFrom('Common_Notification').selectAll()
      .where('_deleted', '=', false)
      .where(eb => eb.or([
        eb.and([eb('egcs_cn_status', 'in', ['pending', 'uncertain']), eb('egcs_cn_nextattempt', '<=', now)]),
        eb.and([eb('egcs_cn_status', '=', 'processing'), eb('egcs_cn_leaseexpiry', '<=', now)])
      ])).orderBy('id').limit(1).forUpdate().skipLocked().executeTakeFirst()
    if (!row) return null
    await trx.updateTable('Common_Notification').set({
      egcs_cn_status: 'processing', egcs_cn_leaseowner: workerId,
      egcs_cn_leaseexpiry: new Date(now.getTime() + 610_000), egcs_cn_updated: now
    }).where('id', '=', String(row.id)).execute()
    return row
  })

const eligible = async (db: Kysely<Database>, job: NotificationRow) => {
  const target = await readApprovalTarget(db, job.egcs_cn_runtimeitem)
  if (!target || String(target.agencyId) !== job.egcs_cn_agency) return false
  const scope = await resolveApprovalNotificationScope(db, { entityType: target.entityType, entityId: String(target.entityId) })
  if (!scope || scope.agencyId !== job.egcs_cn_agency || scope.streamId !== job.egcs_cn_stream) return false
  const recipient = await readRecipient(db, target)
  return recipient !== null && recipient.kind === job.egcs_cn_recipientkind
    && recipient.id === job.egcs_cn_recipientid && recipient.email === job.egcs_cn_recipientemail
}

const sameMapping = (left: GcsNotificationMapping, right: GcsNotificationMapping): boolean =>
  left.templateId === right.templateId && left.recipientEmail === right.recipientEmail && Object.keys(left.personalisation).length === Object.keys(right.personalisation).length
  && Object.entries(left.personalisation).every(([key, binding]) => {
    const other = right.personalisation[key]
    if (typeof binding === 'string') return other === binding
    if (typeof other !== 'object' || other.fieldId !== binding.fieldId) return false
    const locale = 'locale' in binding ? binding.locale : undefined
    const otherLocale = 'locale' in other ? other.locale : undefined
    const timeZone = 'timeZone' in binding ? binding.timeZone : undefined
    const otherTimeZone = 'timeZone' in other ? other.timeZone : undefined
    return locale === otherLocale && timeZone === otherTimeZone
  })

const renderNotificationPersonalisation = (
  notifierId: string, mapping: GcsNotificationMapping, fields: Record<string, string>
): Record<string, string> => {
  const notifier = NOTIFICATION_NOTIFIERS.find(candidate => candidate.id === notifierId)
  if (!notifier) throw new Error('NOTIFICATION_NOTIFIER_INVALID')
  return Object.fromEntries(Object.entries(mapping.personalisation).map(([placeholder, binding]) => {
    const fieldId = typeof binding === 'string' ? binding : binding.fieldId
    const field = notifier.fields.find(candidate => candidate.id === fieldId)
    if (!field) throw new Error('NOTIFICATION_MAPPING_INVALID')
    if (field.type === 'text' || field.type === 'email') {
      const source = fields[fieldId]
      if (typeof binding !== 'string' || source === undefined) throw new Error('NOTIFICATION_MAPPING_INVALID')
      return [placeholder, source]
    }
    const locale = typeof binding === 'object' && 'locale' in binding ? binding.locale : undefined
    if (locale !== 'en' && locale !== 'fr') throw new Error('NOTIFICATION_MAPPING_LOCALE_INVALID')
    if (field.type === 'localized-text') {
      if (typeof binding !== 'object' || 'timeZone' in binding) throw new Error('NOTIFICATION_MAPPING_INVALID')
      const source = fields[`${fieldId}_${locale}`]
      if (source === undefined) throw new Error('NOTIFICATION_MAPPING_INVALID')
      return [placeholder, source]
    }
    if (typeof binding !== 'object' || !('timeZone' in binding) || !binding.timeZone || /^[+-]/.test(binding.timeZone)) {
      throw new Error('NOTIFICATION_MAPPING_TIME_ZONE_INVALID')
    }
    const source = fields[fieldId]
    if (source === undefined) throw new Error('NOTIFICATION_MAPPING_INVALID')
    const options: Intl.DateTimeFormatOptions = field.type === 'date'
      ? { timeZone: binding.timeZone, dateStyle: 'medium' }
      : { timeZone: binding.timeZone, timeStyle: 'medium' }
    return [placeholder, new Intl.DateTimeFormat(locale, options).format(new Date(source))]
  }))
}

export const processNotificationBatch = async (
  db: Kysely<Database>, workerId: string, limit = 60, now?: Date,
  appOrigin = process.env.NUXT_AUTH_URL ?? ''
): Promise<void> => {
  for (let index = 0; index < limit; index++) {
    const jobNow = now ?? new Date()
    const job = await claimNotification(db, workerId, jobNow)
    if (!job) break
    const scope = { agencyId: job.egcs_cn_agency, streamId: job.egcs_cn_stream, providerKey: job.egcs_cn_providerkey }
    const update = (values: Updateable<CommonNotificationTable>) =>
      db.updateTable('Common_Notification').set(values).where('id', '=', String(job.id))
        .where('egcs_cn_status', '=', 'processing').where('egcs_cn_leaseowner', '=', workerId)
    const finish = async (status: 'completed' | 'cancelled' | 'unresolved') => {
      const finishedAt = now ?? new Date()
      await update({ egcs_cn_status: status, egcs_cn_completedat: finishedAt, egcs_cn_updated: finishedAt,
        egcs_cn_leaseowner: null, egcs_cn_leaseexpiry: null, egcs_cn_lasterror: null }).execute()
    }
    let attemptedAt = job.egcs_cn_firstsendat
    let deliveryContext: GcsExtensionJsonConfig | null = null
    let priorNonAcceptanceProven = false
    try {
      deliveryContext = job.egcs_cn_deliverycontext ? DeliveryContextSchema.parse(job.egcs_cn_deliverycontext) : null
      if (!await eligible(db, job)) {
        await finish('cancelled')
        continue
      }
      const provider = await resolveStreamNotificationProvider(db, scope)
      if (!provider) {
        await finish('cancelled')
        continue
      }
      if (attemptedAt) {
        if (jobNow.getTime() - attemptedAt.getTime() >= RECOVERY_WINDOW_MS) {
          await finish('unresolved')
          continue
        }
        const recover = provider.adapter.recover
        const originalContext = deliveryContext
        const originalAttemptedAt = attemptedAt.toISOString()
        const recovery = originalContext && recover
          ? await runBoundedExtensionOperation('notification:recover', signal => recover({
              agencyId: provider.agencyId, agencyConfig: provider.agencyConfig, streamId: provider.streamId, streamConfig: provider.streamConfig, secrets: provider.secrets, signal,
              deliveryContext: originalContext, reference: job.egcs_cn_reference, attemptedAt: originalAttemptedAt
            }))
          : { kind: 'inconclusive' as const }
        if (recovery.kind === 'found') {
          await finish('completed')
          continue
        }
        if (recovery.kind === 'inconclusive') throw new Error('NOTIFICATION_RECOVERY_INCONCLUSIVE')
        attemptedAt = null
        priorNonAcceptanceProven = true
      }
      const mapping = provider.adapter.resolveMapping({ agencyConfig: provider.agencyConfig, streamId: provider.streamId, streamConfig: provider.streamConfig, notifierId: job.egcs_cn_notifier })
      if (!mapping) throw new Error('NOTIFICATION_MAPPING_UNAVAILABLE')
      const origin = new URL(appOrigin)
      if (!['http:', 'https:'].includes(origin.protocol)) throw new Error('NOTIFICATION_ORIGIN_INVALID')
      const preparedContext = await runBoundedExtensionOperation('notification:prepare', signal => provider.adapter.prepareDelivery({
        agencyId: provider.agencyId, agencyConfig: provider.agencyConfig, streamId: provider.streamId, streamConfig: provider.streamConfig, secrets: provider.secrets, signal
      }))
      // Configuration and the durable send marker share one admission boundary.
      const admittedProvider = await db.transaction().execute(async trx => {
        await lockGcsExtensionLifecycleScope(trx as unknown as Transaction<unknown>, scope.providerKey, scope.agencyId, scope.streamId)
        const freshProvider = await resolveStreamNotificationProvider(trx, scope)
        if (!freshProvider || !await eligible(trx, job)) {
          await trx.updateTable('Common_Notification').set({
            egcs_cn_status: 'cancelled', egcs_cn_completedat: jobNow, egcs_cn_updated: jobNow,
            egcs_cn_leaseowner: null, egcs_cn_leaseexpiry: null
          }).where('id', '=', String(job.id)).where('egcs_cn_status', '=', 'processing')
            .where('egcs_cn_leaseowner', '=', workerId).execute()
          return null
        }
        const freshMapping = freshProvider.adapter.resolveMapping({ agencyConfig: freshProvider.agencyConfig,
          streamId: freshProvider.streamId, streamConfig: freshProvider.streamConfig, notifierId: job.egcs_cn_notifier })
        if (!freshMapping || !sameMapping(mapping, freshMapping)) throw new Error('NOTIFICATION_MAPPING_CHANGED')
        const admittedAt = now ?? new Date()
        const target = await readApprovalTarget(trx, job.egcs_cn_runtimeitem)
        if (!target) throw new Error('NOTIFICATION_TARGET_UNAVAILABLE')
        const descriptor = await resolveApprovalNotificationDescriptor(trx, { entityType: target.entityType, entityId: String(target.entityId) })
        if (!descriptor || descriptor.canonicalAgencyId !== job.egcs_cn_agency || descriptor.canonicalStreamId !== job.egcs_cn_stream) {
          throw new Error('NOTIFICATION_TARGET_UNAVAILABLE')
        }
        const recipient = await readRecipient(trx, target)
        const instant = admittedAt.toISOString()
        const fields: ApprovalNotificationFields = {
          recipient_name_en: recipient?.nameEn ?? '', recipient_name_fr: recipient?.nameFr ?? '',
          recipient_email: recipient?.email ?? '',
          item_reference: descriptor.reference, item_title: descriptor.title,
          approval_url: new URL(`/en${descriptor.path}`, origin).toString(),
          agency_name_en: descriptor.agencyNameEn, agency_name_fr: descriptor.agencyNameFr,
          program_name_en: descriptor.programNameEn, program_name_fr: descriptor.programNameFr,
          stream_name_en: descriptor.streamNameEn, stream_name_fr: descriptor.streamNameFr, agreement_number: descriptor.agreementNumber,
          today_date: instant, current_time: instant
        }
        const recipientFieldId = freshMapping.recipientEmail
        const recipientField = NOTIFICATION_NOTIFIERS.find(notifier => notifier.id === job.egcs_cn_notifier)?.fields
          .find(field => field.id === recipientFieldId)
        if (!recipientFieldId || recipientField?.type !== 'email') throw new Error('NOTIFICATION_RECIPIENT_MAPPING_INVALID')
        const recipientEmail = z.email().safeParse(fields[recipientField.id])
        if (!recipientEmail.success) throw new Error('NOTIFICATION_RECIPIENT_EMAIL_INVALID')
        const personalisation = renderNotificationPersonalisation(job.egcs_cn_notifier, freshMapping, fields)
        // A crash after this committed marker requires recovery before another send.
        const admitted = await trx.updateTable('Common_Notification').set({ egcs_cn_deliverycontext: preparedContext,
          egcs_cn_firstsendat: admittedAt, egcs_cn_payload: fields, egcs_cn_updated: admittedAt })
          .where('id', '=', String(job.id)).where('egcs_cn_status', '=', 'processing')
          .where('egcs_cn_leaseowner', '=', workerId).returning('id').executeTakeFirst()
        return admitted ? { ...freshProvider, secrets: createNotificationSecretReader(db, scope.providerKey, scope.agencyId), personalisation, admittedAt, recipientEmail: recipientEmail.data } : null
      })
      if (!admittedProvider) continue
      attemptedAt = admittedProvider.admittedAt
      priorNonAcceptanceProven = false
      if (!await eligible(db, job)
        || !await resolveStreamNotificationProvider(db, scope)) {
        await finish('cancelled')
        continue
      }
      const result = await runBoundedExtensionOperation('notification:send', signal => admittedProvider.adapter.send({
        agencyId: admittedProvider.agencyId, agencyConfig: admittedProvider.agencyConfig, streamId: admittedProvider.streamId, streamConfig: admittedProvider.streamConfig, secrets: admittedProvider.secrets, signal,
        deliveryContext: preparedContext, templateId: mapping.templateId, recipientEmail: admittedProvider.recipientEmail,
        personalisation: admittedProvider.personalisation, reference: job.egcs_cn_reference
      }))
      if (result.kind === 'accepted') {
        await finish('completed')
        continue
      }
      // A provider rejection proves no message was accepted and permits a corrected-config retry.
      attemptedAt = null
      priorNonAcceptanceProven = true
      throw new Error(result.retryable ? 'NOTIFICATION_PROVIDER_RETRYABLE_REJECTION' : 'NOTIFICATION_PROVIDER_REJECTED')
    } catch {
      const attempts = job.egcs_cn_attempts + 1
      await update({ egcs_cn_status: attemptedAt ? 'uncertain' : 'pending', egcs_cn_attempts: attempts,
        ...(priorNonAcceptanceProven ? { egcs_cn_payload: {}, egcs_cn_deliverycontext: null } : {}),
        egcs_cn_firstsendat: attemptedAt ?? null,
        egcs_cn_nextattempt: new Date(jobNow.getTime() + Math.min(3_600_000, 300_000 * 2 ** Math.min(attempts - 1, 4))),
        egcs_cn_updated: jobNow, egcs_cn_leaseowner: null, egcs_cn_leaseexpiry: null,
        egcs_cn_lasterror: attemptedAt ? 'NOTIFICATION_RECOVERY_REQUIRED' : 'NOTIFICATION_CONFIGURATION_OR_DELIVERY_FAILED'
      }).execute()
    }
  }
}
