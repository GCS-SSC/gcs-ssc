export const SYSTEM_LIFECYCLE = {
  publication: {
    states: ['draft', 'published', 'retired'],
    terminalStates: ['retired'],
    transitions: {
      draft: ['published'],
      published: ['published', 'retired'],
      retired: []
    }
  },
  runtime: {
    states: [
      'pending',
      'active',
      'awaiting_action',
      'paused',
      'succeeded',
      'approved',
      'unsuccessful',
      'denied',
      'cancelled',
      'failed'
    ],
    terminalStates: ['succeeded', 'approved', 'unsuccessful', 'denied', 'cancelled', 'failed'],
    transitions: {
      pending: ['active', 'awaiting_action', 'cancelled', 'failed'],
      active: [
        'awaiting_action',
        'paused',
        'succeeded',
        'approved',
        'unsuccessful',
        'denied',
        'cancelled',
        'failed'
      ],
      awaiting_action: [
        'active',
        'paused',
        'succeeded',
        'approved',
        'unsuccessful',
        'denied',
        'cancelled',
        'failed'
      ],
      paused: ['active', 'awaiting_action', 'cancelled', 'failed'],
      succeeded: [],
      approved: [],
      unsuccessful: [],
      denied: [],
      cancelled: [],
      failed: []
    }
  }
} as const

const PUBLICATION_KIND = {
  approvalTemplate: 'approval_template',
  reviewSchema: 'review_schema',
  reviewSetSetup: 'review_set_setup',
  recommendationSchema: 'recommendation_schema',
  recommendationSetSetup: 'recommendation_set_setup',
  workflowSetup: 'workflow_setup'
} as const

export const PUBLICATION_KINDS = Object.values(PUBLICATION_KIND)

const RUNTIME_KIND = {
  workflow: 'workflow',
  reviewSet: 'review_set'
} as const

export const RUNTIME_KINDS = Object.values(RUNTIME_KIND)

const RUNTIME_ITEM_KIND = {
  reviewSet: 'review_set',
  review: 'review',
  recommendationSet: 'recommendation_set',
  recommendation: 'recommendation',
  routingSlip: 'routing_slip',
  approvalStep: 'approval_step'
} as const

export const RUNTIME_ITEM_KINDS = Object.values(RUNTIME_ITEM_KIND)

export type PublicationState = (typeof SYSTEM_LIFECYCLE.publication.states)[number]
export type RuntimeState = (typeof SYSTEM_LIFECYCLE.runtime.states)[number]
export type PublicationKind = (typeof PUBLICATION_KINDS)[number]
export type RuntimeKind = (typeof RUNTIME_KINDS)[number]
export type RuntimeItemKind = (typeof RUNTIME_ITEM_KINDS)[number]

const COMPLETION_DISPOSITION = {
  notApplicable: 'not_applicable',
  noWorkflow: 'no_workflow',
  workflowStarted: 'workflow_started'
} as const

export const COMPLETION_DISPOSITIONS = Object.values(COMPLETION_DISPOSITION)
export type CompletionDisposition = (typeof COMPLETION_DISPOSITIONS)[number]

export const PUBLICATION_TERMINAL_STATES: ReadonlySet<PublicationState> = new Set(
  SYSTEM_LIFECYCLE.publication.terminalStates
)

export const RUNTIME_TERMINAL_STATES: ReadonlySet<RuntimeState> = new Set(SYSTEM_LIFECYCLE.runtime.terminalStates)

export const canTransitionPublication = (from: PublicationState, to: PublicationState): boolean =>
  (SYSTEM_LIFECYCLE.publication.transitions[from] as readonly PublicationState[]).includes(to)

export const canTransitionRuntime = (from: RuntimeState, to: RuntimeState): boolean =>
  (SYSTEM_LIFECYCLE.runtime.transitions[from] as readonly RuntimeState[]).includes(to)
