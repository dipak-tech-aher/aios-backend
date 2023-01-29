import { logger } from '../config/logger'
import { InteractionTxn } from '../model'

export const createServiceRequestHistory = async (serviceRequest, t, req) => {
  logger.debug('Creating new ServiceRequest History for ', serviceRequest.intxnId)

  const hist = {
    intxnId: serviceRequest.intxnId,
    fromEntity: req.departmentId,
    fromRole: req.roleId,
    toEntity: req.departmentId,
    toRole: req.roleId,
    intxnStatus: serviceRequest.currStatus,
    flwId: 'A',
    flwCreatedBy: serviceRequest.createdBy,
    flwAction: 'A'
  }

  const response = await InteractionTxn.create(hist, { transaction: t })
  return response
}
