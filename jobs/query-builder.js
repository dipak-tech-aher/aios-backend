import { QueryTypes } from 'sequelize'
import { sequelize } from '../model'
import jsonata from 'jsonata'
import config from 'config'

export const formateSelectQuery = async (json, context) => {
  let query
  let columns = ' '
  let tables = ''
  let joins = ' '
  let params
  // Finding table columns
  for (const col of json.columns) {
    columns = columns + col.tableName + '.' + col.columnName + ', '
  }
  columns = columns.substring(0, columns.lastIndexOf(','))

  // If JSON has only one table

  // console.log('json.tables...', json.tables)

  if (json.tables.length === 1) {
    joins = ' FROM ' + json.tables[0]

    // console.log('json.tables[0]...', json.tables[0], '  ', joins)
  } else {
    // Finding tables from JSON
    for (const tbl of json.tables) {
      tables = tables + '\'' + tbl + '\','
    }
    tables = tables.substring(0, tables.lastIndexOf(','))
    // console.log('${tables}....', tables)
    const rawQuery = `SELECT
    tc.constraint_name,
      tc.table_name as src_table,
      kcu.column_name as src_column,
      tc.constraint_type,
      ccu.table_name AS join_table,
        ccu.column_name AS join_column
    FROM
    information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
ON tc.constraint_name = kcu.constraint_name
AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
ON ccu.constraint_name = tc.constraint_name
AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
and tc.table_schema = ${config.bcae.schema}
AND tc.table_name in (${tables})
and ccu.table_name in (${tables})`
    const results = await sequelize.query(rawQuery, {
      type: QueryTypes.SELECT
    })
    let fromClause = null
    // console.log('results...', results)
    // Appending join condotions
    for (const table of results) {
      if (fromClause === null) {
        fromClause = ' FROM  ' + table.src_table
      }
      joins = joins + ' INNER JOIN ' + table.join_table + ' ON ' + table.src_table + '.' + table.src_column + ' = ' + table.join_table + '.' + table.join_column
    }
    joins = fromClause + joins
  }

  query = json.queryType + columns + joins
  // console.log('joins.....', joins)
  // console.log('query.....', query)
  let waitClause
  if (json.waitUntil) {
    const wait = true
    waitClause = formatWhereClause(json.waitUntil[0], context, wait)
    if (waitClause) {
      waitClause = waitClause.sql
    }
  }
  // appending where clause if available
  if (json.where) {
    const whereClause = formatWhereClause(json.where[0], context)
    params = whereClause.params
    query = query + ' WHERE ' + whereClause.sql
  }
  return { query, params, waitClause, tables }
}

export const formateInsertQuery = async (json, context) => {
  const columns = []
  let query
  if (Array.isArray(json.tables) && Array.isArray(json.rowsToInsert) && json.tables.length === 1) {
    let values = '('
    for (const row of json.rowsToInsert) {
      for (const field of row.fields) {
        for (const col of json.columns) {
          if (col.tableName === field.tableName && col.columnName === field.columnName) {
            if (field.valueType === 'TEXT') {
              if (values === '(') {
                values = values + '\'' + field.value + '\''
              } else {
                values = values + ',\'' + field.value + '\''
              }
            } else if (field.valueType === 'EXPR') {
              const expression = jsonata(field.value)
              if (values === '(') {
                values = values + '\'' + expression.evaluate(context) + '\''
              } else {
                values = values + ',\'' + expression.evaluate(context) + '\''
              }
            }
            if (columns.includes(field.columnName) === false) {
              columns.push(field.columnName)
            }
          }
        }
      }
      // values = values + systemUserId + ',' + systemUserId + ',\'2021-07-28 18:50:21\'' + ',\'2021-07-28 18:50:21\''
      values = values + ')'
    }
    // values = values.substring(0, values.lastIndexOf(','))
    // Pushing audit columns
    // columns.push('created_by', 'updated_by', 'created_at', 'updated_at')
    query = 'INSERT INTO ' + json.tables[0] + '(' + columns + ') VALUES' + values + ';'
  }
  return query
}

export const formateUpdateQuery = async (json, context) => {
  let query
  let params
  if (Array.isArray(json.tables) && json.tables.length === 1) {
    let values = ''
    if (Array.isArray(json.rowToUpdate)) {
      for (const row of json.rowToUpdate) {
        for (const field of row.fields) {
          for (const col of json.columns) {
            if (col.tableName === field.tableName && col.columnName === field.columnName && field.valueType === 'TEXT') {
              values = values + field.columnName + ' = \'' + field.value + '\','
            }
          }
        }
      }
      values = values.substring(0, values.lastIndexOf(','))
      query = 'UPDATE ' + json.tables[0] + ' SET ' + values
      // appending where clause if available
      if (json.where) {
        const whereClause = formatWhereClause(json.where[0], context)
        params = whereClause.params
        query = query + ' WHERE ' + whereClause.sql + ';'
      }
    }
  }
  return { query, params }
}

export const formatWhereClause = (ruleGroup, context, wait) => {
  // console.log('ruleGroup.......', ruleGroup)
  // console.log('context.......', context)
  // console.log('wait.......', wait)

  const format = 'parameterized'

  const formatLowerCase = format.toLowerCase()

  const parameterized = formatLowerCase === 'parameterized'
  const params = []
  const processRule = (rule) => {
    if (rule.valueType === 'EXPR') {
      // console.log('rule.value.....00', rule.value)

      const expression = jsonata(rule.value)
      rule.value = expression.evaluate(context)

      // console.log('expression.....', expression.evaluate)
      // console.log('rule.value.....', rule.value)
    }
    if (rule.fieldType === 'EXPR') {
      // console.log('rule.field--->', rule.field)
      const expression = jsonata(rule.field)
      rule.field = expression.evaluate(context)
      // console.log('expression-----', expression)
      // console.log('rule.field---1', rule.field)
    }
    const value = defaultValueProcessor(rule.tableName, rule.field, rule.operator, rule.value)
    const operator = mapOperator(rule.operator)
    if (parameterized && value) {
      if (operator.toLowerCase() === 'in' || operator.toLowerCase() === 'not in') {
        const splitValue = rule.value.split(',').map((v) => v.trim())
        splitValue.forEach((v) => params.push(v))
        if (wait) {
          return `${rule.field} ${operator} (${splitValue.map(() => '?').join(', ')})`
        }
        return `${rule.field.tableName}.${rule.field.value} ${operator} (${splitValue.map(() => '?').join(', ')})`
      }
      params.push(value.match(/^'?(.*?)'?$/)[1])
    }
    if (wait) {
      return `'${rule.field}' ${operator} ${value} `.trim()
    }
    return `${rule.field.tableName}.${rule.field.value} ${operator} ${parameterized && value ? '?' : value} `.trim()
  }
  const processRuleGroup = (rg) => {
    const processedRules = rg.rules.map((rule) => {
      if (isRuleGroup(rule)) {
        return processRuleGroup(rule)
      }
      return processRule(rule)
    })
    return `${rg.not ? 'NOT ' : ''} (${processedRules.join(` ${rg.combinator} `)})`
  }
  return { sql: processRuleGroup(ruleGroup), params }
}

const isRuleGroup = (ruleOrGroup) => {
  const rg = ruleOrGroup
  return !!(rg.combinator && rg.rules)
}

const mapOperator = (op) => {
  switch (op.toLowerCase()) {
    case 'null':
      return 'is null'
    case 'notnull':
      return 'is not null'
    case 'notin':
      return 'not in'
    case 'contains':
    case 'beginswith':
    case 'endswith':
      return 'like'
    case 'doesnotcontain':
    case 'doesnotbeginwith':
    case 'doesnotendwith':
      return 'not like'
    default:
      return op
  }
}

const defaultValueProcessor = (_tableName, _field, operator, value) => {
  let val = `'${value}'`
  if (operator.toLowerCase() === 'null' || operator.toLowerCase() === 'notnull') {
    val = ''
  } else if (operator.toLowerCase() === 'in' || operator.toLowerCase() === 'notin') {
    val = `(${value
      .split(',')
      .map((v) => `'${v.trim()}'`)
      .join(', ')
      })`
  } else if (operator.toLowerCase() === 'contains' || operator.toLowerCase() === 'doesnotcontain') {
    val = `'%${value}%'`
  } else if (operator.toLowerCase() === 'beginswith' ||
    operator.toLowerCase() === 'doesnotbeginwith') {
    val = `'${value}%'`
  } else if (operator.toLowerCase() === 'endswith' || operator.toLowerCase() === 'doesnotendwith') {
    val = `'%${value}'`
  } else if (typeof value === 'boolean') {
    val = `${value} `.toUpperCase()
  }
  return val
}
