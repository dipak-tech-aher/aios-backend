export const workflowDefinitions = [
  {
    name: 'Create New Customer, Account and Service',
    woType: 'WONC',
    intxnType: 'REQSR',
    steps: [
      {
        stepName: 'CREATECUSTACCT',
        status: 'NEW',
        who: 'BOTS'
      },
      {
        stepName: 'CREATESERVICE',
        status: 'NEW',
        who: 'BOTS'
      },
      {
        stepName: 'SETMANUAL',
        status: 'NEW',
        who: 'BOTS'
      },
      {
        stepName: 'CLOSESR',
        status: 'NEW',
        who: 'TIBCO'
      }
    ]
  },
  {
    name: 'Create New Customer, Account and Service',
    woType: 'WONC-ACCSER',
    intxnType: 'REQSR',
    steps: [
      {
        stepName: 'CREATEACCT',
        status: 'NEW',
        who: 'BOTS'
      },
      {
        stepName: 'CREATESERVICE',
        status: 'NEW',
        who: 'BOTS'
      },
      {
        stepName: 'SETMANUAL',
        status: 'NEW',
        who: 'BOTS'
      },
      {
        stepName: 'CLOSESR',
        status: 'NEW',
        who: 'TIBCO'
      }
    ]
  },
  {
    name: 'Create New Customer, Account and Service',
    woType: 'WONC-SER',
    intxnType: 'REQSR',
    steps: [
      {
        stepName: 'CREATESERVICE',
        status: 'NEW',
        who: 'BOTS'
      },
      {
        stepName: 'SETMANUAL',
        status: 'NEW',
        who: 'BOTS'
      },
      {
        stepName: 'CLOSESR',
        status: 'NEW',
        who: 'TIBCO'
      }
    ]
  },
  {
    name: 'Bar Service',
    woType: 'BAR',
    intxnType: 'REQSR',
    steps: [
      {
        stepName: 'CREATEBARUNBAR',
        status: 'NEW',
        who: 'BOTS'
      },
      {
        stepName: 'PROCESSBARUNBAR',
        status: 'NEW',
        who: 'TIBCO'
      }
    ]
  },
  {
    name: 'UnBar Service',
    woType: 'UNBAR',
    intxnType: 'REQSR',
    steps: [
      {
        stepName: 'CREATEBARUNBAR',
        status: 'NEW',
        who: 'BOTS'
      },
      {
        stepName: 'PROCESSBARUNBAR',
        status: 'NEW',
        who: 'TIBCO'
      }
    ]
  },
  {
    name: 'Upgrade Service',
    woType: 'UPGRADE',
    intxnType: 'REQSR',
    steps: [
      {
        stepName: 'CREATEPLANCHNG',
        status: 'NEW',
        who: 'BOTS'
      },
      {
        stepName: 'CLOSESR',
        status: 'NEW',
        who: 'TIBCO'
      }
    ]
  },
  {
    name: 'Downgrade Service',
    woType: 'DOWNGRADE',
    intxnType: 'REQSR',
    steps: [
      {
        stepName: 'CREATEPLANCHNG',
        status: 'NEW',
        who: 'BOTS'
      },
      {
        stepName: 'CLOSESR',
        status: 'NEW',
        who: 'TIBCO'
      }
    ]
  },
  {
    name: 'VAS Activation',
    woType: 'VASACT',
    intxnType: 'REQSR',
    steps: [
      {
        stepName: 'CREATEVASCER',
        status: 'NEW',
        who: 'BOTS'
      },
      {
        stepName: 'CREATEVASOMS',
        status: 'NEW',
        who: 'BOTS'
      }, {
        stepName: 'CLOSESR',
        status: 'NEW',
        who: 'TIBCO'
      }
    ]
  },
  {
    name: 'VAS De-Activation',
    woType: 'VASDEACT',
    intxnType: 'REQSR',
    steps: [
      {
        stepName: 'CREATEVASCER',
        status: 'NEW',
        who: 'BOTS'
      },
      {
        stepName: 'CREATEVASOMS',
        status: 'NEW',
        who: 'BOTS'
      }, {
        stepName: 'CLOSESR',
        status: 'NEW',
        who: 'TIBCO'
      }
    ]
  },
  {
    name: 'Teleport Service',
    woType: 'TELEPORT',
    intxnType: 'REQSR',
    steps: [
      {
        stepName: 'CREATETELEPORT',
        status: 'NEW',
        who: 'BOTS'
      },
      {
        stepName: 'CLOSESR',
        status: 'NEW',
        who: 'TIBCO'
      }
    ]
  },
  {
    name: 'Relocate Service',
    woType: 'RELOCATE',
    intxnType: 'REQSR',
    steps: [
      {
        stepName: 'CREATERELOCATE',
        status: 'NEW',
        who: 'BOTS'
      },
      {
        stepName: 'CLOSESR',
        status: 'NEW',
        who: 'TIBCO'
      }
    ]
  },
  {
    name: 'Terminate Service',
    woType: 'TERMINATE',
    intxnType: 'REQSR',
    steps: [
      {
        stepName: 'CREATETERMINATE',
        status: 'NEW',
        who: 'BOTS'
      },
      {
        stepName: 'CLOSESR',
        status: 'NEW',
        who: 'TIBCO'
      }
    ]
  },
  {
    name: 'Fault',
    woType: 'FAULT',
    intxnType: 'REQCOMP',
    steps: [
      {
        stepName: 'CREATEFAULT',
        status: 'NEW',
        who: 'BOTS'
      }
    ]
  }
]
