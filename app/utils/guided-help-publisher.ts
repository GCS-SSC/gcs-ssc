import type { HelpCatalog, HelpGuide, HelpOption } from './guided-help-client'

export type PublisherGroup = HelpOption & {
  guides: HelpGuide[]
  catalogs: HelpCatalog[]
  shared: HelpGuide[]
  loaded: boolean
  loading: boolean
  error: boolean
  canEdit: boolean
}
