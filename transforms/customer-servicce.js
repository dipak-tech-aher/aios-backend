import { each, get } from 'lodash'
export const transformAddress = (address) => {
  const data = {
    addressType: get(address, 'addressType', 'Home'),
    hno: get(address, 'flatHouseUnitNo', ''),
    block: get(address, 'block', ''),
    buildingName: get(address, 'building', ''),
    street: get(address, 'street', ''),
    road: get(address, 'road', ''),
    city: get(address, 'cityTown', ''),
    town: get(address, 'village', ''),
    state: get(address, 'state', ''),
    district: get(address, 'district', ''),
    country: get(address, 'country', ''),
    postCode: get(address, 'postCode', '')
  }
  return data
}

export const transformContact = (data) => {
  const response = {
    title: get(data, 'contactTitle', ''),
    firstName: get(data, 'surName', ''),
    lastName: get(data, 'foreName', ''),
    contactType: get(data, 'contactType', ''),
    contactNo: get(data, 'contactNbr', 0),
    email: get(data, 'email', '')
  }
  if (data.contactForeName && data.contactSurName) {
    response.firstName = get(data, 'contactSurName', '')
    response.lastName = get(data, 'contactForeName', '')
  }
  return response
}

export const transformCustomer = (data) => {
  const response = {
    title: get(data, 'title', ''),
    firstName: get(data, 'surName', ''),
    lastName: get(data, 'foreName', ''),
    custType: get(data, 'customerType', ''),
    customerCat: get(data, 'category', ''),
    customerClass: get(data, 'class', '')
  }
  if (data.customerType === 'BUSINESS') {
    response.firstName = get(data, 'companyName', '')
  }
  return response
}

export const transformAccount = (customerType, data) => {
  const response = {
    accountCat: get(data, 'category', ''),
    accountClass: get(data, 'class', ''),
    accountPriority: get(data, 'priority'),
    title: get(data, 'title', ''),
    firstName: get(data, 'surName', ''),
    lastName: get(data, 'foreName', ''),
    gender: ((get(data, 'gender') !== undefined && get(data, 'gender') !== '') ? get(data, 'gender') : null),
    birthDate: ((get(data, 'dob') !== undefined && get(data, 'dob') !== '') ? get(data, 'dob') : null),
    idType: ((get(data, 'idType') !== undefined && get(data, 'idType') !== '') ? get(data, 'idType') : null),
    idValue: ((get(data, 'idNbr') !== undefined && get(data, 'idNbr') !== '') ? get(data, 'idNbr') : null),
    baseCollPlan: get(data, 'baseCollPlan', ''),
    priority: get(data, 'priority', ''),
    noOfCopies: get(data, 'billOptions.noOfCopies', 0),
    billDeliveryMthd: get(data, 'billOptions.billDeliveryMethod', ''),
    billLang: get(data, 'billOptions.billLanguage', '')
  }
  if (customerType === 'BUSINESS') {
    response.firstName = get(data, 'companyName', '')
    response.regDate = ((get(data, 'registeredDate') !== undefined && get(data, 'registeredDate') !== '') ? get(data, 'registeredDate') : null)
    response.registeredNo = get(data, 'registeredNbr', '')
  }
  return response
}

export const transformSecurityQuestion = (data) => {
  const response = {
    profileName: get(data, 'securityQuestion', ''),
    profileValue: get(data, 'securityAnswer', '')
  }
  return response
}

export const transformConnection = (data, plan) => {
  let response = {
    connectionName: get(data, '', ''),
    connectionType: get(data, 'catalog', ''),
    isPorted: (get(data, 'portIn', 'No') === 'Yes') ? 'Y' : 'N',
    donor: (get(data, 'portIn', 'No') === 'Yes') ? get(data, 'donor') : null,
    paymentMethod: get(data, 'paymentMethod', ''),
    creditProf: get(data, 'creditProfile', ''),
    status: get(data, 'status', 'ACTIVE')
  }
  if (data.mobile) {
    response = {
      ...response,
      connectionSelection: get(data, 'mobile.serviceNumberSelection', ''),
      connectionGrp: get(data, 'mobile.nbrGroup', ''),
      dealership: get(data, 'mobile.dealership', ''),
      identificationNo: get(data, 'mobile.accessNbr', ''),
      assignSimLater: get(data, 'mobile.gsm.assignSIMLater'),
      iccid: get(data, 'mobile.gsm.iccid', ''),
      imsi: get(data, 'mobile.gsm.imsi', '')
    }
    if (plan.prodType === 'Postpaid') {
      response = {
        ...response,
        deposit: get(data, 'deposit.includeExclude', ''),
        charge: ((get(data, 'deposit.includeExclude') === 'include') ? get(data, 'deposit.charge') : null),
        excludeReason: get(data, 'deposit.excludeReason', '')
      }
    }
  } else if (data.fixed) {
    response = {
      ...response,
      exchngCode: get(data, 'fixed.exchangeCode', ''),
      identificationNo: get(data, 'fixed.accessNbr', ''),
      connectionSelection: get(data, 'fixed.serviceNumberSelection', ''),
      connectionGrp: get(data, 'fixed.serviceNumberGroup', ''),
      deposit: get(data, 'deposit.includeExclude', ''),
      charge: ((get(data, 'deposit.includeExclude') === 'include') ? get(data, 'deposit.charge') : null),
      excludeReason: get(data, 'deposit.excludeReason', '')
    }
  }
  return response
}

/*
export const transformServiceRequest = (data) => {

  const response = {
    parentIntxn: get(data, 'parentIntxn', 1),
    subject: get(data, 'subject', ''),
    description: get(data, 'description', ''),
    // currStatus: get(data, 'currStatus', ''),
    currUser: get(data, 'currUser', ''),
    identificationNo: get(data, 'identificationNo', ''),
    assignedDate: get(data, 'assignedDate', new Date()),
    intxnType: get(data, 'intxnType', 'REQSR'),
    intxnCatCode: get(data, 'intxnCatCode', 'NULL'),
    businessEntityCode: get(data, 'businessEntityCode', 'N'),
    problemCode: get(data, 'problemCode', ''),
    natureCode: get(data, 'natureCoden', ''),
    causeCode: get(data, 'causeCode', ''),
    clearCode: get(data, 'clearCode', ''),
    woType: get(data, 'woType', ''),
    externalRefNo: get(data, 'externalRefNo', ''),
    commentType: get(data, 'commentType', ''),
    commentCause: get(data, 'commentCause', ''),
    priorityCode: get(data, 'priorityCode', ''),
    createdEntity: get(data, 'createdEntity', ''),
    currEntity: get(data, 'currEntity', ''),
    currRole: get(data, 'currRole', ''),
    sourceCode: get(data, 'sourceCode', ''),
    chnlCode: get(data, 'chnlCode', ''),
    termType: get(data, 'termType', ''),
    slaCode: get(data, 'slaCode', ''),
    alertType: get(data, 'alertType', ''),
    // lastAlertDate: get(data, 'lastAlertDate', 0),
    cntPrefer: get(data, 'cntPrefer', ''),
    assetId: get(data, 'assetId', ''),
    uid: get(data, 'uid', ''),
    expctdDateCmpltn: get(data, 'expctdDateCmpltn', new Date()),
    isRebound: get(data, 'isRebound', ''),
    // billAmt: get(data, 'billAmt', 0),
    isValid: get(data, 'isValid', ''),
    arRefNo: get(data, 'arRefNo', ''),
    refIntxnId: get(data, 'refIntxnId', ''),
    isBotReq: get(data, 'isBotReq', 'Y'),
    botProcess: get(data, 'botProcess', 'N')
  }
  return response
}
*/
export const transformCustomerResponse = (customers = []) => {
  let response
  if (Array.isArray(customers)) {
    response = []
    each(customers, (customer) => {
      response.push(transformCustomerResponse(customer))
    })
  } else {
    response = {
      customerId: get(customers, 'customerId', ''),
      title: get(customers, 'title', ''),
      foreName: get(customers, 'lastName', ''),
      surName: get(customers, 'firstName', ''),
      companyName: get(customers, 'firstName', ''),
      category: get(customers, 'customerCat', ''),
      categoryDesc: get(customers.category, 'description', ''),
      class: get(customers, 'customerClass', ''),
      classDesc: get(customers.class, 'description', ''),
      regDate: get(customers, 'regDate', ''),
      registeredNo: get(customers, 'registeredNo', ''),
      idType: get(customers, 'idType', ''),
      idValue: get(customers, 'idValue', ''),
      status: get(customers, 'status', ''),
      addressId: get(customers, 'addressId', ''),
      priority: get(customers, 'priority', ''),
      customerType: get(customers, 'custType', ''),
      crmCustomerNo: get(customers, 'crmCustomerNo', ''),
      contactType: get(customers.contact, 'contactType', ''),
      contactTypeDesc: get(customers.contact.contactTypeDesc, 'description', ''),
      email: get(customers.contact, 'email', ''),
      contactNbr: get(customers.contact, 'contactNo', '')
    }
    if (customers.address) {
      const address = transformResponseAddress(customers.address)
      response.address = [address]
    }
    // if (Array.isArray(customers.account)) {
    //   const account = []
    //   for (const acc of customers.account) {
    //     const data = {
    //       accountId: get(acc, 'accountId', ''),
    //       customerId: get(acc, 'customerId', ''),
    //       addressId: get(acc, 'addressId', ''),
    //       title: get(acc, 'title', ''),
    //       surName: get(acc, 'lastName', ''),
    //       foreName: get(acc, 'firstName', ''),
    //       gender: get(acc, 'gender', ''),
    //       dob: get(acc, 'birthDate', ''),
    //       companyName: get(acc, 'firstName', ''),
    //       registeredDate: get(acc, 'regDate', ''),
    //       idType: get(acc, 'idType', ''),
    //       idNbr: get(acc, 'idValue', ''),
    //       registeredNbr: get(acc, 'registeredNo', ''),
    //       priority: get(acc, 'accountPriority', ''),
    //       class: get(acc, 'accountClass', ''),
    //       category: get(acc, 'accountCat', ''),
    //       status: get(acc, 'status', ''),
    //       accountType: get(acc.contact, 'contactType', ''),
    //       email: get(acc.contact, 'email', ''),
    //       contactType: get(acc.contact, 'contactType', ''),
    //       contactNbr: get(acc.contact, 'contactNbr', ''),
    //       contactTitle: get(acc.contact, 'title', ''),
    //       contactSurName: get(acc.contact, 'lastName', ''),
    //       contactForeName: get(acc.contact, 'firstName', '')
    //     }
    //     data.billingAddress = [transformResponseAddress(acc.address)]
    //     data.billOptions = {
    //       billLanguage: get(acc, 'billLang', ''),
    //       billDeliveryMethod: get(acc, 'billDeliveryMthd', ''),
    //       noOfCopies: get(acc, 'noOfCopies', '')
    //     }
    //     data.securityData = {
    //       securityQuestion: get(acc.securityQuestion, 'profileName', ''),
    //       securityAnswer: get(acc.securityQuestion, 'profileValue', '')
    //     }
    //     const service = []
    //     if (Array.isArray(acc.service)) {
    //       for (const sr of acc.service) {
    //         const connection = {
    //           serviceId: get(sr, 'connectionId', ''),
    //           catalog: get(sr, 'connectionType', ''),
    //           product: get(sr, 'connectionGrp', '')
    //         }
    //         connection.installationAddress = [transformResponseAddress(sr.address)]
    //         connection.deposit = {
    //           charge: get(sr, 'charge', ''),
    //           paymentMethod: get(sr, 'paymentMethod', ''),
    //           excludeReason: get(sr, 'excludeReason', '')
    //         }
    //         connection.fixed = {
    //           serviceNbrSelection: get(sr, 'connectionSelection', ''),
    //           serviceNbrGroup: get(sr, 'connectionGrp', ''),
    //           exchangeCode: get(sr, 'exchngCode', ''),
    //           accessNbr: get(sr, 'paymentMethod', '')
    //         }
    //         const mobile = {
    //           serviceNbrSelection: get(sr, 'connectionSelection', ''),
    //           dealership: get(sr, 'dealership', ''),
    //           nbrGroup: get(sr, 'connectionGrp', ''),
    //           accessNbr: get(sr, 'identificationNo', '')
    //         }
    //         mobile.gsm = {
    //           iccid: get(sr, 'iccid', ''),
    //           imsi: get(sr, 'imsi', ''),
    //           creditProfile: get(sr, 'creditProf', '')
    //         }
    //         connection.mobile = mobile
    //         const plan = {
    //           planId: get(sr.conn_plan[0], 'plan.planId', ''),
    //           prodType: get(sr.conn_plan[0], 'plan.prodType', ''),
    //           planName: get(sr.conn_plan[0], 'plan.planName', ''),
    //           bandwidth: get(sr.conn_plan[0], 'plan.bandwidth', ''),
    //           offerId: get(sr.conn_plan[0], 'plan.offerId', ''),
    //           planCategory: get(sr.conn_plan[0], 'plan.planCategory', '')
    //         }
    //         connection.plan = plan
    //         service.push(connection)
    //       }
    //       if (!isEmpty(service)) {
    //         data.service = service
    //       }
    //     }
    //     account.push(data)
    //   }
    //   if (!isEmpty(account)) {
    //     response.account = account
    //   }
    // }
  }
  return response
}

export const transformResponseAddress = (address) => {
  const response = {
    addressId: get(address, 'addressId', ''),
    addressType: get(address, 'addressType', ''),
    flatHouseUnitNo: get(address, 'hno', ''),
    block: get(address, 'block', ''),
    building: get(address, 'buildingName', ''),
    street: get(address, 'street', ''),
    road: get(address, 'road', ''),
    district: get(address, 'district', ''),
    state: get(address, 'state', ''),
    village: get(address, 'town', ''),
    cityTown: get(address, 'city', ''),
    country: get(address, 'country', ''),
    postCode: get(address, 'postCode', '')
  }
  return response
}

export const transformAccountResponse = (accounts = []) => {
  let response
  if (Array.isArray(accounts)) {
    response = []
    each(accounts, (account) => {
      response.push(transformAccountResponse(account))
    })
  } else {
    response = {
      accountId: get(accounts, 'accountId', ''),
      customerId: get(accounts, 'customerId', ''),
      addressId: get(accounts, 'addressId', ''),
      title: get(accounts, 'title', ''),
      surName: get(accounts, 'lastName', ''),
      foreName: get(accounts, 'firstName', ''),
      gender: get(accounts, 'gender', ''),
      dob: get(accounts, 'birthDate', ''),
      companyName: get(accounts, 'firstName', ''),
      registeredDate: get(accounts, 'regDate', ''),
      idType: get(accounts, 'idType', ''),
      idTypeDesc: get(accounts?.id_typ, 'description', ''),
      idNbr: get(accounts, 'idValue', ''),
      registeredNbr: get(accounts, 'registeredNo', ''),
      acctPriority: get(accounts, 'accountPriority', ''),
      acctPriorityDesc: get(accounts?.acct_prty, 'description', ''),
      priority: get(accounts, 'priority', ''),
      priorityDesc: get(accounts?.prty, 'description', ''),
      class: get(accounts, 'accountClass', ''),
      classDesc: get(accounts?.acct_class, 'description', ''),
      category: get(accounts, 'accountCat', ''),
      categoryDesc: get(accounts?.acct_catg, 'description', ''),
      baseCollPlan: get(accounts, 'baseCollPlan', ''),
      baseCollPlanDesc: get(accounts?.coll_plan, 'description', ''),
      status: get(accounts, 'status', ''),
      email: get(accounts?.contact, 'email', ''),
      contactType: get(accounts?.contact, 'contactType', ''),
      contactTypeDesc: get(accounts?.contact?.contactTypeDesc, 'description', ''),
      contactNbr: get(accounts?.contact, 'contactNo', ''),
      contactTitle: get(accounts?.contact, 'title', ''),
      contactSurName: get(accounts?.contact, 'lastName', ''),
      contactForeName: get(accounts?.contact, 'firstName', '')
    }
    response.accountNo = accounts?.accountNo
    response.billingAddress = [transformResponseAddress(accounts?.address)]
    response.billOptions = {
      billLanguage: get(accounts, 'billLang', ''),
      billLanguageDesc: get(accounts?.bill_language, 'description', ''),
      billDeliveryMethod: get(accounts, 'billDeliveryMthd', ''),
      billDeliveryMethodDesc: get(accounts?.bill_dlvy_mthd, 'description', ''),
      noOfCopies: get(accounts, 'noOfCopies', '')
    }
    response.securityData = {
      securityQuestion: get(accounts?.securityQuestion, 'profileName', ''),
      securityQuestionDesc: get(accounts?.securityQuestion?.sec_q, 'description', ''),
      securityAnswer: get(accounts?.securityQuestion, 'profileValue', '')
    }
  }
  return response
}

export const transformServiceResponse = (services = []) => {
  let response
  if (Array.isArray(services)) {
    response = []
    each(services, (service) => {
      response.push(transformServiceResponse(service))
    })
  } else {
    // console.log(JSON.stringify(services, null, 2))
    response = {
      serviceId: get(services, 'connectionId', ''),
      accessNbr: get(services, 'identificationNo', ''),
      catalog: get(services, 'connectionType', ''),
      catalogDesc: get(services.conn_typ, 'description', ''),
      status: get(services, 'status', ''),
      statusDesc: get(services.serviceStatus, 'description', ''),
      product: get(services, 'product', ''),
      productDesc: get(services, 'planName', ''),
      planName: get(services, 'planName', ''),
      networkType: get(services, 'networkType', ''),
      prodType: get(services, 'prodType', ''),
      charge: get(services, 'charge', ''),
      serviceNumberSelection: get(services, 'connectionSelection', ''),
      paymentMethod: get(services, 'paymentMethod', ''),
      paymentMethodDesc: get(services.pymt_mthd, 'description', ''),
      creditProfile: get(services, 'creditProf', ''),
      creditProfileDesc: get(services.crd_prf, 'description', '')
    }

    response.installationAddress = [transformResponseAddress(services.address)]
    response.deposit = {
      includeExclude: get(services, 'deposit', ''),
      charge: get(services, 'depositChg', ''),
      chargeDesc: get(services.dep_chrg, 'description', ''),
      excludeReason: get(services, 'excludeReason', '')
    }

    if (response.prodType === 'Fixed') {
      response.fixed = {
        serviceNumberSelection: get(services, 'connectionSelection', ''),
        serviceNbrGroup: get(services, 'connectionGrp', ''),
        serviceNbrGroupDesc: get(services.conn_grp, 'description', ''),
        serviceNumberGroupDesc: get(services.conn_grp, 'description', ''),
        exchangeCode: get(services, 'exchngCode', ''),
        exchangeCodeDesc: get(services.exchCd, 'description', ''),
        accessNbr: get(services, 'identificationNo', '')
      }
    }
    if (response.prodType === 'Prepaid' || response.prodType === 'Postpaid') {
      const mobile = {}

      mobile.serviceNumberSelection = get(services, 'connectionSelection', '')
      mobile.dealership = get(services, 'dealership', '')
      mobile.dealershipDesc = get(services.dlrshp, 'description', '')
      mobile.nbrGroup = get(services, 'connectionGrp', '')
      mobile.nbrGroupDesc = get(services.conn_grp, 'description', '')
      mobile.accessNbr = get(services, 'identificationNo', '')

      mobile.gsm = {}
      mobile.gsm.assignSIMLater = get(services, 'assignSimLater', '')
      mobile.gsm.iccid = get(services, 'iccid', '')
      mobile.gsm.imsi = get(services, 'imsi', '')

      response.mobile = mobile
    }
    response.portIn = {}
    response.isPorted = get(services, 'isPorted')
    response.donor = get(services, 'donor')
    response.portIn.portInChecked = (get(services, 'isPorted') === 'Y') ? 'Yes' : 'No'
    response.portIn.donor = (get(services, 'isPorted') === 'Y') ? get(services, 'donor') : ''
  }
  return response
}

export const transformConnectionPlanResponse = (connplans = []) => {
  let response
  if (Array.isArray(connplans)) {
    response = []
    each(connplans, (connplan) => {
      response.push(transformConnectionPlanResponse(connplan))
    })
  } else {
    response = {
      connectionPlanId: get(connplans, 'connPlanId'),
      serviceId: get(connplans, 'connectionId'),
      planId: get(connplans, 'planId'),
      status: get(connplans, 'status'),
      prodType: get(connplans.plan, 'prodType'),
      planName: get(connplans.plan, 'planName'),
      bandwidth: get(connplans.plan, 'bandwidth'),
      networkType: get(connplans.plan, 'networkType'),
      charge: get(connplans.plan, 'charge'),
      validity: get(connplans.plan, 'validity'),
      refillProfileId: get(connplans.plan, 'refillProfileId'),
      planType: get(connplans.plan, 'planType'),
      startDate: get(connplans, 'createdAt'),
      txnReference: get(connplans, 'txnReference')
    }
    if (connplans.plan.planoffer) {
      response.offers = transformOfferResponse(connplans.plan.planoffer)
    }
  }
  return response
}

export const transformPurchaseHistoryResponse = (connplans = []) => {
  let response
  if (Array.isArray(connplans)) {
    response = []
    each(connplans, (connplan) => {
      response.push(transformPurchaseHistoryResponse(connplan))
    })
  } else {
    response = {
      connectionPlanId: get(connplans, 'connPlanId'),
      serviceId: get(connplans, 'connectionId'),
      planId: get(connplans, 'planId'),
      status: get(connplans, 'status'),
      prodType: get(connplans.plan, 'prodType'),
      planName: get(connplans.plan, 'planName'),
      charge: get(connplans.plan, 'charge'),
      planType: get(connplans.plan, 'planType'),
      boosterTopupStatus: get(connplans.connPlanStatus, 'code'),
      boosterTopupStatusDesc: get(connplans.connPlanStatus, 'description'),
      purchasedDate: get(connplans, 'createdAt'),
      purchasedBy: get(connplans.createdByUser, 'title') + '. ' + get(connplans.createdByUser, 'firstName') + ' ' + get(connplans.createdByUser, 'lastName')
    }
    if (connplans.plan.planoffer) {
      response.offers = transformOfferResponse(connplans.plan.planoffer)
    }
  }
  return response
}

export const transformPlanResponse = (plans = []) => {
  let response
  if (Array.isArray(plans)) {
    response = []
    each(plans, (plan) => {
      response.push(transformPlanResponse(plan))
    })
  } else {
    response = {
      planId: get(plans, 'planId', ''),
      prodType: get(plans, 'prodType', ''),
      planType: get(plans, 'planType', ''),
      planName: get(plans, 'planName', ''),
      bandwidth: get(plans, 'bandwidth', ''),
      networkType: get(plans, 'networkType', ''),
      charge: get(plans, 'charge', ''),
      refillProfileId: get(plans, 'refillProfileId', ''),
      status: get(plans, 'status', '')
    }
    if (plans.planoffer) {
      response.offers = transformOfferResponse(plans.planoffer)
    }
  }
  return response
}

export const transformOfferResponse = (offers = []) => {
  let response
  if (Array.isArray(offers)) {
    response = []
    each(offers, (offer) => {
      response.push(transformOfferResponse(offer))
    })
  } else {
    response = {
      planOfferId: get(offers, 'planOfferId', ''),
      planId: get(offers, 'planId', ''),
      quota: get(offers, 'quota', ''),
      offerId: get(offers, 'offerId', ''),
      units: get(offers, 'units', ''),
      offerType: get(offers, 'offerType', '')
    }
  }
  return response
}

export const transformInteractionTask = (data) => {
  const response = {
    stepId: get(data, 'intxnTaskId'),
    intxnId: get(data, 'intxnId'),
    stepName: get(data, 'taskId'),
    stepStatus: get(data, 'status'),
    createdAt: get(data, 'createdAt'),
    updatedAt: get(data, 'updatedAt')
  }
  return response
}

export const transformCatalog = (catalog) => {
  const data = {
    planName: get(catalog, 'bundleName', null),
    refillProfileId: get(catalog, 'refillProfileId', null),
    commPackName: get(catalog, 'commPackName', null),
    planCategory: get(catalog, 'bundleCatagory', null),
    planType: get(catalog, 'bundleType', null),
    status: get(catalog, 'status', 'AC'),
    networkType: get(catalog, 'networkType', null),
    ocsDesc: get(catalog, 'ocsDescription', null),
    charge: get(catalog, 'charge', null),
    serviceCls: get(catalog, 'serviceClass', null),
    prodType: get(catalog, 'service', null),
    refPlanCode: get(catalog, 'TarrifCode', null),
    validity: get(catalog, 'validity', null)
  }
  return data
}

export const transformComplaint = (complaint) => {
  const data = {
    customerId: get(complaint, 'customerId', null),
    accountId: get(complaint, 'accountId', null),
    connectionId: get(complaint, 'serviceId', null),
    intxnType: get(complaint, 'intxnType', null),
    problemCode: get(complaint, 'problemCode', null),
    chnlCode: get(complaint, 'chnlCode', null),
    cntPrefer: get(complaint, 'cntPrefer', null),
    priorityCode: get(complaint, 'priorityCode', null),
    sourceCode: get(complaint, 'sourceCode', null),
    // businessEntityCode: get(complaint, 'businessEntityCode', 'COMPLAINT'),
    description: get(complaint, 'remarks', null),
    currStatus: get(complaint, 'currStatus', 'NEW'),
    commentType: get(complaint, 'problemType', null),
    commentCause: get(complaint, 'problemCause', null),
    addressId: get(complaint, 'addressId', null),
    woType: get(complaint, 'woType', 'COMPLAINT'),
    isBotReq: get(complaint, 'isBotReq', 'N'),
    surveyReq: get(complaint, 'surveyReq', null),
    intxnCatType: get(complaint, 'ticketType', null),
    services: get(complaint, 'productOrServices', null),
    kioskRefId: get(complaint, 'kioskRefId', null),
    location: get(complaint, 'location', null)
  }
  data.natureCode = complaint.natureCode ? complaint.natureCode : null
  data.causeCode = complaint.causeCode ? complaint.causeCode : null
  data.clearCode = complaint.clearCode ? complaint.clearCode : null
  return data
}

export const transformUpdateComplaint = (complaint, comaplaintInfo) => {
  const data = {
    customerId: get(complaint, 'customerId', comaplaintInfo.customerId),
    accountId: get(complaint, 'accountId', comaplaintInfo.accountId),
    connectionId: get(complaint, 'serviceId', comaplaintInfo.connectionId),
    intxnType: get(complaint, 'intxnType', comaplaintInfo.intxnType),
    problemCode: get(complaint, 'problemCode', comaplaintInfo.problemCode),
    chnlCode: get(complaint, 'chnlCode', comaplaintInfo.chnlCode),
    cntPrefer: get(complaint, 'cntPrefer', comaplaintInfo.cntPrefer),
    priorityCode: get(complaint, 'priorityCode', comaplaintInfo.priorityCode),
    sourceCode: get(complaint, 'sourceCode', comaplaintInfo.sourceCode),
    businessEntityCode: get(complaint, 'businessEntityCode', comaplaintInfo.businessEntityCode),
    description: get(complaint, 'remarks', comaplaintInfo.description),
    currStatus: get(complaint, 'currStatus', comaplaintInfo.currStatus),
    commentType: get(complaint, 'problemType', comaplaintInfo.commentType),
    commentCause: get(complaint, 'problemCause', comaplaintInfo.commentCause),
    addressId: get(complaint, 'addressId', comaplaintInfo.addressId),
    woType: get(complaint, 'woType', comaplaintInfo.woType),
    isBotReq: get(complaint, 'isBotReq', comaplaintInfo.isBotReq),
    surveyReq: get(complaint, 'surveyReq', comaplaintInfo.surveyReq),
    intxnCatType: get(complaint, 'ticketType', comaplaintInfo.intxnType),
    services: get(complaint, 'productOrServices', comaplaintInfo.services),
    kioskRefId: get(complaint, 'kioskRefId', comaplaintInfo.kioskRefId),
    location: get(complaint, 'location', comaplaintInfo.location)
  }
  data.natureCode = complaint.natureCode ? complaint.natureCode : null
  data.causeCode = complaint.causeCode ? complaint.causeCode : null
  data.clearCode = complaint.clearCode ? complaint.clearCode : null
  return data
}

export const transformInquiry = (inquiry) => {
  const data = {
    customerId: get(inquiry, 'customerId', null),
    accountId: get(inquiry, 'accountId', null),
    connectionId: get(inquiry, 'connectionId', null),
    intxnType: get(inquiry, 'intxnType', 'REQINQ'),
    //  businessEntityCode: get(inquiry, 'serviceType', 'INQUIRY'),
    commentType: get(inquiry, 'inquiryAbout', null),
    services: get(inquiry, 'inquiryCategory', null),
    chnlCode: get(inquiry, 'ticketChannel', null),
    sourceCode: get(inquiry, 'ticketSource', null),
    priorityCode: get(inquiry, 'ticketPriority', null),
    description: get(inquiry, 'ticketDescription', null),
    currStatus: get(inquiry, 'currStatus', 'NEW'),
    assignedDate: get(inquiry, 'assignedDate', Date.now()),
    woType: get(inquiry, 'woType', 'INQUIRY'),
    kioskRefId: get(inquiry, 'kioskRefId', null),
    surveyReq: get(inquiry, 'surveyReq', null),
    intxnCatType: get(inquiry, 'intxnType', 'REQINQ'),
    location: get(inquiry, 'location', null)
  }
  return data
}

export const transformUpdateInquiry = (inquiry, inquiryInfo) => {
  const data = {
    customerId: get(inquiry, 'customerId', inquiryInfo.customerId),
    accountId: get(inquiry, 'accountId', inquiryInfo.accountId),
    connectionId: get(inquiry, 'connectionId', inquiryInfo.connectionId),
    intxnType: get(inquiry, 'intxnType', inquiryInfo.intxnType),
    businessEntityCode: get(inquiry, 'serviceType', inquiryInfo.businessEntityCode),
    commentType: get(inquiry, 'inquiryAbout', inquiryInfo.commentType),
    services: get(inquiry, 'inquiryCategory', inquiryInfo.services),
    chnlCode: get(inquiry, 'ticketChannel', inquiryInfo.chnlCode),
    sourceCode: get(inquiry, 'ticketSource', inquiryInfo.sourceCode),
    priorityCode: get(inquiry, 'ticketPriority', inquiryInfo.priorityCode),
    description: get(inquiry, 'ticketDescription', inquiryInfo.description),
    currStatus: get(inquiry, 'currStatus', inquiryInfo.currStatus),
    assignedDate: get(inquiry, 'assignedDate', Date.now()),
    woType: get(inquiry, 'woType', inquiryInfo.woType),
    kioskRefId: get(inquiry, 'kioskRefId', inquiryInfo.kioskRefId),
    surveyReq: get(inquiry, 'surveyReq', inquiryInfo.surveyReq),
    intxnCatType: get(inquiry, 'intxnType', inquiryInfo.intxnCatType),
    location: get(inquiry, 'location', inquiryInfo.location)
  }
  return data
}

export const transformInteractionTxn = (complaint) => {
  const data = {
    intxnId: get(complaint, 'intxnId', null),
    fromEntity: get(complaint, 'fromEntity', 'IMAGINE'),
    fromRole: get(complaint, 'fromRole', null),
    fromUser: get(complaint, 'fromUser', null),
    causeCode: get(complaint, 'causeCode', null),
    toEntity: get(complaint, 'toEntity', 'IMAGINE'),
    toRole: get(complaint, 'toRole', null),
    toUser: get(complaint, 'toUser', null),
    intxnStatus: get(complaint, 'intxnStatus', null),
    flwId: get(complaint, 'flwId', 'A'),
    flwCreatedBy: get(complaint, 'flwCreatedBy', null),
    flwAction: get(complaint, 'flwAction', 'A'),
    businessEntityCode: get(complaint, 'businessEntityCode', null),
    priorityCode: get(complaint, 'priorityCode', null),
    problemCode: get(complaint, 'problemCode', null),
    natureCode: get(complaint, 'natureCode', null),
    currStatus: get(complaint, 'currStatus', 'NEW'),
    isFlwBypssd: get(complaint, 'isFlwBypssd', null),
    slaCode: get(complaint, 'slaCode', null),
    expctdDateCmpltn: get(complaint, 'expctdDateCmpltn', null),
    remarks: get(complaint, 'remarks', null)
  }
  return data
}

export const transformappointment = (appointment) => {
  const data = {
    remarks: get(appointment, 'remarks', null),
    contactPerson: get(appointment, 'contactPerson', null),
    contactNo: get(appointment, 'contactNumber', null)
  }
  data.fromDate = appointment.fromDate + ' ' + appointment.fromTime
  data.toDate = appointment.toDate + ' ' + appointment.toTime
  data.fromTime = appointment.fromDate + ' ' + appointment.fromTime
  data.toTime = appointment.toDate + ' ' + appointment.toTime

  return data
}

export const transformInteraction = (interactions, userId, roleId, departmentId) => {
  let response
  if (Array.isArray(interactions)) {
    response = []
    each(interactions, (interaction) => {
      response.push(transformInteraction(interaction, userId, roleId, departmentId))
    })
  } else {
    response = {
      // Not Null Columns
      description: get(interactions, 'ticketDescription', null),
      currStatus: 'NEW',
      currUser: null,
      identificationNo: get(interactions, 'serviceNo'),
      planId: interactions.planId,
      assignedDate: new Date(),
      intxnType: 'REQCOMP',
      intxnCatType: 'OMSTKTN',
      businessEntityCode: interactions.prodType,
      problemCode: get(interactions, 'problemCode', null),
      natureCode: get(interactions, 'natureCode', null),
      clearCode: get(interactions, 'clearCode', null),
      causeCode: get(interactions, 'causeCode', null),
      woType: 'COMPLAINT',
      externalRefNo1: get(interactions, 'ticketId'),
      externalRefSys1: 'OMS',
      priorityCode: interactions.priorityCode,
      createdEntity: departmentId,
      currEntity: departmentId,
      currRole: roleId,
      customerId: interactions.customerId,
      accountId: interactions.accountId,
      connectionId: interactions.connectionId,
      cntPrefer: interactions.cntPrefer,
      isBotReq: 'N',
      surveyReq: 'N',
      botProcess: 'N',
      createdBy: userId,
      updatedBy: userId
    }
  }
  return response

  // chnlCode: get(interactions, 'chnlCode', null),
  // cntPrefer: get(interactions, 'cntPrefer', null),
  // sourceCode: get(interactions, 'sourceCode', null),
  // commentType: get(interactions, 'problemType', null),
  // commentCause: get(interactions, 'problemCause', null),
  // addressId: get(interactions, 'addressId', null),
  // services: get(interactions, 'productOrServices', null),
  // location: get(interactions, 'location', null)
}

export const transformCustomerBillData = (data) => {
  console.log(data)
  if (!data) {
    return
  }
  const transformdata = {
    customerStatus: data?.customerStatus || null,
    accountStatus: data?.accountStatus || null,
    accountCreationDate: data?.accountCreationDate || null,
    basicCollectionPlanCode: '',
    billUid: (data && data.billingDetails && data.billingDetails[0])?data?.billingDetails[0]?.billUid:null,
    billStatus: (data && data.billingDetails && data.billingDetails[0])?data.billingDetails[0].billStatus:null,
    billMonth: (data && data.billingDetails && data.billingDetails[0])?data?.billingDetails[0]?.billMonth:null,
    billAmount: (data && data.billingDetails && data.billingDetails[0])?data?.billingDetails[0]?.billAmount:null,
    billDate: (data && data.billingDetails && data.billingDetails[0])?data?.billingDetails[0]?.billDate:null,
    paidDate: (data && data.billingDetails && data.billingDetails[0])?data?.billingDetails[0]?.paidDate:null,
    dueDate: (data && data.billingDetails && data.billingDetails[0])?data?.billingDetails[0]?.dueDate:null,
    paidAmount: (data && data.billingDetails && data.billingDetails[0])?data?.billingDetails[0]?.paidAmount:null,
    unpaidAmount: (data && data.billingDetails && data.billingDetails[0])?data?.billingDetails[0]?.unpaidAmount:null,
    disputeAmount: (data && data.billingDetails && data.billingDetails[0])?data?.billingDetails[0]?.disputeAmount:null,
    refundAmount: (data && data.billingDetails && data.billingDetails[0])?data?.billingDetails[0]?.refundAmount:null

  }

  return transformdata
}

export const transformOpenClosedSLADeptInteractionSearchResponse = (interaction = []) => {
  let response
  if (Array.isArray(interaction)) {
    response = []
    each(interaction, (data) => {
      response.push(transformOpenClosedSLADeptInteractionSearchResponse(data))
    })
  } else {
    response = {
      interactionId: get(interaction, 'intxn_id', ''),
      interactionType: get(interaction, 'intxn_type', ''),
      createdDate: get(interaction, 'created_at', ''),
      commentSource: get(interaction, 'source_code', ''),
      commentSourceDesc: get(interaction, 'source_code_desc', ''),
      commentChannel: get(interaction, 'chnl_code', ''),
      commentChannelDesc: get(interaction, 'chnl_code_desc', ''),
      customerSegment: get(interaction, 'cust_type_desc', ''),
      customerName: get(interaction, 'customer_name', ''),
      serviceNo: get(interaction, 'identification_no', ''),
      serviceType: get(interaction, 'prod_type', ''),
      ticketType: get(interaction, 'intxn_cat_type', ''),
      ticketTypeDesc: get(interaction, 'ticket_type_desc', ''),
      commentType: get(interaction, 'comment_type', ''),
      commentTypeDesc: get(interaction, 'comment_type_desc', ''),
      commentCause: get(interaction, 'comment_cause', ''),
      commentCauseDesc: get(interaction, 'comment_cause_desc', ''),
      rebound: get(interaction, 'is_rebound', ''),
      ticketId: get(interaction, 'ticket_id', ''),
      ticketValidity: get(interaction, 'is_valid', ''),
      ticketDesc: get(interaction, 'description', ''),
      priority: get(interaction, 'priority_code', ''),
      priorityDesc: get(interaction, 'priority_code_desc', ''),
      createdBy: get(interaction, 'created_by_user_name', ''),
      currStatus: get(interaction, 'curr_status', ''),
      currStatusDesc: get(interaction, 'curr_status_desc', ''),
      currentRole: get(interaction, 'curr_role_name', ''),
      currentUser: get(interaction, 'curr_user_name', ''),
      pendingCloseDate: get(interaction, 'pending_close_date', ''),
      pendingCloseBy: get(interaction, 'pending_close_by_user_name', ''),
      closedDate: get(interaction, 'closed_date', ''),
      closedBy: get(interaction, 'closed_by_user_name', ''),
      surveySent: get(interaction, 'survey_req', ''),
      contactNo: get(interaction, 'contact_no', ''),
      contactEmail: get(interaction, 'email', ''),
      workOrderType: get(interaction, 'wo_type', ''),
      workOrderTypeDesc: get(interaction, 'wo_type_desc', ''),
      createdByRole: get(interaction, 'created_by_role', ''),
      expectedDateOfCompletion: get(interaction, 'intxn_txn_expctd_date_cmpltn', ''),
      cancelledReason: get(interaction, 'cancelled_reason', ''),
      cancelledBy: get(interaction, 'cancelled_by_name', '')
    }
  }
  return response
}
