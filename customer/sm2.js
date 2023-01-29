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
          CreateCustAndAccount: 'CustAcctCreation'
        }
      },
      CustAcctCreation: {
        on: {
          SUCCESS: {
            CreateService: 'SvcCreation'
          },
          FALIURE: 'FAILED'
        }
      },
      SvcCreation: {
        on: {
          SUCCESS: {
            UpdateExternalReferences: 'DBUpdate'
          },
          FALIURE: 'FAILED'
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
          ResolveManually: 'CLOSED',
          FALIURE: 'FAILED'
        }
      },
      CLOSED: {
        type: 'final'
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
