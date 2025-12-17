import { tokenizer } from './src/engine/tokenizer.ts'

const lines = [
  `mini('`,
  `  [ii v]$$.5/2 c4 e4 1,2,3 c4e4a4?;.3\\+.4',`,
]

console.log('Testing modifiers coloring:')
for (let i = 0; i < lines.length; i++) {
  const tokens = tokenizer(lines[i], i === 0)
  console.log(`\nLine ${i+1}: ${lines[i]}`)
  for (const t of tokens) console.log(`  [${t.type}] "${t.content}"`)
}
