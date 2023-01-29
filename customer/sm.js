const fetchMachine = Machine(
  {
    id: 'CreateSR',
    initial: 'created',
    context: {
      retries: 0
    },
    states: {
      created: {
        on: {
          target: 'CustAcctCreation',
          action: 'CreateCustAndAccount'
        }
      },
      CustAcctCreation: {
        on: {
          SUCCESS: {
            target: 'SvcCreation',
            action: 'CreateService'
          },
          FALIURE: 'failure'
        }
      },
      SvcCreation: {
        on: {
          SUCCESS: {
            target: 'DBUpdate',
            action: 'UpdateExternalReferences'
          },
          FALIURE: 'failure'
        }
      },
      DBUpdate: {
        on: {
          SUCCESS: 'CLOSED',
          FALIURE: 'FAILED'
        }
      },
      FAILED: {
        on: {
          SUCCESS: {
            target: 'CLOSED',
            action: 'ResolveManually'
          },
          FALIURE: 'failure'
        }
      },
      CLOSED: {
        on: {
          SUCCESS: {
            target: 'SvcCreation',
            action: 'CreateAccountAndService'
          },
          FALIURE: 'failure'
        }
      }
    }
  },
  {
    actions: [{
      CreateCustAndAccount: (context, event) => {
        console.log('Creating Customer & Account...')
      },
      CreateService: (context, event) => {
        console.log('Creating Service...')
      },
      UpdateExternalReferences: (context, event) => {
        console.log('Updating external references...')
      },
      ResolveManually: (context, event) => {
        console.log('Resolving manually...')
      }
    }]
  }
)
