/** A presentation-only document, reusable by future read-only submission views. */
export type SubmittedAnswer = {
  label: string
  text?: string
  children?: SubmittedAnswer[]
  columns?: string[]
  rows?: string[][]
}
export type SubmittedSection = { title: string; description: string; answers: SubmittedAnswer[] }
export type SubmittedForm = { title: string; description: string; sections: SubmittedSection[] }
export type SubmittedApplication = { submittedAt: string; forms: SubmittedForm[] }
type Data = Record<string, unknown>
export const submissionRecord = (value: unknown): Data =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Data : {}
const records = (value: unknown): Data[] => Array.isArray(value) ? value.map(submissionRecord) : []
const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
const scalar = (value: unknown): string => value === null || value === undefined ? '' : String(value)
/** Parse serialized answer collections while retaining malformed values as text.
 * @param value - Saved answer.
 * @returns Parsed collection or original scalar.
 */
const decode = (value: unknown): unknown => {
  if (typeof value !== 'string' || !['[', '{'].includes(value.trim().charAt(0))) return value
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}
/**
 * Resolve saved bilingual content without consulting a live form or reference catalog.
 * @param value - Saved value to present.
 * @param locale - Current interface language.
 * @param fallback - Label used when saved content is absent.
 * @returns Saved localized label.
 */
export const submissionLabel = (value: unknown, locale: string, fallback = ''): string => {
  if (typeof value === 'string') return value
  const data = submissionRecord(value)
  return scalar(data[locale] || data.en || data.fr || fallback)
}
/**
 * Turn retained submission evidence into reading sections. Never evaluate current form logic.
 * @param snapshot - Retained submission evidence.
 * @param locale - Current interface language.
 * @param translate - Host interface message resolver.
 * @returns Read-only presentation document.
 */
export const readSubmittedApplication = (
  snapshot: unknown, locale: string, translate: (key: string) => string
): SubmittedApplication => {
  const source = submissionRecord(snapshot)
  const label = (value: unknown, fallback = '') => submissionLabel(value, locale, fallback)
  const word = (key: string) => translate(`submitted_application.${key}`)
  const humanKey = (key: string) => key.replace(/[_-]/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2')
  /**
   * Present unknown saved values without discarding data.
   * @param name - Visible answer label.
   * @param value - Saved value to present.
   * @returns Structured answer.
   */
  const generic = (name: string, value: unknown): SubmittedAnswer => {
    const parsed = decode(value)
    if (Array.isArray(parsed)) return { label: name, children: parsed.map((entry, index) => generic(`${word('entry')} ${index + 1}`, entry)) }
    if (parsed !== null && typeof parsed === 'object') {
      const data = submissionRecord(parsed)
      if (Object.keys(data).every(key => ['en', 'fr'].includes(key))) return { label: name, text: label(data) }
      return { label: name, children: Object.entries(data).map(([key, entry]) => generic(humanKey(key), entry)) }
    }
    return { label: name, text: typeof parsed === 'boolean' ? word(parsed ? 'yes' : 'no') : scalar(parsed) }
  }
  const forms: SubmittedForm[] = []
  for (const item of records(source.items)) {
    const definition = submissionRecord(item.definition)
    const questions = records(definition.questions)
    const answers = submissionRecord(item.answers)
    const used = new Set<string>()
    const questionMap = new Map(questions.map(question => [scalar(question.id), question]))
    const choiceLabel = (options: unknown, value: unknown) => {
      const choice = records(options).find(option => scalar(option.value ?? option.id) === scalar(value))
      return choice ? label(choice.label, scalar(value)) : scalar(value)
    }
    /**
     * Present a saved question answer.
     * @param questionId - Saved question identifier.
     * @param path - Retained repeat instance identifiers.
     * @returns Retained answer or null when never submitted.
     */
    const answerFor = (questionId: string, path: string[]): SubmittedAnswer | null => {
      const key = [questionId, ...path].join('@')
      if (!Object.prototype.hasOwnProperty.call(answers, key)) return null
      used.add(key)
      const question = questionMap.get(questionId) ?? {}
      const name = label(question.label, humanKey(questionId))
      const value = decode(answers[key])
      const config = submissionRecord(question.config)
      if (question.type === 'select' || question.type === 'radio') return { label: name, text: choiceLabel(question.options, value) }
      if (question.type === 'checkboxes' || question.type === 'multiselect') {
        if (Array.isArray(value)) return { label: name, text: value.map(entry => choiceLabel(question.options, entry)).join('\n') }
      }
      if (question.type === 'list' || question.type === 'repeat') {
        if (Array.isArray(value) && value.every(entry => typeof submissionRecord(entry).id === 'string')) return { label: name, text: records(value).map((entry, index) => scalar(entry.value) || `${word('entry')} ${index + 1}`).join('\n') }
      }
      if (question.type === 'table' && Array.isArray(value) && value.every(entry => Object.keys(submissionRecord(submissionRecord(entry).cells)).length > 0)) {
        const columns = records(question.columns)
        const rows = records(value)
        const known = new Set(columns.map(column => scalar(column.id)))
        const extras = [...new Set(rows.flatMap(row => Object.keys(submissionRecord(row.cells))))].filter(column => !known.has(column))
        const ids = [...columns.map(column => scalar(column.id)), ...extras]
        return { label: name, columns: [...columns.map(column => label(column.label, scalar(column.id))), ...extras.map(humanKey)], rows: rows.map(row => ids.map(column => scalar(submissionRecord(row.cells)[column]))) }
      }
      if (question.type === 'budget' || question.type === 'activities') {
        const structured = submissionRecord(value)
        if (Array.isArray(structured.rows)) {
          const references: Record<string, unknown> = { fiscalYearId: config.fiscalYears, costItemId: config.costItems, subtypeId: config.fundingSubtypes, outcomeIds: config.outcomes, responsiblePartyIds: config.responsibleParties }
          const names: Record<string, string> = { fiscalYearId: 'fiscal_year', costItemId: 'cost_item', subsection: 'subsection', description: 'description', currency: 'currency', totalCost: 'total_cost', programFunding: 'program_funding', percentage: 'percentage', otherFunding: 'other_funding', subtypeId: 'funding_source', amount: 'amount', name: 'name', expectedResults: 'expected_results', startDate: 'start_date', endDate: 'end_date', outcomeIds: 'outcomes', responsiblePartyIds: 'responsible_parties' }
          /**
           * Present an activity or funding row.
           * @param row - Saved structured row.
           * @param index - Zero-based row position.
           * @returns Read-only row details.
           */
          const rowAnswer = (row: Data, index: number): SubmittedAnswer => ({
            label: label(row.name, choiceLabel(config.costItems, row.costItemId) || `${word('entry')} ${index + 1}`),
            children: Object.entries(row).filter(([field]) => field !== 'id' && field !== 'name').map(([field, entry]) => {
              if (field === 'otherFunding' && Array.isArray(entry)) return { label: word('other_funding'), children: records(entry).map((funding, fundingIndex) => rowAnswer(funding, fundingIndex)) }
              const fieldName = names[field] ? word(names[field]) : humanKey(field)
              if (references[field]) return { label: fieldName, text: Array.isArray(entry) ? entry.map(reference => choiceLabel(references[field], reference)).join('\n') : choiceLabel(references[field], entry) }
              return generic(fieldName, entry)
            })
          })
          const savedRows = records(structured.rows)
          if (question.type === 'budget') {
            const summary: SubmittedAnswer = {
              label: word('budget_summary'),
              columns: ['cost_item', 'fiscal_year', 'total_cost', 'program_funding'].map(word),
              rows: savedRows.map(row => [choiceLabel(config.costItems, row.costItemId), choiceLabel(config.fiscalYears, row.fiscalYearId), `${scalar(row.totalCost)} ${scalar(row.currency)}`.trim(), `${scalar(row.programFunding)} ${scalar(row.currency)}`.trim()])
            }
            const summarizedFields = new Set(['costItemId', 'fiscalYearId', 'totalCost', 'programFunding', 'currency'])
            const details = savedRows.map((row, index) => rowAnswer(Object.fromEntries(Object.entries(row).filter(([field]) => !summarizedFields.has(field))), index))
            details.forEach((detail, index) => {
              detail.label = choiceLabel(config.costItems, savedRows[index]?.costItemId) || detail.label
            })
            return { label: name, children: [summary, ...details] }
          }
          return { label: name, children: savedRows.map(rowAnswer) }
        }
      }
      return generic(name, value)
    }
    /**
     * Resolve nested repeats against saved instance paths.
     * @param groups - Saved repeated group definitions.
     * @param path - Retained repeat instance identifiers.
     * @returns Retained answer or null when never submitted.
     */
    const groupAnswers = (groups: unknown, path: string[]): SubmittedAnswer[] => records(groups).flatMap(group => {
      const repeatKey = [scalar(group.repeatFor), ...path].join('@')
      return records(decode(answers[repeatKey])).map((entry, index) => {
        const nextPath = [...path, scalar(entry.id)]
        const childAnswers = strings(group.questionIds).map(questionId => answerFor(questionId, nextPath)).filter((answer): answer is SubmittedAnswer => answer !== null)
        const nested = groupAnswers(group.groups, nextPath)
        return { label: label(group.title, word('entry')).replace(/\{\{\s*item\s*\}\}/g, scalar(entry.value) || String(index + 1)), children: [...childAnswers, ...nested] }
      }).filter(group => group.children.length > 0)
    })
    const sections: SubmittedSection[] = records(definition.pages).map(page => ({
      title: label(page.title), description: label(page.description),
      answers: [...strings(page.questionIds).map(questionId => answerFor(questionId, [])).filter((answer): answer is SubmittedAnswer => answer !== null), ...groupAnswers(page.groups, [])]
    })).filter(section => section.answers.length > 0)
    const remaining = Object.keys(answers).filter(key => !used.has(key)).map(key => {
      const [questionId = key, ...path] = key.split('@')
      const answer = answerFor(questionId, path) ?? generic(humanKey(key), answers[key])
      if (path.length) answer.label = `${answer.label} (${path.join(' / ')})`
      return answer
    })
    if (remaining.length) sections.push({ title: word('additional_answers'), description: '', answers: remaining })
    if (sections.length || Object.keys(definition).length) forms.push({ title: label(definition.title, word('form')), description: label(definition.description), sections })
  }
  // Older/manual evidence can lack a saved form definition; keep its data readable.
  if (!forms.length && Object.keys(source).length) {
    forms.push({ title: word('title'), description: '', sections: [{ title: word('answers'), description: '', answers: Object.entries(source).map(([key, value]) => generic(humanKey(key), value)) }] })
  }
  return { submittedAt: scalar(source.submittedAt), forms }
}
