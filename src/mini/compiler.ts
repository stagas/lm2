import { MINI_HEADER_SIZE } from '../../as/assembly/constants.ts'
import type { MiniSourceMapEntry } from './bytecode.ts'
import { allocateBytecode, writeCycleEndOp, writeCycleStartOp, writeEventOp, writeGroupEndOp, writeGroupStartOp,
  writeOctaveOp, writeRestOp, writeScaleOp, writeSwingOp, writeTransposeOp } from './bytecode.ts'
import type { DefaultScale, Node } from './tokenizer.ts'
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
    const mode = node.parallel ? 2 : node.angle ? 1 : 0
    let currentOffset = writeGroupStartOp(bytecode, offset, node.children.length, mode, node.modifiers)
    for (const child of node.children) {
      currentOffset += compileNode(child, bytecode, offset + currentOffset)
    }
    currentOffset += writeGroupEndOp(bytecode, offset + currentOffset)
    return currentOffset
  }
  else if (node.type === 'rest') {
    // Encode rests as value-less events so they still consume a timed slot in MiniEvents.
    // `OP_REST` does not currently participate in timing, while `OP_EVENT` always does.
    return writeEventOp(bytecode, offset, [], node.modifiers)
  }
  else if (node.type === 'octave') {
    return writeOctaveOp(bytecode, offset, node.values[0] ?? 0)
  }
  else if (node.type === 'transpose') {
    return writeTransposeOp(bytecode, offset, node.values[0] ?? 0)
  }
  else if (node.type === 'scale') {
    return writeScaleOp(bytecode, offset, node.values[0] ?? 0, node.values[1] ?? 0)
  }
  else if (node.type === 'swing') {
    return writeSwingOp(bytecode, offset, node.values[0] ?? 0)
  }
  else if (node.type === 'at') {
    let currentOffset = writeCycleStartOp(
      bytecode,
      offset,
      node.values[0] ?? 0,
      node.values[1] ?? 0,
      node.children.length,
    )
    for (const child of node.children) {
      currentOffset += compileNode(child, bytecode, offset + currentOffset)
    }
    currentOffset += writeCycleEndOp(bytecode, offset + currentOffset)
    return currentOffset
  }
  return 0
}

const cacheByMiniNotation = new Map<string,
  { bytecode: Float32Array; sourceMap: MiniSourceMapEntry[]; nodes: Node[] }>()

export function compileMiniNotation(
  input: string,
  options: { seed?: number; defaultScale?: DefaultScale } = {},
) {
  const cached = cacheByMiniNotation.get(input)
  if (cached) return cached

  if (cacheByMiniNotation.size > 1000) {
    cacheByMiniNotation.clear()
  }

  const tokens = tokenize(input)
  const nodes = tokensToNodes(tokens, input, { defaultScale: options.defaultScale })

  const root: Node = {
    type: 'group',
    values: [],
    children: nodes,
    modifiers: getDefaultMods(),
    angle: false,
    parallel: false,
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

  const result = { bytecode: trimmedBytecode, sourceMap, nodes }
  cacheByMiniNotation.set(input, result)
  return result
}
