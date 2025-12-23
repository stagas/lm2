import {
  OP_CYCLE_END_SIZE,
  OP_CYCLE_START_SIZE,
  OP_EVENT_BASE_SIZE,
  OP_GROUP_END_SIZE,
  OP_GROUP_START_SIZE,
  OP_OCTAVE_SIZE,
  OP_REST_SIZE,
  OP_SCALE_SIZE,
  OP_SWING_SIZE,
  OP_TRANSPOSE_SIZE,
} from '../../as/assembly/constants.ts'
import type { Node } from '../mini/tokenizer.ts'

export interface SourceLocation {
  text: string
  start: number
  end: number
}

function buildSourceMapFromNodes(
  nodes: Node[],
  _bytecode: Float32Array,
  offset: number,
  map: Map<number, SourceLocation>,
): number {
  let currentOffset = offset

  for (const node of nodes) {
    if (node.type === 'event') {
      const opIndex = currentOffset
      map.set(opIndex, {
        text: node.source.text,
        start: node.source.start,
        end: node.source.start + node.source.length,
      })
      currentOffset += OP_EVENT_BASE_SIZE
    }
    else if (node.type === 'rest') {
      currentOffset += OP_REST_SIZE
    }
    else if (node.type === 'octave') {
      const opIndex = currentOffset
      map.set(opIndex, {
        text: node.source.text,
        start: node.source.start,
        end: node.source.start + node.source.length,
      })
      currentOffset += OP_OCTAVE_SIZE
    }
    else if (node.type === 'transpose') {
      const opIndex = currentOffset
      map.set(opIndex, {
        text: node.source.text,
        start: node.source.start,
        end: node.source.start + node.source.length,
      })
      currentOffset += OP_TRANSPOSE_SIZE
    }
    else if (node.type === 'scale') {
      const opIndex = currentOffset
      map.set(opIndex, {
        text: node.source.text,
        start: node.source.start,
        end: node.source.start + node.source.length,
      })
      currentOffset += OP_SCALE_SIZE
    }
    else if (node.type === 'swing') {
      const opIndex = currentOffset
      map.set(opIndex, {
        text: node.source.text,
        start: node.source.start,
        end: node.source.start + node.source.length,
      })
      currentOffset += OP_SWING_SIZE
    }
    else if (node.type === 'group') {
      currentOffset += OP_GROUP_START_SIZE
      currentOffset = buildSourceMapFromNodes(node.children, _bytecode, currentOffset, map)
      currentOffset += OP_GROUP_END_SIZE
    }
    else if (node.type === 'at') {
      currentOffset += OP_CYCLE_START_SIZE
      currentOffset = buildSourceMapFromNodes(node.children, _bytecode, currentOffset, map)
      currentOffset += OP_CYCLE_END_SIZE
    }
  }

  return currentOffset
}

export function buildMiniSourceMap(nodes: Node[], bytecode: Float32Array): Map<number, SourceLocation> {
  const map = new Map<number, SourceLocation>()
  buildSourceMapFromNodes(nodes, bytecode, OP_GROUP_START_SIZE, map)
  return map
}
