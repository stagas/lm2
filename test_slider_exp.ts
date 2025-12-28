import { lex } from './src/lang/lexer.ts'
import { parse } from './src/lang/parser.ts'
import { extractNumberParamsFromProgram } from './src/engine/bytecode/extract-numbers.ts'

// Test cases for slider with optional exp parameter
const testCases = [
  { input: '100 (0 1000)', expected: { min: 0, max: 1000, exp: undefined } },
  { input: '100 (0 1000 2)', expected: { min: 0, max: 1000, exp: 2 } },
  { input: '50 (10 200 0.5)', expected: { min: 10, max: 200, exp: 0.5 } },
  { input: '0.5 (0.0001 1 0.25)', expected: { min: 0.0001, max: 1, exp: 0.25 } },
]

console.log('Testing slider exp parameter parsing:')

let allPassed = true

for (const test of testCases) {
  try {
    const lexResult = lex(test.input)
    if (lexResult.errors.length > 0) {
      console.log(`✗ Lexer error for ${test.input}: ${lexResult.errors[0].message}`)
      allPassed = false
      continue
    }

    const parseResult = parse(test.input, lexResult.tokens)
    if (parseResult.errors.length > 0) {
      console.log(`✗ Parser error for ${test.input}: ${parseResult.errors[0].message}`)
      allPassed = false
      continue
    }

    const params = extractNumberParamsFromProgram(parseResult.program)
    if (params.length === 0) {
      console.log(`✗ No slider params extracted for ${test.input}`)
      allPassed = false
      continue
    }

    const param = params[0]
    const passed = param.min === test.expected.min &&
                   param.max === test.expected.max &&
                   param.exp === test.expected.exp

    if (passed) {
      console.log(`✓ ${test.input} -> min:${param.min}, max:${param.max}, exp:${param.exp}`)
    } else {
      console.log(`✗ ${test.input} -> expected min:${test.expected.min}, max:${test.expected.max}, exp:${test.expected.exp} but got min:${param.min}, max:${param.max}, exp:${param.exp}`)
      allPassed = false
    }
  } catch (error) {
    console.log(`✗ Exception for ${test.input}: ${error}`)
    allPassed = false
  }
}

console.log(allPassed ? '\nAll tests passed!' : '\nSome tests failed!')
