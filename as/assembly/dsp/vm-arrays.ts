import { ARRAY_HISTORY_ENTRY_SIZE, ARRAY_HISTORY_SIZE } from '../constants'
import { setVmError } from '../globals'
import { Program } from '../program'
import { VmTag } from './types'
import { VmStack } from './vm-stack'

export class VmArrays {
  count: i32 = 0
  elemCount: i32 = 0
  start: StaticArray<i32> = new StaticArray<i32>(512)
  len: StaticArray<i32> = new StaticArray<i32>(512)
  createPc: StaticArray<i32> = new StaticArray<i32>(512)
  elemTag: StaticArray<i32> = new StaticArray<i32>(8192)
  elemNum: StaticArray<f64> = new StaticArray<f64>(8192)
  elemAux: StaticArray<i32> = new StaticArray<i32>(8192)

  @inline
  recordAccess(program: Program, createPc: i32, index: i32): void {
    // Best-effort ring buffer for UI widgets (no atomics needed).
    const hist = program.arrayAccessHistory
    const writePos = i32(hist[0])
    const slot = writePos % ARRAY_HISTORY_SIZE
    const base = 1 + slot * ARRAY_HISTORY_ENTRY_SIZE
    hist[base] = f32(createPc)
    hist[base + 1] = f32(index)
    hist[0] = f32((writePos + 1) & 0xfffff)
  }

  @inline
  wrapIndex(indexTag: VmTag, indexNum: f64, len: i32): i32 {
    // Wrap for JS-like negative indexing and keep index in-bounds without branching in the language.
    let i = i32(indexTag === VmTag.Bool ? (indexNum != 0.0 ? 1 : 0) : indexNum)
    i = i % len
    if (i < 0) i += len
    return i
  }

  @inline
  create(n: i32, stack: VmStack, pc: i32): void {
    const arrId = this.count
    const start = this.elemCount
    const end = start + n

    if (arrId < 0 || arrId >= this.start.length) {
      setVmError(20, pc)
      stack.push(VmTag.Undef)
      return
    }
    if (end < 0 || end > this.elemTag.length) {
      setVmError(21, pc)
      stack.push(VmTag.Undef)
      return
    }

    this.start[arrId] = start
    this.len[arrId] = n
    this.createPc[arrId] = pc
    this.count = arrId + 1
    this.elemCount = end

    for (let i = n - 1; i >= 0; i--) {
      const idx = stack.pop()
      this.elemTag[start + i] = stack.tag[idx]
      this.elemNum[start + i] = stack.num[idx]
      this.elemAux[start + i] = stack.aux[idx]
    }

    stack.push(VmTag.Arr, 0.0, arrId)
  }

  @inline
  getIndex(stack: VmStack, program: Program): void {
    const indexIdx = stack.pop()
    const arrayIdx = stack.pop()
    const arrayTag = stack.tag[arrayIdx] as VmTag
    const arrayAux = stack.aux[arrayIdx]
    const indexTag = stack.tag[indexIdx] as VmTag
    const indexNum = stack.num[indexIdx]

    if (arrayTag !== VmTag.Arr) {
      stack.push(VmTag.Undef)
      return
    }

    const arrId = arrayAux
    if (arrId < 0 || arrId >= this.count) {
      stack.push(VmTag.Undef)
      return
    }

    const start = this.start[arrId]
    const len = this.len[arrId]
    if (len <= 0) {
      stack.push(VmTag.Undef)
      return
    }

    const i = this.wrapIndex(indexTag, indexNum, len)
    this.recordAccess(program, this.createPc[arrId], i)

    const at = start + i
    stack.push(this.elemTag[at] as VmTag, this.elemNum[at], this.elemAux[at])
  }

  @inline
  setIndex(stack: VmStack): void {
    const valueIdx = stack.pop()
    const indexIdx = stack.pop()
    const arrayIdx = stack.pop()

    const arrayTag = stack.tag[arrayIdx] as VmTag
    const arrayAux = stack.aux[arrayIdx]
    const indexTag = stack.tag[indexIdx] as VmTag
    const indexNum = stack.num[indexIdx]

    if (arrayTag !== VmTag.Arr) {
      stack.push(VmTag.Undef)
      return
    }

    const arrId = arrayAux
    if (arrId < 0 || arrId >= this.count) {
      stack.push(VmTag.Undef)
      return
    }

    const start = this.start[arrId]
    const len = this.len[arrId]
    if (len <= 0) {
      stack.push(VmTag.Undef)
      return
    }

    const i = this.wrapIndex(indexTag, indexNum, len)
    const at = start + i
    this.elemTag[at] = stack.tag[valueIdx]
    this.elemNum[at] = stack.num[valueIdx]
    this.elemAux[at] = stack.aux[valueIdx]

    stack.push(stack.tag[valueIdx] as VmTag, stack.num[valueIdx], stack.aux[valueIdx])
  }

  @inline
  reset(): void {
    this.count = 0
    this.elemCount = 0
  }
}

