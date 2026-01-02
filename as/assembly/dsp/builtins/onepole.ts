// dprint-ignore-file
import { Olp, Ohp } from '../../gen/onepole'
import { DEFAULT_Q, FILTER_DATA_OFFSET, FILTER_ENTRY_SIZE, FILTER_HISTORY_SIZE, FILTER_WRITE_POS_OFFSET } from '../../constants'
import { globalSampleCount } from '../../globals'
import { Program } from '../../program'
import { Op } from '../../shared'
import { VmSym } from '../vm-sym'
import { VmTag } from '../types'
import { VmAudio } from '../vm-audio'
import { VmStack } from '../vm-stack'

// @ts-ignore
@inline
export function callOlp(
  posCount: i32,
  nameSyms: StaticArray<i32>,
  nameTags: StaticArray<i32>,
  nameNums: StaticArray<f64>,
  nameAux: StaticArray<i32>,
  namedCount: i32,
  posTags: StaticArray<i32>,
  posNums: StaticArray<f64>,
  posAux: StaticArray<i32>,
  stack: VmStack,
  audio: VmAudio,
  program: Program,
  length: i32,
): void {
  // olp(in, cut=1000)
  if (posCount < 1) {
    stack.push(VmTag.Undef)
    return
  }

  let olpIndex: i32 = 0

  let inTag: VmTag = VmTag.Num
  let inNum: f64 = 0.0
  let inAux: i32 = 0

  let cutTag: VmTag = VmTag.Num
  let cutNum: f64 = 1000.0
  let cutAux: i32 = 0

  if (posCount >= 1 && posTags[0] !== VmTag.Undef && posTags[0] !== VmTag.Null) {
    inTag = posTags[0] as VmTag
    inNum = posNums[0]
    inAux = posAux[0]
  }

  if (posCount >= 2 && posTags[1] !== VmTag.Undef && posTags[1] !== VmTag.Null) {
    cutTag = posTags[1] as VmTag
    cutNum = posNums[1]
    cutAux = posAux[1]
  }

  // Named overrides (cut)
  for (let i = 0; i < namedCount; i++) {
    const k = nameSyms[i]
    if (k === VmSym.Index) {
      const v = i32(Math.floor(nameNums[i]))
      olpIndex = v < 0 ? 0 : v > 255 ? 255 : v
    }
    else if (k === VmSym.In) {
      inTag = nameTags[i] as VmTag
      inNum = nameNums[i]
      inAux = nameAux[i]
    }
    else if (k === VmSym.Cut) {
      cutTag = nameTags[i] as VmTag
      cutNum = nameNums[i]
      cutAux = nameAux[i]
    }
  }

  const in$ = audio.toAudioPtr(inTag, inNum, inAux, length, program)
  const cut$ = audio.toAudioPtr(cutTag, cutNum, cutAux, length, program)

  const outIndex = audio.allocOut(program)
  const out$ = program.getOutBuffer(outIndex)

  const olp = program.gensPool.get(Op.Olp) as Olp
  olp.in$ = in$
  olp.cut$ = cut$
  olp.process(out$, length)

  // Best-effort history for UI widgets (no atomics needed).
  if (program.historyWriteEnabled !== 0) {
    const hist = program.filterHistory
    const writePos = i32(hist[FILTER_WRITE_POS_OFFSET])
    const slot = writePos % FILTER_HISTORY_SIZE
    const base = FILTER_DATA_OFFSET + slot * FILTER_ENTRY_SIZE
    hist[base] = f32(olpIndex)
    hist[base + 1] = load<f32>(cut$)
    hist[base + 2] = f32(DEFAULT_Q) // q (not used for one pole)
    hist[base + 3] = f32(9) // gate enabled for OLP filter
    hist[base + 4] = f32((globalSampleCount + length) & 0xfffff)
    hist[base + 5] = f32(0) // hpf cutoff (unused for one pole)
    hist[FILTER_WRITE_POS_OFFSET] = f32((writePos + 1) & 0xfffff)
  }

  stack.push(VmTag.Audio, 0.0, outIndex)
}

export function callOhp(
  posCount: i32,
  nameSyms: StaticArray<i32>,
  nameTags: StaticArray<i32>,
  nameNums: StaticArray<f64>,
  nameAux: StaticArray<i32>,
  namedCount: i32,
  posTags: StaticArray<i32>,
  posNums: StaticArray<f64>,
  posAux: StaticArray<i32>,
  stack: VmStack,
  audio: VmAudio,
  program: Program,
  length: i32,
): void {
  // ohp(in, cut=1000)
  if (posCount < 1) {
    stack.push(VmTag.Undef)
    return
  }

  let ohpIndex: i32 = 0

  let inTag: VmTag = VmTag.Num
  let inNum: f64 = 0.0
  let inAux: i32 = 0

  let cutTag: VmTag = VmTag.Num
  let cutNum: f64 = 1000.0
  let cutAux: i32 = 0

  if (posCount >= 1 && posTags[0] !== VmTag.Undef && posTags[0] !== VmTag.Null) {
    inTag = posTags[0] as VmTag
    inNum = posNums[0]
    inAux = posAux[0]
  }

  if (posCount >= 2 && posTags[1] !== VmTag.Undef && posTags[1] !== VmTag.Null) {
    cutTag = posTags[1] as VmTag
    cutNum = posNums[1]
    cutAux = posAux[1]
  }

  // Named overrides (cut)
  for (let i = 0; i < namedCount; i++) {
    const k = nameSyms[i]
    if (k === VmSym.Index) {
      const v = i32(Math.floor(nameNums[i]))
      ohpIndex = v < 0 ? 0 : v > 255 ? 255 : v
    }
    else if (k === VmSym.In) {
      inTag = nameTags[i] as VmTag
      inNum = nameNums[i]
      inAux = nameAux[i]
    }
    else if (k === VmSym.Cut) {
      cutTag = nameTags[i] as VmTag
      cutNum = nameNums[i]
      cutAux = nameAux[i]
    }
  }

  const in$ = audio.toAudioPtr(inTag, inNum, inAux, length, program)
  const cut$ = audio.toAudioPtr(cutTag, cutNum, cutAux, length, program)

  const outIndex = audio.allocOut(program)
  const out$ = program.getOutBuffer(outIndex)

  const ohp = program.gensPool.get(Op.Ohp) as Ohp
  ohp.in$ = in$
  ohp.cut$ = cut$
  ohp.process(out$, length)

  // Best-effort history for UI widgets (no atomics needed).
  if (program.historyWriteEnabled !== 0) {
    const hist = program.filterHistory
    const writePos = i32(hist[FILTER_WRITE_POS_OFFSET])
    const slot = writePos % FILTER_HISTORY_SIZE
    const base = FILTER_DATA_OFFSET + slot * FILTER_ENTRY_SIZE
    hist[base] = f32(ohpIndex)
    hist[base + 1] = load<f32>(cut$)
    hist[base + 2] = f32(DEFAULT_Q) // q (not used for one pole)
    hist[base + 3] = f32(10) // gate enabled for OHP filter
    hist[base + 4] = f32((globalSampleCount + length) & 0xfffff)
    hist[base + 5] = f32(0) // hpf cutoff (unused for one pole)
    hist[FILTER_WRITE_POS_OFFSET] = f32((writePos + 1) & 0xfffff)
  }

  stack.push(VmTag.Audio, 0.0, outIndex)
}
