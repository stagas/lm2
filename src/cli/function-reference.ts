#!/usr/bin/env bun
import { functionDefinitions } from '../engine/ui/function-definitions.ts'

type FunctionSignature = {
  name: string
  parameters: Array<{
    name: string
    type: string
    optional?: boolean
    defaultValue?: any
    description: string
  }>
  returnType: string
  description: string
  examples: string[]
}

function formatParameter(param: FunctionSignature['parameters'][0]): string {
  let result = `${param.name}: ${param.type}`
  if (param.optional) {
    result += '?'
  }
  if (param.defaultValue !== undefined) {
    const defaultStr = typeof param.defaultValue === 'string'
      ? `"${param.defaultValue}"`
      : param.defaultValue
    result += ` = ${defaultStr}`
  }
  return result
}

function formatFunction(func: FunctionSignature): string {
  const params = func.parameters.map(formatParameter)
  let signature = `${func.name}(${params.join(', ')}) -> ${func.returnType}`

  // If signature is too long, break parameters into multiple lines
  if (signature.length > 80) {
    const paramLines = []
    let currentLine = `${func.name}(`
    const indent = ' '.repeat(func.name.length + 1)

    for (let i = 0; i < params.length; i++) {
      const param = params[i]
      const isLast = i === params.length - 1

      if (currentLine.length + param.length + (isLast ? 1 : 2) > 80 && currentLine !== `${func.name}(`) {
        paramLines.push(currentLine)
        currentLine = indent + param + (isLast ? ')' : ', ')
      } else {
        currentLine += param + (isLast ? ')' : ', ')
      }
    }

    if (paramLines.length === 0) {
      signature = currentLine + ` -> ${func.returnType}`
    } else {
      paramLines.push(currentLine)
      signature = paramLines.join('\n') + ` -> ${func.returnType}`
    }
  }

  return `${signature}\n  ${func.description}`
}

function main() {
  const args = process.argv.slice(2)

  if (args.length > 0 && (args[0] === '--help' || args[0] === '-h')) {
    console.log('Function Reference Generator')
    console.log('\nThis tool outputs a compact, human-readable reference of all available functions')
    console.log('from the DSP function definitions, sorted alphabetically.')
    console.log('\nUsage: bun src/cli/function-reference.ts')
    console.log('\nThe output format is:')
    console.log('  function_name(param1: type1, param2?: type2 = default) -> return_type')
    console.log('    Description here')
    console.log('\nOptional parameters are marked with ?, and default values are shown.')
    console.log('Long parameter lists are automatically wrapped for readability.')
    process.exit(0)
  }

  if (args.length > 0) {
    console.error('Error: This script takes no arguments. Use --help for usage information.')
    process.exit(1)
  }

  const functions = Object.values(functionDefinitions)
    .sort((a, b) => a.name.localeCompare(b.name))

  for (const func of functions) {
    console.log(formatFunction(func))
    console.log()
  }
}

main()
