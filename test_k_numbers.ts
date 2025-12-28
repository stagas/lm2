import { lex } from './src/lang/lexer.ts'

console.log('Testing k-number parsing:')

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

let allPassed = true

for (const test of testCases) {
  const result = lex(test.input)
  const actual = result.tokens[0]?.value
  const passed = actual === test.expected
  console.log(`${test.input} -> ${actual} ${passed ? '✓' : '✗ (expected ' + test.expected + ')'} `)
  if (!passed) allPassed = false
}

console.log(allPassed ? 'All tests passed!' : 'Some tests failed!')
