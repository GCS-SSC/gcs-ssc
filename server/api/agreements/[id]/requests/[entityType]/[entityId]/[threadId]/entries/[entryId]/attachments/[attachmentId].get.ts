import { defineEventHandler } from 'h3'
import { requireAgreementRequestId } from '~~/server/utils/agreement-requests'
import { authorizeAgreementRequestAttachment, readAgreementRequestAttachment } from '~~/server/utils/agreement-request-files'

export default defineEventHandler(async event => {
  const identity = {
    threadId: await requireAgreementRequestId(event, 'threadId'),
    entryId: await requireAgreementRequestId(event, 'entryId'),
    attachmentId: await requireAgreementRequestId(event, 'attachmentId')
  }
  const authorized = await authorizeAgreementRequestAttachment(event, identity)
  return await readAgreementRequestAttachment(event, authorized)
})
