import { MINI_HEADER_SIZE } from '../../as/assembly/constants.ts'
import type { MiniSourceMapEntry } from './bytecode.ts'
import { allocateBytecode, writeEventOp, writeGroupEndOp, writeGroupStartOp, writeRestOp } from './bytecode.ts'
import type { Node } from './tokenizer.ts'
import { getDefaultMods, tokenize, tokensToNodes } from './tokenizer.ts'

function compileNode(
  node: Node,
  bytecode: Float32Array,
  offset: number,
): number {
  if (node.type === 'event') {
    return writeEventOp(bytecode, offset, node.values, node.modifiers)
  }
  else if (node.type === 'group') {
    let currentOffset = writeGroupStartOp(bytecode, offset, node.children.length, node.angle, node.modifiers)
    for (const child of node.children) {
      currentOffset += compileNode(child, bytecode, offset + currentOffset)
    }
    currentOffset += writeGroupEndOp(bytecode, offset + currentOffset)
    return currentOffset
  }
  else if (node.type === 'rest') {
    return writeRestOp(bytecode, offset)
  }
  return 0
}

export function compileMiniNotation(
  input: string,
  options: { seed?: number } = {},
) {
  const tokens = tokenize(input)
  const nodes = tokensToNodes(tokens, input)

  const root: Node = {
    type: 'group',
    values: [],
    children: nodes,
    modifiers: getDefaultMods(),
    angle: false,
    source: {
      start: 0,
      length: input.length,
      text: input,
    },
  }

  const bytecode = allocateBytecode(1024)
  let offset = compileNode(root, bytecode, 0)
  bytecode[0] = offset

  const usedSize = MINI_HEADER_SIZE + offset
  const trimmedBytecode = bytecode.slice(0, usedSize)

  const sourceMap: MiniSourceMapEntry[] = []

  return { bytecode: trimmedBytecode, sourceMap }
}
