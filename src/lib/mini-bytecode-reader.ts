import { ARRAY_HEADER_SIZE, MINI_HEADER_SIZE, OP_EVENT, OP_EVENT_BASE_SIZE } from '../../as/assembly/constants.ts'

export function readEventValue(bytecode: Float32Array, opIndex: number): number | null {
  const pc = ARRAY_HEADER_SIZE + MINI_HEADER_SIZE + opIndex
  const arrayLength = bytecode[ARRAY_HEADER_SIZE] as number

  if (pc >= ARRAY_HEADER_SIZE + MINI_HEADER_SIZE + arrayLength) return null

  const op = bytecode[pc] as number
  if (op !== OP_EVENT) return null

  const valueCount = bytecode[pc + 1] as number
  if (valueCount <= 0) return null

  return bytecode[pc + 7] as number
}

export function readEventValues(bytecode: Float32Array, opIndex: number): number[] {
  const pc = ARRAY_HEADER_SIZE + MINI_HEADER_SIZE + opIndex
  const arrayLength = bytecode[ARRAY_HEADER_SIZE] as number

  if (pc >= ARRAY_HEADER_SIZE + MINI_HEADER_SIZE + arrayLength) return []

  const op = bytecode[pc] as number
  if (op !== OP_EVENT) return []

  const valueCount = bytecode[pc + 1] as number
  if (valueCount <= 0) return []

  const values: number[] = []
  for (let i = 0; i < valueCount && i < 16; i++) {
    const value = bytecode[pc + 7 + i] as number
    if (value > 0) {
      values.push(value)
    }
  }
  return values
}

