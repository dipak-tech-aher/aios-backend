import jsonata from 'jsonata'

const prePaidSummaryTransform = `{
    "customerStatus": customerSummary.return.customerStatus,
    "accountStatus": customerSummary.return.accountStatus,
    "accountBalance": customerSummary.return.context.contextElements[name = 'AccountBalance'].value.$eval(doubleValue),
    "accountCreationDate": customerSummary.return.accountSummary.accountCreationDate,
    "billCycle": customerSummary.return.accountSummary.accountFinancialItem.billCycleCode,
    "lastPayment": customerSummary.return.accountSummary.accountFinancialItem.lastPayment.$eval(value),
    "lastPaymentDate": customerSummary.return.accountSummary.accountFinancialItem.lastPaymentDate,
    "adm1": customerSummary.return.serviceSummary.gsmSupplementItem.adm1.value,
    "ki": customerSummary.return.serviceSummary.gsmSupplementItem.ki.value,
    "pin": customerSummary.return.serviceSummary.gsmSupplementItem.pin.value,
    "pin2": customerSummary.return.serviceSummary.gsmSupplementItem.pin2.value,
    "puk": customerSummary.return.serviceSummary.gsmSupplementItem.puk.value,
    "puk2": customerSummary.return.serviceSummary.gsmSupplementItem.puk2.value,
    "activationDate": serviceStatus.mobile.activationDate,
    "expiryDate": serviceStatus.mobile.activeExpiryDate,
    "mainBalance": serviceStatus.mobile.prepaid.$sum(balance[balanceType ='MainBalance'].$eval(value)),
    "voice": serviceStatus.mobile.prepaid.$sum(balance[balanceType = 'Voice'].$eval(value)),
    "sms": serviceStatus.mobile.prepaid.$sum(balance[balanceType = 'SMS'].$eval(value)),
    "data": serviceStatus.mobile.prepaid.$sum(balance[balanceType = 'Data'].$eval(value)),
    "serviceStatus": serviceStatus.mobile.subscriberStatus,
    "connectionStatus": customerSummary.return.serviceSummary.statusCode,
    "offers": serviceStatus.mobile.prepaid[$.code = 'SUCCESS-001'].balance,
	"icNumber": customerSummary.return.accountSummary.identificationFields.id3Value
}`

export const prepaidSummaryTransformer = jsonata(prePaidSummaryTransform)

const postpaidSummaryTransform = `{
    "customerStatus": customerSummary.return.customerStatus,
    "accountStatus": customerSummary.return.accountStatus,
    "accountBalance": customerSummary.return.context.contextElements[name = 'AccountBalance'].value.$eval(doubleValue),
    "accountCreationDate": customerSummary.return.accountSummary.accountCreationDate,
    "currentBalance": customerSummary.return.accountSummary.accountFinancialItem.currentBalance.$eval(value),
    "billCycle": customerSummary.return.accountSummary.accountFinancialItem.billCycleCode,
    "lastPayment": customerSummary.return.accountSummary.accountFinancialItem.lastPayment.$eval(value),
    "lastPaymentDate": customerSummary.return.accountSummary.accountFinancialItem.lastPaymentDate,
    "adm1": customerSummary.return.serviceSummary.gsmSupplementItem.adm1.value,
    "ki": customerSummary.return.serviceSummary.gsmSupplementItem.ki.value,
    "pin": customerSummary.return.serviceSummary.gsmSupplementItem.pin.value,
    "pin2": customerSummary.return.serviceSummary.gsmSupplementItem.pin2.value,
    "puk": customerSummary.return.serviceSummary.gsmSupplementItem.puk.value,
    "puk2": customerSummary.return.serviceSummary.gsmSupplementItem.puk2.value,
    "grossAmount": customerSummary.return.serviceSummary.$sum(serviceCharges.grossAmount.$eval(value)),
    "netAmount": customerSummary.return.serviceSummary.$sum(serviceCharges.netAmount.$eval(value)),
    "unbilledUsage": customerSummary.return.serviceSummary.unbilledUsage.$eval(value),
    "activationDate": serviceStatus.mobile.activationDate,
    "expiryDate": serviceStatus.mobile.activeExpiryDate,
    "serviceStatus": serviceStatus.mobile.subscriberStatus,
    "connectionStatus": customerSummary.return.serviceSummary.statusCode,
    "mainBalance": serviceStatus.mobile.postpaid.$sum(balance[balanceType ='MainBalance'].$eval(value)),
    "outstandingAmount": serviceStatus.mobile.postpaid.outstandingAmount,
    "billingDetails": serviceStatus.mobile.postpaid.billingDetails,
    "offers": serviceStatus.mobile.postpaid[$.code = 'SUCCESS-001'].balance,
	"icNumber": customerSummary.return.accountSummary.identificationFields.id3Value
}`

export const postpaidSummaryTransformer = jsonata(postpaidSummaryTransform)

const fixedLineSummaryTransform = `{
    "customerStatus": customerSummary.return.customerStatus,    
	"accountStatus": customerSummary.return.accountStatus,    
    "accountBalance": customerSummary.return.context.contextElements[name = 'AccountBalance'].value.$eval(doubleValue),
    "accountCreationDate": customerSummary.return.accountSummary.accountCreationDate,
    "currentBalance": customerSummary.return.accountSummary.accountFinancialItem.currentBalance.$eval(value),
    "billCycle": customerSummary.return.accountSummary.accountFinancialItem.billCycleCode,
    "lastPayment": customerSummary.return.accountSummary.accountFinancialItem.lastPayment.$eval(value),
    "lastPaymentDate": customerSummary.return.accountSummary.accountFinancialItem.lastPaymentDate,
    "grossAmount": customerSummary.return.serviceSummary.$sum(serviceCharges.grossAmount.$eval(value)),
    "netAmount": customerSummary.return.serviceSummary.$sum(serviceCharges.netAmount.$eval(value)),
    "unbilledUsage": customerSummary.return.serviceSummary.unbilledUsage.$eval(value),
    "installationDate": customerSummary.return.serviceSummary.initialInstallationDate,
    "serviceStatus": serviceStatus.fixedLine.status,
    "usageType": serviceStatus.fixedLine.usage.usageType,
    "outstandingAmount": serviceStatus.fixedLine.outstandingAmount,
    "connectionStatus": customerSummary.return.serviceSummary.statusCode,
    "usageLimit": serviceStatus.fixedLine.$sum(usage.$eval(limit)),
    "accumulatedUsage": serviceStatus.fixedLine.$sum(usage.$eval(accumulatedUsage)),
    "billingDetails": serviceStatus.fixedLine.billingDetails,
    "offers": serviceStatus.fixedLine.usage,
	"icNumber": customerSummary.return.accountSummary.identificationFields.id3Value      
}`

export const fixedLineSummaryTransformer = jsonata(fixedLineSummaryTransform)

const customerAccountNbrDetails = `{
    "customerNbr": customerSummary.return.customerSummary.customerUid,
    "accountNbr": customerSummary.return.accountSummary.accountNo
}`

export const customerAccountNbrDetailsTransformer = jsonata(customerAccountNbrDetails)

const ticketDetails = `{
    "ticketNumber" : grid_array.customerDetails.APP_ID,
    "status":grid_array.WorkflowHistory[0].assigned_status,
    "currentDepartment" : grid_array.WorkflowHistory[0].to_dept,    
    "currentRole" : grid_array.WorkflowHistory[0].to_role,
    "currentUser" : hdrcache[0].CurrentUser,
    "createdAt" : hdrcache[0].CreatedDate,
    "accessNumber" : hdrcache[0].ServiceNumber,
    "unnProblemCode" : hdrcache[0].ProblemCode,
    "remarks": hdrcache[0].Comments,
    "remarkCreatedBy" :  grid_array.WorkflowHistory[0].user_acted,
    "department" : grid_array.WorkflowHistory[0].to_dept,
    "history" : grid_array.WorkflowHistory
}`

export const ticketDetailsTransformer = jsonata(ticketDetails)

const prePaidStatusTransform = `{
    "customerNbr": customerSummary.return.customerSummary.customerUid,
    "accountNbr": customerSummary.return.accountSummary.accountNo,
    "customerStatus": customerSummary.return.customerStatus,
    "accountStatus": customerSummary.return.accountStatus,
    "serviceStatus": serviceStatus.mobile.subscriberStatus,
    "connectionStatus": customerSummary.return.serviceSummary.statusCode,
    "serviceLevel": customerSummary.return.serviceSummary.serviceLevel,
    "iccid": customerSummary.return.serviceSummary.gsmSupplementItem.iccid,
    "imsi": customerSummary.return.serviceSummary.gsmSupplementItem.imsi.value,
    "currentPlanCode": customerSummary.return.serviceSummary.tariffCode,
	"icNumber": customerSummary.return.accountSummary.identificationFields.id3Value
}`

export const prepaidStatusTransformer = jsonata(prePaidStatusTransform)

const postpaidStatusTransform = `{
    "customerNbr": customerSummary.return.customerSummary.customerUid,
    "accountNbr": customerSummary.return.accountSummary.accountNo,
    "customerStatus": customerSummary.return.customerStatus,
    "accountStatus": customerSummary.return.accountStatus,
    "serviceStatus": serviceStatus.mobile.subscriberStatus,
    "serviceLevel": customerSummary.return.serviceSummary.serviceLevel,
    "connectionStatus": customerSummary.return.serviceSummary.statusCode,
    "iccid": customerSummary.return.serviceSummary.gsmSupplementItem.iccid,
    "imsi": customerSummary.return.serviceSummary.gsmSupplementItem.imsi.value,
    "currentPlanCode": customerSummary.return.serviceSummary.tariffCode,
	"icNumber": customerSummary.return.accountSummary.identificationFields.id3Value
}`

export const postpaidStatusTransformer = jsonata(postpaidStatusTransform)

const fixedLineStatusTransform = `{
    "customerNbr": customerSummary.return.customerSummary.customerUid,
    "accountNbr": customerSummary.return.accountSummary.accountNo,
    "customerStatus": customerSummary.return.customerStatus,
    "accountStatus": customerSummary.return.accountStatus,
    "serviceStatus": serviceStatus.fixedLine.status,
    "serviceLevel": customerSummary.return.serviceSummary.serviceLevel,
    "connectionStatus": customerSummary.return.serviceSummary.statusCode,
    "currentPlanCode": customerSummary.return.serviceSummary.tariffCode,
	"icNumber": customerSummary.return.accountSummary.identificationFields.id3Value
}`
export const fixedLineStatusTransformer = jsonata(fixedLineStatusTransform)

const customerDetailsTransform = `{
    "customerName": customerSummary.return.context.contextElements[name = 'CustomerName'].value.stringValue,
    "customerStatus": customerSummary.return.customerStatus,
    "customerType": customerSummary.return.customerSummary.class1TypeCode,
	"accountStatus": customerSummary.return.accountStatus,
	"serviceType": serviceStatus.mobile.subscriberType,
    "serviceStatus": serviceStatus.mobile.subscriberStatus,
    "billAmount": serviceStatus.mobile.postpaid.billingDetails[0].$eval(billAmount),
    "billStatus": serviceStatus.mobile.postpaid.billingDetails[0].billStatus,
    "dataBalance": serviceStatus.mobile.prepaid.$sum(balance[balanceType = 'Data'].$eval(value)),
    "unpaidAmount": serviceStatus.mobile.postpaid.billingDetails[0].$eval(unpaidAmount),    
    "outStandAmount": serviceStatus.mobile.postpaid.$eval(outstandingAmount),
    "billDate": serviceStatus.mobile.postpaid.billingDetails[0].billDate,
    "paidAmount": serviceStatus.mobile.postpaid.billingDetails[0].paidAmount,
    "disputeAmount": serviceStatus.mobile.postpaid.billingDetails[0].$eval(disputeAmount),
    "dueDate": serviceStatus.mobile.postpaid.billingDetails[0].dueDate,
    "paidDate": serviceStatus.mobile.postpaid.billingDetails[0].paidDate,
    "refundAmount": serviceStatus.mobile.postpaid.billingDetails[0].refundAmount,
    "currentPlanCode": customerSummary.return.serviceSummary.tariffCode,
    "mainBalance": serviceStatus.mobile.prepaid.$sum(balance[balanceType ='MainBalance'].$eval(value))
}`
export const customerDetailsTransformer = jsonata(customerDetailsTransform)

const fixedLineChatTransform = `{
    "customerName": customerSummary.return.context.contextElements[name = 'CustomerName'].value.stringValue,
    "customerStatus": customerSummary.return.customerStatus,
    "customerType": customerSummary.return.customerSummary.class1TypeCode,
	"accountStatus": customerSummary.return.accountStatus,
	"serviceType": "FIXEDLINE",
    "serviceStatus": serviceStatus.fixedLine.status,
    "billAmount": serviceStatus.fixedLine.billingDetails[0].$eval(billAmount),
    "billStatus": serviceStatus.fixedLine.billingDetails[0].billStatus,
    "dataBalance": serviceStatus.fixedLine.$sum(usage.$eval(accumulatedUsage)),
    "unpaidAmount": serviceStatus.fixedLine.billingDetails[0].$eval(unpaidAmount),    
    "outStandAmount": serviceStatus.fixedLine.$eval(outstandingAmount),
    "billDate": serviceStatus.fixedLine.billingDetails[0].billDate,
    "paidAmount": serviceStatus.fixedLine.billingDetails[0].paidAmount,
    "disputeAmount": serviceStatus.fixedLine.billingDetails[0].$eval(disputeAmount),
    "dueDate": serviceStatus.fixedLine.billingDetails[0].dueDate,
    "paidDate": serviceStatus.fixedLine.billingDetails[0].paidDate,
    "refundAmount": serviceStatus.fixedLine.billingDetails[0].refundAmount,
    "currentPlanCode": customerSummary.return.serviceSummary.tariffCode    
}`

export const fixedLineChatDetailsTransformer = jsonata(fixedLineChatTransform)
