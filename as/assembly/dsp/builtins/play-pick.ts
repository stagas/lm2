// dprint-ignore-file
import { globalSampleCount, vmErrorCode } from '../../globals'
import { Program } from '../../program'
import { playMini } from './play-mini'
import { Dsp } from '../dsp'
import { VmTag } from '../types'
import { VmAudio } from '../vm-audio'
import { VmStack } from '../vm-stack'

// @ts-ignore
@inline
export function callPlayPick(
  posCount: i32,
  posTags: StaticArray<i32>,
  posNums: StaticArray<f64>,
  posAux: StaticArray<i32>,
  stack: VmStack,
  audio: VmAudio,
  program: Program,
  length: i32,
  left$: usize,
  right$: usize,
  dsp: Dsp,
  miniTrigOuts: StaticArray<i32>,
  miniVelOuts: StaticArray<i32>,
  miniValOuts: StaticArray<i32>,
  cbArgTags: StaticArray<i32>,
  cbArgNums: StaticArray<f64>,
  cbArgAux: StaticArray<i32>,
): void {
  if (posCount < 3) {
    stack.push(VmTag.Undef)
    return
  }

  const seqsTag = posTags[0] as VmTag
  const seqsId = posAux[0]
  const idxTag = posTags[1] as VmTag
  const idxNum = posNums[1]
  const idxAux = posAux[1]
  const cbTag = posTags[2] as VmTag
  const cbAux = posAux[2]

  if (seqsTag !== VmTag.Arr || cbTag !== VmTag.Func) {
    stack.push(VmTag.Undef)
    return
  }

  if (seqsId < 0 || seqsId >= dsp.arrays.count) {
    stack.push(VmTag.Undef)
    return
  }
  if ((dsp.arrays.elemType[seqsId] as VmTag) !== VmTag.Num) {
    stack.push(VmTag.Undef)
    return
  }

  const seqStart = dsp.arrays.start[seqsId]
  const seqLen = dsp.arrays.len[seqsId]
  if (seqLen <= 0) {
    stack.push(VmTag.Undef)
    return
  }

  const savedSample = globalSampleCount
  const savedTHas = audio.tHas
  const savedTOutIndex = audio.tOutIndex

  const outIndex = audio.allocOut(program)
  const out$ = program.getOutBuffer(outIndex)
  memory.fill(out$, 0, (length << 2) as usize)

  const maxSegs: i32 = 32
  let segCount: i32 = 0

  if (idxTag !== VmTag.Audio) {
    const pick = i32(idxNum)
    let i = pick % seqLen
    if (i < 0) i += seqLen
    const seqIndex = i32(dsp.arrays.elemNum[seqStart + i])

    audio.tHas = 0
    playMini(seqIndex, cbAux, stack, audio, program, length, left$, right$, dsp, miniTrigOuts, miniVelOuts, miniValOuts,
      cbArgTags, cbArgNums, cbArgAux)
    if (vmErrorCode !== 0) {
      globalSampleCount = savedSample
      audio.tHas = savedTHas
      audio.tOutIndex = savedTOutIndex
      return
    }

    const mixIdx = stack.pop()
    const mixTag = stack.tag[mixIdx] as VmTag
    const mixNum = stack.num[mixIdx]
    const mixAux = stack.aux[mixIdx]
    const mix$ = audio.toAudioPtr(mixTag, mixNum, mixAux, length, program)
    memory.copy(out$, mix$, (length << 2) as usize)

    globalSampleCount = savedSample
    audio.tHas = savedTHas
    audio.tOutIndex = savedTOutIndex
    stack.push(VmTag.Audio, 0.0, outIndex)
    return
  }

  const idx$ = audio.toAudioPtr(idxTag, idxNum, idxAux, length, program)
  let segStart: i32 = 0
  let prev: i32 = i32(load<f32>(idx$))

  for (let i: i32 = 1; i < length; i++) {
    const cur = i32(load<f32>(idx$ + (i << 2)))
    if (cur === prev) continue
    if (segCount++ >= maxSegs) break

    const segLen: i32 = i - segStart
    globalSampleCount = savedSample + segStart
    audio.tHas = 0
    let p = prev % seqLen
    if (p < 0) p += seqLen
    const seqIndex = i32(dsp.arrays.elemNum[seqStart + p])
    playMini(seqIndex, cbAux, stack, audio, program, segLen, left$ + (segStart << 2), right$ + (segStart << 2), dsp, miniTrigOuts,
      miniVelOuts, miniValOuts, cbArgTags, cbArgNums, cbArgAux)
    if (vmErrorCode !== 0) break
    const mixIdx = stack.pop()
    const mixTag = stack.tag[mixIdx] as VmTag
    const mixNum = stack.num[mixIdx]
    const mixAux = stack.aux[mixIdx]
    const mix$ = audio.toAudioPtr(mixTag, mixNum, mixAux, segLen, program)
    memory.copy(out$ + (segStart << 2), mix$, (segLen << 2) as usize)

    segStart = i
    prev = cur
  }

  if (vmErrorCode === 0 && segStart < length) {
    const segLen: i32 = length - segStart
    globalSampleCount = savedSample + segStart
    audio.tHas = 0
    let p = prev % seqLen
    if (p < 0) p += seqLen
    const seqIndex = i32(dsp.arrays.elemNum[seqStart + p])
    playMini(seqIndex, cbAux, stack, audio, program, segLen, left$ + (segStart << 2), right$ + (segStart << 2), dsp, miniTrigOuts,
      miniVelOuts, miniValOuts, cbArgTags, cbArgNums, cbArgAux)
    if (vmErrorCode !== 0) {
      globalSampleCount = savedSample
      audio.tHas = savedTHas
      audio.tOutIndex = savedTOutIndex
      return
    }
    const mixIdx = stack.pop()
    const mixTag = stack.tag[mixIdx] as VmTag
    const mixNum = stack.num[mixIdx]
    const mixAux = stack.aux[mixIdx]
    const mix$ = audio.toAudioPtr(mixTag, mixNum, mixAux, segLen, program)
    memory.copy(out$ + (segStart << 2), mix$, (segLen << 2) as usize)
  }

  globalSampleCount = savedSample
  audio.tHas = savedTHas
  audio.tOutIndex = savedTOutIndex

  if (vmErrorCode !== 0) return
  stack.push(VmTag.Audio, 0.0, outIndex)
}


