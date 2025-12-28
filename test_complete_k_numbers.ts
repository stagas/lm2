import { lex } from './src/lang/lexer.ts'
import { parse } from './src/lang/parser.ts'
import { extractNumberLiteralsFromProgram } from './src/engine/bytecode/extract-numbers.ts'

// Test cases
const testCases = [
  { input: '10k', expected: 10000 },
  { input: '10.1k', expected: 10100 },
  { input: '.1k', expected: 100 },
  { input: '10.k', expected: 10000 },
  { input: '123', expected: 123 },
  { input: '45.67', expected: 45.67 },
  { input: '0.5k', expected: 500 },
  { input: '1k', expected: 1000 },
]

console.log('Testing complete k-number parsing pipeline:')

let allPassed = true

for (const test of testCases) {
  try {
    // Test lexer
    const lexResult = lex(test.input)
    const tokenValue = lexResult.tokens[0]?.value
    if (tokenValue !== test.expected) {
      console.log(`✗ Lexer: ${test.input} -> ${tokenValue} (expected ${test.expected})`)
      allPassed = false
      continue
    }

    // Test parser
    const parseResult = parse(test.input, lexResult.tokens)
    const literals = extractNumberLiteralsFromProgram(parseResult.program)
    const literalValue = literals[0]?.value
    if (literalValue !== test.expected) {
      console.log(`✗ Parser: ${test.input} -> ${literalValue} (expected ${test.expected})`)
      allPassed = false
      continue
    }

    console.log(`✓ ${test.input} -> ${test.expected}`)
  } catch (error) {
    console.log(`✗ ${test.input} -> Error: ${error}`)
    allPassed = false
  }
}

console.log(allPassed ? '\nAll tests passed!' : '\nSome tests failed!')
