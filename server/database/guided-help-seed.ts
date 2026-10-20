import type { Transaction } from 'kysely'
import type { Database, JsonValue } from '~~/shared/types/database'
import { agreementTypeGuide } from '../../shared/guided-help/agreement-type-guide'
import { riskAssessmentGuide } from '../../shared/guided-help/risk-assessment-guide'
import { addressTypeGuide } from '../../shared/guided-help/address-type-guide'
import { createPublication, publishDefinition } from '../utils/system-publication'

/**
 * Adds the System example after the captured demo restores its publication sequences.
 * @param db - Owning final-seed transaction.
 */
export const seedGuidedHelpExample = async (db: Transaction<Database>): Promise<void> => {
  const administrator = await db.selectFrom('user').select('id').where('email', '=', 'root@example.com').where('_deleted', '=', false).executeTakeFirstOrThrow()
  const publicationActor = await db.selectFrom('Common_User').select('id')
    .where('egcs_cn_authuserid', '=', String(administrator.id)).where('_deleted', '=', false).executeTakeFirstOrThrow()
  const globalAdministrators = await db.selectFrom('role').innerJoin('role_permission', 'role_permission.role_id', 'role.id')
    .select('role.id').where('role.agency_id', 'is', null).where('role._deleted', '=', false)
    .where('role_permission._deleted', '=', false).where('role_permission.subject', '=', 'system')
    .where('role_permission.access_level', '=', 'manager').execute()
  for (const role of globalAdministrators) {
    const existing = await db.selectFrom('role_permission').select('id').where('role_id', '=', role.id)
      .where('subject', '=', 'guided_help').where('_deleted', '=', false).executeTakeFirst()
    if (!existing) await db.insertInto('role_permission').values({ role_id: role.id, subject: 'guided_help', access_level: 'manager', can_manage_assignments: false }).execute()
  }
  const roles = await db.selectFrom('role').select('id').where('_deleted', '=', false)
    .where(eb => eb.or([eb('agency_id', '=', '21'), eb('agency_id', 'is', null)]))
    .orderBy('id').execute()
  const roleIds = roles.map(role => String(role.id))
  for (const example of [
    { document: addressTypeGuide, screens: ['agency.general', 'agency.address-types'] },
    { document: agreementTypeGuide, screens: ['agency.agreement-types'] },
    { document: riskAssessmentGuide, screens: ['agreements.list'] }
  ]) {
    const document = example.document as unknown as JsonValue
    const guideId = await createPublication(db, 'guided_help')
    await db.insertInto('Common_Guided_Help').values({
      id: guideId, egcs_cn_ownertype: 'system', egcs_cn_agency: null,
      egcs_cn_document: document, egcs_cn_shared: true, egcs_cn_clonedfromversion: null
    }).execute()
    const guide = await publishDefinition(db, { publicationId: guideId, kind: 'guided_help', definition: document, actorId: String(publicationActor.id) })
    if (!guide.publicationVersionId) throw new Error('System guided-help example publication did not produce a version')
    const catalogId = await createPublication(db, 'guided_help_catalog')
    const screens = example.screens
    await db.insertInto('Agency_Guided_Help').values({
      id: catalogId, egcs_ay_agency: '21', egcs_ay_guide: guideId,
      egcs_ay_sourceversion: guide.publicationVersionId,
      egcs_ay_discoveryscreens: JSON.stringify(screens), egcs_ay_roles: JSON.stringify(roleIds), egcs_ay_enabled: true
    }).execute()
    await publishDefinition(db, {
      publicationId: catalogId, kind: 'guided_help_catalog', actorId: String(publicationActor.id),
      definition: { formatVersion: 1, sourceVersionId: guide.publicationVersionId, discoveryScreens: screens, roles: roleIds, enabled: true }
    })
  }
}
