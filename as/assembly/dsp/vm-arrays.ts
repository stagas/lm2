import { ARRAY_HISTORY_ENTRY_SIZE, ARRAY_HISTORY_SIZE } from '../constants'
import { setVmError } from '../globals'
import { Program } from '../program'
import { VmTag } from './types'
import { VmAudio } from './vm-audio'
import { VmStack } from './vm-stack'

export class VmArrays {
  count: i32 = 0
  elemCount: i32 = 0
  start: StaticArray<i32> = new StaticArray<i32>(512)
  len: StaticArray<i32> = new StaticArray<i32>(512)
  createPc: StaticArray<i32> = new StaticArray<i32>(512)
  elemType: StaticArray<i32> = new StaticArray<i32>(512)
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

    let tag0: i32 = -1
    let mixed: bool = false
    for (let i = n - 1; i >= 0; i--) {
      const idx = stack.pop()
      const t = stack.tag[idx]
      if (tag0 < 0) tag0 = t
      else if (t !== tag0) mixed = true
      this.elemTag[start + i] = t
      this.elemNum[start + i] = stack.num[idx]
      this.elemAux[start + i] = stack.aux[idx]
    }

    if (mixed) {
      // Mixed-type arrays are not supported; keep runtime predictable for audio-rate indexing.
      setVmError(22, pc)
      stack.push(VmTag.Undef)
      return
    }

    this.start[arrId] = start
    this.len[arrId] = n
    this.createPc[arrId] = pc
    this.elemType[arrId] = tag0
    this.count = arrId + 1
    this.elemCount = end

    stack.push(VmTag.Arr, 0.0, arrId)
  }

  @inline
  getIndex(stack: VmStack, audio: VmAudio, program: Program, length: i32): void {
    const indexIdx = stack.pop()
    const arrayIdx = stack.pop()
    const arrayTag = stack.tag[arrayIdx] as VmTag
    const arrayAux = stack.aux[arrayIdx]
    const indexTag = stack.tag[indexIdx] as VmTag
    const indexNum = stack.num[indexIdx]
    const indexAux = stack.aux[indexIdx]

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

    const elemType = this.elemType[arrId] as VmTag

    if (indexTag === VmTag.Audio) {
      if (length <= 0) {
        stack.push(VmTag.Undef)
        return
      }
      if (elemType !== VmTag.Num && elemType !== VmTag.Audio) {
        stack.push(VmTag.Undef)
        return
      }

      const index$ = audio.toAudioPtr(indexTag, indexNum, indexAux, length, program)
      const outIndex = audio.allocOut(program)
      const out$ = program.getOutBuffer(outIndex)

      let p$ = out$
      for (let s = 0; s < length; s++) {
        const x = load<f32>(index$ + (s << 2)) as f64
        let i = i32(x)
        i = i % len
        if (i < 0) i += len
        const at = start + i

        if (elemType === VmTag.Num) {
          store<f32>(p$, this.elemNum[at] as f32)
        }
        else {
          const srcIndex = this.elemAux[at]
          const src$ = program.getOutBuffer(srcIndex)
          store<f32>(p$, load<f32>(src$ + (s << 2)))
        }
        p$ += 4
      }

      // Record the sample-0 access for UI widgets.
      const i0 = i32(load<f32>(index$)) % len
      const i0w = i0 < 0 ? (i0 + len) : i0
      this.recordAccess(program, this.createPc[arrId], i0w)

      stack.push(VmTag.Audio, 0.0, outIndex)
      return
    }

    const i = this.wrapIndex(indexTag, indexNum, len)
    this.recordAccess(program, this.createPc[arrId], i)

    const at = start + i
    stack.push(this.elemTag[at] as VmTag, this.elemNum[at], this.elemAux[at])
  }

  @inline
  getIndex2(stack: VmStack, audio: VmAudio, program: Program, length: i32): void {
    const index2Idx = stack.pop()
    const index1Idx = stack.pop()
    const arrayIdx = stack.pop()

    const arrayTag = stack.tag[arrayIdx] as VmTag
    const arrayAux = stack.aux[arrayIdx]
    const index1Tag = stack.tag[index1Idx] as VmTag
    const index1Num = stack.num[index1Idx]
    const index1Aux = stack.aux[index1Idx]
    const index2Tag = stack.tag[index2Idx] as VmTag
    const index2Num = stack.num[index2Idx]
    const index2Aux = stack.aux[index2Idx]

    if (arrayTag !== VmTag.Arr) {
      stack.push(VmTag.Undef)
      return
    }

    const outerId = arrayAux
    if (outerId < 0 || outerId >= this.count) {
      stack.push(VmTag.Undef)
      return
    }

    const outerStart = this.start[outerId]
    const outerLen = this.len[outerId]
    if (outerLen <= 0) {
      stack.push(VmTag.Undef)
      return
    }

    const outerElemType = this.elemType[outerId] as VmTag
    if (outerElemType !== VmTag.Arr) {
      // Only handle arrays-of-arrays here; everything else should use normal GET_INDEX.
      stack.push(VmTag.Undef)
      return
    }

    const audio1 = index1Tag === VmTag.Audio
    const audio2 = index2Tag === VmTag.Audio

    if (!audio1 && !audio2) {
      const i1 = this.wrapIndex(index1Tag, index1Num, outerLen)
      this.recordAccess(program, this.createPc[outerId], i1)
      const outerAt = outerStart + i1
      const innerTag = this.elemTag[outerAt] as VmTag
      const innerId = this.elemAux[outerAt]
      if (innerTag !== VmTag.Arr || innerId < 0 || innerId >= this.count) {
        stack.push(VmTag.Undef)
        return
      }
      const innerStart = this.start[innerId]
      const innerLen = this.len[innerId]
      if (innerLen <= 0) {
        stack.push(VmTag.Undef)
        return
      }
      const i2 = this.wrapIndex(index2Tag, index2Num, innerLen)
      this.recordAccess(program, this.createPc[innerId], i2)
      const innerAt = innerStart + i2
      stack.push(this.elemTag[innerAt] as VmTag, this.elemNum[innerAt], this.elemAux[innerAt])
      return
    }

    if (length <= 0) {
      stack.push(VmTag.Undef)
      return
    }

    const index1$ = audio1 ? audio.toAudioPtr(index1Tag, index1Num, index1Aux, length, program) : 0
    const index2$ = audio2 ? audio.toAudioPtr(index2Tag, index2Num, index2Aux, length, program) : 0

    const outIndex = audio.allocOut(program)
    const out$ = program.getOutBuffer(outIndex)

    let p$ = out$
    const fixed1 = audio1 ? 0 : this.wrapIndex(index1Tag, index1Num, outerLen)
    let i10: i32 = fixed1
    let inner0: i32 = -1
    let i20: i32 = 0

    for (let s: i32 = 0; s < length; s++) {
      let i1: i32 = fixed1
      if (audio1) {
        const x1 = load<f32>(index1$ + (s << 2)) as f64
        i1 = i32(x1)
        i1 = i1 % outerLen
        if (i1 < 0) i1 += outerLen
      }

      const outerAt = outerStart + i1
      const innerId = this.elemAux[outerAt]
      if (s === 0) {
        i10 = i1
        inner0 = innerId
      }
      if (innerId < 0 || innerId >= this.count) {
        store<f32>(p$, 0.0 as f32)
        p$ += 4
        continue
      }

      const innerLen = this.len[innerId]
      if (innerLen <= 0) {
        store<f32>(p$, 0.0 as f32)
        p$ += 4
        continue
      }

      // Only support numeric inner arrays for audio-rate nested indexing.
      if ((this.elemType[innerId] as VmTag) !== VmTag.Num) {
        store<f32>(p$, 0.0 as f32)
        p$ += 4
        continue
      }

      let i2: i32 = 0
      if (audio2) {
        const x2 = load<f32>(index2$ + (s << 2)) as f64
        i2 = i32(x2)
      }
      else {
        i2 = this.wrapIndex(index2Tag, index2Num, innerLen)
      }
      i2 = i2 % innerLen
      if (i2 < 0) i2 += innerLen
      if (s === 0) i20 = i2

      const innerAt = this.start[innerId] + i2
      store<f32>(p$, this.elemNum[innerAt] as f32)
      p$ += 4
    }

    this.recordAccess(program, this.createPc[outerId], i10)
    if (inner0 >= 0 && inner0 < this.count) {
      this.recordAccess(program, this.createPc[inner0], i20)
    }

    stack.push(VmTag.Audio, 0.0, outIndex)
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
