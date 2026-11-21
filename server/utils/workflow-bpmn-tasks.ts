/* eslint-disable jsdoc/require-jsdoc -- Read-only projection of published task definitions and working workflow owners. */
import type { Kysely, Selectable } from 'kysely'
import type { WorkflowBpmnTask } from '@gcs-ssc/extensions'
import type { PublicationKind } from '~~/shared/constants/system-lifecycle'
import type { Database, JsonValue } from '~~/shared/types/database'
import { selectActiveStructuralRoleIds } from './active-user-scopes'
import { readPublishedApprovalTemplate } from './approval-template-versioning'
import { readPublishedDataCollectionSetup } from './data-collection-setup-versioning'
import { isAssignableGroup } from './group-eligibility'
import { readPublishedRecommendationPlan } from './recommendation-setup-versioning'
import { readPublishedReviewSchema } from './review-schema-versioning'
import { readPublishedReviewSetup } from './review-setup-versioning'
import type { PublishedPublicationReference } from './review-setup-versioning'
import { PublishedDefinitionUnavailableError, readCurrentPublishedDefinition } from './system-publication'

type Db = Kysely<Database>
type Locale = 'en' | 'fr'
type Member = Selectable<Database['Common_Workflow_Setup_Member']>
type OwnerRow = Selectable<Database['Common_Workflow_Setup_Member_Owner']>
type OwnerTarget =
  | { kind: 'user' | 'group'; id: string }
  | { kind: 'initiator' | 'unassigned' }

type Task = Omit<WorkflowBpmnTask, 'owner'> & { target: OwnerTarget }
type ApprovalStages = ReturnType<typeof readPublishedApprovalTemplate>['steps']
type NestedTask = Pick<Task, 'id' | 'label' | 'target'> & { approvals?: ApprovalStages }

const configuredOwner = (user?: string | null, group?: string | null): OwnerTarget | null => {
  if (group) return { kind: 'group', id: String(group) }
  return user ? { kind: 'user', id: String(user) } : null
}

const workflowOwner = (owners: OwnerRow[], id: string): OwnerTarget => {
  const row = owners.find(owner => String(owner.egcs_cn_reviewsetup
    ?? owner.egcs_cn_recommendationsetup ?? owner.egcs_cn_datacollection) === id)
  return configuredOwner(row?.egcs_cn_defaultowner, row?.egcs_cn_defaultgroup) ?? { kind: 'initiator' }
}

const localized = (locale: Locale, en: string, fr: string) => locale === 'fr' ? fr : en

const stageTasks = (steps: ApprovalStages, prefix: string, locale: Locale, entry: string[], groupLabel?: string): Task[] => {
  let predecessors = entry
  return [...steps].sort((left, right) => left.sequence - right.sequence).map(step => {
    const id = `${prefix}:approval:${step.stepId}`
    const task: Task = {
      id,
      label: localized(locale, step.nameEn, step.nameFr),
      groupLabel,
      predecessors,
      target: configuredOwner(step.defaultUser, step.defaultGroup) ?? { kind: 'unassigned' }
    }
    predecessors = [id]
    return task
  })
}

const setTasks = (members: NestedTask[], sequential: boolean, locale: Locale): { tasks: Task[]; exits: string[] } => {
  const tasks: Task[] = []
  const exits: string[] = []
  for (const member of members) {
    const { approvals, ...task } = member
    const previous = exits.at(-1)
    tasks.push({ ...task, predecessors: sequential && previous ? [previous] : [] })
    const stages = stageTasks(approvals ?? [], task.id, locale, [task.id], task.label)
    tasks.push(...stages)
    exits.push(stages.at(-1)?.id ?? task.id)
  }
  return { tasks, exits: sequential ? exits.slice(-1) : exits }
}

const currentDefinition = async (db: Db, id: string, kind: PublicationKind): Promise<JsonValue | null> => {
  try {
    return (await readCurrentPublishedDefinition(db, id, kind)).definition
  } catch (error) {
    if (error instanceof PublishedDefinitionUnavailableError) return null
    throw error
  }
}

const pinnedDefinition = async (db: Db, reference: PublishedPublicationReference) => await db
  .selectFrom('Common_Publication_Version')
  .innerJoin('Common_Publication', 'Common_Publication.id', 'Common_Publication_Version.egcs_cn_publication')
  .select('Common_Publication_Version.egcs_cn_definition as definition')
  .where('Common_Publication.id', '=', reference.publicationId)
  .where('Common_Publication.egcs_cn_kind', '=', reference.publicationKind)
  .where('Common_Publication_Version.id', '=', reference.publicationVersionId)
  .where('Common_Publication_Version.egcs_cn_version', '=', reference.publicationVersion)
  .where('Common_Publication._deleted', '=', false)
  .executeTakeFirst()

const scopedApproval = async (db: Db, agencyId: string, id: string, reference?: PublishedPublicationReference) => {
  const template = await db.selectFrom('Common_Approval_Template').select('id')
    .where('id', '=', id).where('egcs_cn_agency', '=', agencyId).where('_deleted', '=', false).executeTakeFirst()
  if (!template) return null
  const definition = reference
    ? (await pinnedDefinition(db, reference))?.definition
    : await currentDefinition(db, id, 'approval_template')
  return definition ? readPublishedApprovalTemplate(definition) : null
}

const memberTasks = async (db: Db, agencyId: string, member: Member, owners: OwnerRow[], locale: Locale): Promise<Task[]> => {
  const prefix = String(member.id)
  if (member.egcs_cn_kind === 'review_set' && member.egcs_cn_reviewset) {
    const id = String(member.egcs_cn_reviewset)
    const setup = await db.selectFrom('Common_Review_Set_Setup').select('id')
      .where('id', '=', id).where('egcs_cn_agency', '=', agencyId).where('_deleted', '=', false).executeTakeFirst()
    const definition = setup && await currentDefinition(db, id, 'review_set_setup')
    if (!definition) return []
    const plan = readPublishedReviewSetup(definition)
    if (plan.agencyId !== agencyId || plan.reviewSetupId !== id) return []
    const members = await Promise.all([...plan.members].sort((left, right) => left.order - right.order).map(async item => {
      const schemaVersion = await pinnedDefinition(db, item.schema)
      const schema = schemaVersion && readPublishedReviewSchema(schemaVersion.definition)
      if (!schema || schema.agencyId !== agencyId || schema.reviewSchemaId !== item.schema.publicationId) {
        throw new Error('Unavailable workflow review schema')
      }
      const approval = item.approval && await scopedApproval(db, agencyId, item.approval.publicationId, item.approval)
      return {
        id: `${prefix}:review:${item.memberId}`,
        label: schema.name[locale],
        target: workflowOwner(owners, item.memberId),
        approvals: approval?.steps
      }
    }))
    const { tasks, exits } = setTasks(members, plan.sequential, locale)
    const final = plan.finalApproval && await scopedApproval(db, agencyId, plan.finalApproval.publicationId, plan.finalApproval)
    return final
      ? [...tasks, ...stageTasks(final.steps, `${prefix}:final`, locale, exits,
          localized(locale, final.nameEn, final.nameFr))]
      : tasks
  }
  if (member.egcs_cn_kind === 'recommendation_set' && member.egcs_cn_recommendationset) {
    const id = String(member.egcs_cn_recommendationset)
    const setup = await db.selectFrom('Common_Recommendation_Set_Setup').select('id')
      .where('id', '=', id).where('egcs_cn_agency', '=', agencyId).where('_deleted', '=', false).executeTakeFirst()
    const definition = setup && await currentDefinition(db, id, 'recommendation_set_setup')
    if (!definition) return []
    const plan = readPublishedRecommendationPlan(definition)
    if (plan.agencyId !== agencyId || plan.recommendationSetId !== id) return []
    const members = [...plan.members].sort((left, right) => left.order - right.order).map(item => ({
      id: `${prefix}:recommendation:${item.memberId}`,
      label: localized(locale, item.schemaNameEn, item.schemaNameFr),
      target: workflowOwner(owners, item.memberId),
      approvals: item.approval?.steps
    }))
    const { tasks, exits } = setTasks(members, true, locale)
    const final = plan.finalApproval?.definition
    return final
      ? [...tasks, ...stageTasks(final.steps, `${prefix}:final`, locale, exits,
          localized(locale, final.nameEn, final.nameFr))]
      : tasks
  }
  if (member.egcs_cn_kind === 'data_collection' && member.egcs_cn_datacollection) {
    const id = String(member.egcs_cn_datacollection)
    const setup = await db.selectFrom('Common_Data_Collection_Setup').select('id')
      .where('id', '=', id).where('egcs_cn_agency', '=', agencyId).where('_deleted', '=', false).executeTakeFirst()
    const definition = setup && await currentDefinition(db, id, 'data_collection_setup')
    if (!definition) return []
    const plan = readPublishedDataCollectionSetup(definition)
    if (!plan || plan.agencyId !== agencyId || plan.dataCollectionId !== id) return []
    const { tasks } = setTasks([{
      id: `${prefix}:collection:${id}`,
      label: localized(locale, plan.nameEn, plan.nameFr),
      target: workflowOwner(owners, id),
      approvals: plan.approval?.definition.steps
    }], true, locale)
    return tasks
  }
  if (member.egcs_cn_kind === 'approval_template' && member.egcs_cn_approvaltemplate) {
    const template = await scopedApproval(db, agencyId, String(member.egcs_cn_approvaltemplate))
    return template ? stageTasks(template.steps, prefix, locale, []) : []
  }
  return []
}

const targetKey = (target: OwnerTarget) => 'id' in target ? `${target.kind}:${target.id}` : target.kind

const resolveTaskOwners = async (db: Db, agencyId: string, locale: Locale, tasks: Task[]) => {
  const targets = new Map(tasks.map(task => [targetKey(task.target), task.target]))
  const userIds = [...targets.values()].flatMap(target => target.kind === 'user' ? [target.id] : [])
  const scopedUsers = userIds.length
    ? await db.selectFrom('Common_User')
        .innerJoin('user', 'user.id', 'Common_User.egcs_cn_authuserid')
        .innerJoin('user_role_assignment', 'user_role_assignment.user_id', 'user.id')
        .innerJoin('role', 'role.id', 'user_role_assignment.role_id')
        .select(['Common_User.id as id', 'Common_User.egcs_cn_name as name']).distinct()
        .where('Common_User.id', 'in', userIds).where('Common_User._deleted', '=', false)
        .where('user._deleted', '=', false).where('user_role_assignment._deleted', '=', false)
        .where('role.id', 'in', selectActiveStructuralRoleIds(db))
        .where(eb => eb.or([eb('role.agency_id', '=', agencyId), eb('role.agency_id', 'is', null)]))
        .execute()
    : []
  const users = new Map(scopedUsers.map(user => [String(user.id), user.name]))
  return new Map(await Promise.all([...targets].map(async ([key, target]): Promise<[string, WorkflowBpmnTask['owner']]> => {
    if (target.kind === 'group') {
      const row = await db.selectFrom('Common_Group').select(['egcs_cn_name_en', 'egcs_cn_name_fr'])
        .where('id', '=', target.id).where('egcs_cn_agency', '=', agencyId).where('_deleted', '=', false).executeTakeFirst()
      return [key, { key, kind: 'group', label: row ? localized(locale, row.egcs_cn_name_en, row.egcs_cn_name_fr) : '',
        unavailable: !row || !await isAssignableGroup(db, target.id, agencyId) }]
    }
    if (target.kind === 'user') {
      return [key, { key, kind: 'user', label: users.get(target.id) ?? '', unavailable: !users.has(target.id) }]
    }
    return [key, { key, kind: target.kind, label: '', unavailable: false }]
  })))
}

export const readWorkflowBpmnTasks = async (
  db: Db, agencyId: string, workflowSetupId: string, locale: Locale
): Promise<Record<string, WorkflowBpmnTask[]>> => {
  // The dispatcher authorizes read access before calling. Keep catalog access contained to that Agency.
  const members = await db.selectFrom('Common_Workflow_Setup_Member')
    .innerJoin('Common_Workflow_Setup', 'Common_Workflow_Setup.id', 'Common_Workflow_Setup_Member.egcs_cn_workflowsetup')
    .selectAll('Common_Workflow_Setup_Member')
    .where('Common_Workflow_Setup.id', '=', workflowSetupId).where('Common_Workflow_Setup.egcs_cn_agency', '=', agencyId)
    .where('Common_Workflow_Setup._deleted', '=', false).where('Common_Workflow_Setup_Member._deleted', '=', false)
    .orderBy('Common_Workflow_Setup_Member.egcs_cn_sequence', 'asc').execute()
  if (members.length === 0) return {}
  const mappings = await db.selectFrom('Common_Workflow_Setup_Member_Owner').selectAll()
    .where('egcs_cn_workflowsetupmember', 'in', members.map(member => String(member.id)))
    .where('_deleted', '=', false).orderBy('id', 'asc').execute()
  const byMember = await Promise.all(members.map(async member => {
    const id = String(member.id)
    return {
      id,
      tasks: await memberTasks(db, agencyId, member, mappings.filter(owner => String(owner.egcs_cn_workflowsetupmember) === id), locale)
    }
  }))
  const owners = await resolveTaskOwners(db, agencyId, locale, byMember.flatMap(member => member.tasks))
  // Use response-local lane identities so directory IDs never cross the public viewer contract.
  const lanes = new Map([...owners].map(([key, owner], index) => [key, { ...owner, key: `lane-${index + 1}` }]))
  return Object.fromEntries(byMember.map(({ id, tasks }) => [id, tasks.map(({ target, ...task }) => {
    const owner = lanes.get(targetKey(target))
    if (!owner) throw new Error('Missing workflow diagram lane')
    return { ...task, owner }
  })]))
}
