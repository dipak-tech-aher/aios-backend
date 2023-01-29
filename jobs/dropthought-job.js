import { logger } from '../config/logger'
import { QueryTypes } from 'sequelize'
import {
  sequelize, DTIntegration
} from '../model/index'
import { systemUserId, complaintPrefix, inquiryPrefix, adjustmentPrefix, refundPrefix } from 'config'

import { DTUtils } from '../dropthought/dt-utils'

import { camelCaseConversion } from '../utils/string'

const COUNTRYCODE_PREFIX = '+673'

export const dropThoughtIntegrationJob = async () => {
  logger.debug('Starting dropThoughtIntegrationJob')

  try {
    const dtUtils = new DTUtils()

    const query = `select i.intxn_id,
    i.intxn_type,
    i.intxn_cat_type,
    concat(cu.first_name ,' ',cu.last_name) as customer_name,
    cnt.email,
    cnt.contact_no,
    to_char(i.updated_at,'yyyy-mm-dd hh24:mi:ss') as updated_at,
    p.prod_type,
    i.identification_no
    from interaction as i
    inner join customers cu on cu.customer_id =  i.customer_id
    inner join accounts acc on i.account_id = acc.account_id
    inner join contacts cnt on cu.contact_id = cnt.contact_id
    inner join connections conn on i.connection_id = conn.connection_id
    inner join plan p on CAST(conn.mapping_payload->'plans'->0->'planId' as INT) = p.plan_id
    inner join business_entity be on i.intxn_type = be.code
    inner join business_entity be2 on i.wo_type = be2.code
    inner join business_entity be3 on i.intxn_cat_type = be3.code
    where intxn_type IN ('REQCOMP', 'REQINQ') and survey_req = 'Y' and cu.customer_id = acc.customer_id
    and acc.account_id = conn.account_id
    and i.intxn_id not in (select intxn_id FROM intg_dropthought_results)`

    let rows = await sequelize.query(query, {
      type: QueryTypes.SELECT
    })

    rows = camelCaseConversion(rows)

    if (rows && rows.length > 0) {
      logger.debug('Processing Drop Thought Integration - ' + rows.length + ' rows')

      for (const r of rows) {
        try {
          const tktPrefix = (r.intxnType === 'REQCOMP')
            ? ((r.intxnCatType === 'CATCOMP')
                ? complaintPrefix
                : ((r.intxnCatType === 'CATADJ')
                    ? adjustmentPrefix
                    : ((r.intxnCatType === 'refundPrefix')
                        ? refundPrefix
                        : ''
                      )
                  ))
            : ((r.intxnType === 'REQINQ')
                ? inquiryPrefix
                : ''
              )

          const recType = (r.intxnType === 'REQCOMP')
            ? ((r.intxnCatType === 'CATCOMP')
                ? 'Complaints'
                : ((r.intxnCatType === 'CATADJ')
                    ? 'Adjustments'
                    : ((r.intxnCatType === 'refundPrefix')
                        ? 'Refunds'
                        : ''
                      )
                  ))
            : ((r.intxnType === 'REQINQ')
                ? 'Inquiries'
                : ''
              )

          const contactNbr = (r.contactNo.length <= 7) ? COUNTRYCODE_PREFIX + r.contactNo : r.contactNo

          let response
          let errorFlag = false
          try {
            // console.log({
            //   a: r.customerName,
            //   b: r.email,
            //   c: contactNbr,
            //   d: tktPrefix + r.intxnId,
            //   e: recType,
            //   f: r.updatedAt,
            //   g: r.prodType,
            //   h: r.identificationNo
            // })

            response = await dtUtils.createSurveyParticipant(r.customerName,
              r.email,
              contactNbr,
              tktPrefix + r.intxnId,
              recType,
              r.updatedAt,
              r.prodType,
              r.identificationNo)

            // response = {
            //   status: 'success',
            //   message: 'Test Message',
            //   result: [
            //     {
            //       "id": 2,
            //       "data": "[\"Imagine-1\", \"sudhakar.dropthought.com\", \"112233\", \"Img1000\", \"Service Request\", \"Ser_Type-1\", \"Ser100\"]",
            //       "header": "[\"Account Name\", \"Primary Email ID\", \"Primary Contact Number\", \"Ticket ID\", \"Ticket Type\", \"Service Type\", \"Service Number\"]",
            //       "meta_data": "[\"NAME\", \"EMAIL\", \"PHONE\", \"String\", \"String\", \"String\", \"String\"]",
            //       "question_metadata": null,
            //       "participant_uuid": "e4cb6d2a-d02e-4204-8178-931abe7fb091",
            //       "created_by": 355,
            //       "created_time": "2020-11-03 08:42:56.0",
            //       "modified_by": null,
            //       "modified_time": null
            //     }
            //   ]
            // }
          } catch (error) {
            logger.error(error, 'Error calling createSurveyParticipant')
            errorFlag = true
          }

          const t = await sequelize.transaction()

          try {
            if (errorFlag) {
              await DTIntegration.create({
                intxnId: r.intxnId,
                callStatus: 'F',
                callMessage: response,
                callResult: response.data,
                callTime: sequelize.literal('CURRENT_TIMESTAMP'),
                createdBy: systemUserId,
                updatedBy: systemUserId
              },
              {
                transaction: t
              })
            } else {
              if (response && response.status === 'success') {
                await DTIntegration.create({
                  intxnId: r.intxnId,
                  callResult: response.result,
                  callStatus: 'S',
                  callMessage: response.data,
                  callTime: sequelize.literal('CURRENT_TIMESTAMP'),
                  createdBy: systemUserId,
                  updatedBy: systemUserId
                },
                {
                  transaction: t
                })
              } else {
                await DTIntegration.create({
                  intxnId: r.intxnId,
                  callStatus: 'F',
                  callMessage: response,
                  callResult: response.data,
                  callTime: sequelize.literal('CURRENT_TIMESTAMP'),
                  createdBy: systemUserId,
                  updatedBy: systemUserId
                },
                {
                  transaction: t
                })
              }
            }
            await t.commit()
          } catch (error) {
            logger.error(error)
          } finally {
            if (t && !t.finished) {
              await t.rollback()
            }
          }
        } catch (error) {
          logger.error(error)
        }
      }

      logger.debug('Finished processing Drop Thought Integration')
    }
  } catch (error) {
    logger.error(error, 'Error while updating service request')
  }
}
