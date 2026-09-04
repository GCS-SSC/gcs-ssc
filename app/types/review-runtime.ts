export type ReviewRuntimeStatus = 'empty' | 'in_progress' | 'completed'

export type ReviewRuntimeNavigationRow = {
  key: string
  label: string
  status: ReviewRuntimeStatus
}

export type ReviewRuntimeNavigationItem = {
  key: string
  label: string
  icon: string
  value: string
  status?: ReviewRuntimeStatus
  rows: ReviewRuntimeNavigationRow[]
}

export type ReviewRuntimeQuestionOption = {
  label: string
  description: string
  value: string
}

export type ReviewRuntimeQuestionHelpItem = {
  label: string
  content: string
  value: string
}
