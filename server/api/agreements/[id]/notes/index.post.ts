import { createAgreementNote } from '~~/server/utils/agreement-notes'

// Authorization is enforced by the note service before accessing the parent or note.
// eslint-disable-next-line local/require-authorize
export default defineEventHandler(createAgreementNote)
