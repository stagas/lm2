// dprint-ignore-file
import { Slp, Shp, Sbp, Sbs, Speak, Sap } from '../../gen/svf'
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
export function callSlp(
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
  // slp(in, cut=1000, q=1)
  if (posCount < 1) {
    stack.push(VmTag.Undef)
    return
  }

  let slpIndex: i32 = 0

  let inTag: VmTag = VmTag.Num
  let inNum: f64 = 0.0
  let inAux: i32 = 0

  let cutTag: VmTag = VmTag.Num
  let cutNum: f64 = 1000.0
  let cutAux: i32 = 0

  let qTag: VmTag = VmTag.Num
  let qNum: f64 = 0.333
  let qAux: i32 = 0

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

  if (posCount >= 3 && posTags[2] !== VmTag.Undef && posTags[2] !== VmTag.Null) {
    qTag = posTags[2] as VmTag
    qNum = posNums[2]
    qAux = posAux[2]
  }

  // Named overrides (index, in, cut, q)
  for (let i = 0; i < namedCount; i++) {
    const k = nameSyms[i]
    if (k === VmSym.Index) {
      const v = i32(Math.floor(nameNums[i]))
      slpIndex = v < 0 ? 0 : v > 63 ? 63 : v
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
    else if (k === VmSym.Q) {
      qTag = nameTags[i] as VmTag
      qNum = nameNums[i]
      qAux = nameAux[i]
    }
  }

  const in$ = audio.toAudioPtr(inTag, inNum, inAux, length, program)
  const cut$ = audio.toAudioPtr(cutTag, cutNum, cutAux, length, program)
  const q$ = audio.toAudioPtr(qTag, qNum, qAux, length, program)

  const outIndex = audio.allocOut(program)
  const out$ = program.getOutBuffer(outIndex)

  const slp = program.gensPool.get(Op.Slp) as Slp
  slp.in$ = in$
  slp.cut$ = cut$
  slp.q$ = q$
  slp.process(out$, length)

  // Best-effort history for UI widgets (no atomics needed).
  {
    const hist = program.filterHistory
    const writePos = i32(hist[FILTER_WRITE_POS_OFFSET])
    const slot = writePos % FILTER_HISTORY_SIZE
    const base = FILTER_DATA_OFFSET + slot * FILTER_ENTRY_SIZE
    hist[base] = f32(slpIndex)
    hist[base + 1] = load<f32>(cut$)
    hist[base + 2] = load<f32>(q$)
    hist[base + 3] = f32(9) // gate enabled for SLP filter
    hist[base + 4] = f32((globalSampleCount + length) & 0xfffff)
    hist[FILTER_WRITE_POS_OFFSET] = f32((writePos + 1) & 0xfffff)
  }

  stack.push(VmTag.Audio, 0.0, outIndex)
}

export function callShp(
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
  // shp(in, cut=1000, q=1)
  if (posCount < 1) {
    stack.push(VmTag.Undef)
    return
  }

  let shpIndex: i32 = 0

  let inTag: VmTag = VmTag.Num
  let inNum: f64 = 0.0
  let inAux: i32 = 0

  let cutTag: VmTag = VmTag.Num
  let cutNum: f64 = 1000.0
  let cutAux: i32 = 0

  let qTag: VmTag = VmTag.Num
  let qNum: f64 = 0.333
  let qAux: i32 = 0

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

  if (posCount >= 3 && posTags[2] !== VmTag.Undef && posTags[2] !== VmTag.Null) {
    qTag = posTags[2] as VmTag
    qNum = posNums[2]
    qAux = posAux[2]
  }

  // Named overrides (index, in, cut, q)
  for (let i = 0; i < namedCount; i++) {
    const k = nameSyms[i]
    if (k === VmSym.Index) {
      const v = i32(Math.floor(nameNums[i]))
      shpIndex = v < 0 ? 0 : v > 63 ? 63 : v
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
    else if (k === VmSym.Q) {
      qTag = nameTags[i] as VmTag
      qNum = nameNums[i]
      qAux = nameAux[i]
    }
  }

  const in$ = audio.toAudioPtr(inTag, inNum, inAux, length, program)
  const cut$ = audio.toAudioPtr(cutTag, cutNum, cutAux, length, program)
  const q$ = audio.toAudioPtr(qTag, qNum, qAux, length, program)

  const outIndex = audio.allocOut(program)
  const out$ = program.getOutBuffer(outIndex)

  const shp = program.gensPool.get(Op.Shp) as Shp
  shp.in$ = in$
  shp.cut$ = cut$
  shp.q$ = q$
  shp.process(out$, length)

  // Best-effort history for UI widgets (no atomics needed).
  {
    const hist = program.filterHistory
    const writePos = i32(hist[FILTER_WRITE_POS_OFFSET])
    const slot = writePos % FILTER_HISTORY_SIZE
    const base = FILTER_DATA_OFFSET + slot * FILTER_ENTRY_SIZE
    hist[base] = f32(shpIndex)
    hist[base + 1] = load<f32>(cut$)
    hist[base + 2] = load<f32>(q$)
    hist[base + 3] = f32(10) // gate enabled for SHP filter
    hist[base + 4] = f32((globalSampleCount + length) & 0xfffff)
    hist[FILTER_WRITE_POS_OFFSET] = f32((writePos + 1) & 0xfffff)
  }

  stack.push(VmTag.Audio, 0.0, outIndex)
}

export function callSbp(
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
  // sbp(in, cut=1000, q=1)
  if (posCount < 1) {
    stack.push(VmTag.Undef)
    return
  }

  let sbpIndex: i32 = 0

  let inTag: VmTag = VmTag.Num
  let inNum: f64 = 0.0
  let inAux: i32 = 0

  let cutTag: VmTag = VmTag.Num
  let cutNum: f64 = 1000.0
  let cutAux: i32 = 0

  let qTag: VmTag = VmTag.Num
  let qNum: f64 = 0.333
  let qAux: i32 = 0

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

  if (posCount >= 3 && posTags[2] !== VmTag.Undef && posTags[2] !== VmTag.Null) {
    qTag = posTags[2] as VmTag
    qNum = posNums[2]
    qAux = posAux[2]
  }

  // Named overrides (index, in, cut, q)
  for (let i = 0; i < namedCount; i++) {
    const k = nameSyms[i]
    if (k === VmSym.Index) {
      const v = i32(Math.floor(nameNums[i]))
      sbpIndex = v < 0 ? 0 : v > 63 ? 63 : v
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
    else if (k === VmSym.Q) {
      qTag = nameTags[i] as VmTag
      qNum = nameNums[i]
      qAux = nameAux[i]
    }
  }

  const in$ = audio.toAudioPtr(inTag, inNum, inAux, length, program)
  const cut$ = audio.toAudioPtr(cutTag, cutNum, cutAux, length, program)
  const q$ = audio.toAudioPtr(qTag, qNum, qAux, length, program)

  const outIndex = audio.allocOut(program)
  const out$ = program.getOutBuffer(outIndex)

  const sbp = program.gensPool.get(Op.Sbp) as Sbp
  sbp.in$ = in$
  sbp.cut$ = cut$
  sbp.q$ = q$
  sbp.process(out$, length)

  // Best-effort history for UI widgets (no atomics needed).
  {
    const hist = program.filterHistory
    const writePos = i32(hist[FILTER_WRITE_POS_OFFSET])
    const slot = writePos % FILTER_HISTORY_SIZE
    const base = FILTER_DATA_OFFSET + slot * FILTER_ENTRY_SIZE
    hist[base] = f32(sbpIndex)
    hist[base + 1] = load<f32>(cut$)
    hist[base + 2] = load<f32>(q$)
    hist[base + 3] = f32(11) // gate enabled for SBP filter
    hist[base + 4] = f32((globalSampleCount + length) & 0xfffff)
    hist[FILTER_WRITE_POS_OFFSET] = f32((writePos + 1) & 0xfffff)
  }

  stack.push(VmTag.Audio, 0.0, outIndex)
}

export function callSbs(
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
  // sbs(in, cut=1000, q=1)
  if (posCount < 1) {
    stack.push(VmTag.Undef)
    return
  }

  let sbsIndex: i32 = 0

  let inTag: VmTag = VmTag.Num
  let inNum: f64 = 0.0
  let inAux: i32 = 0

  let cutTag: VmTag = VmTag.Num
  let cutNum: f64 = 1000.0
  let cutAux: i32 = 0

  let qTag: VmTag = VmTag.Num
  let qNum: f64 = 0.333
  let qAux: i32 = 0

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

  if (posCount >= 3 && posTags[2] !== VmTag.Undef && posTags[2] !== VmTag.Null) {
    qTag = posTags[2] as VmTag
    qNum = posNums[2]
    qAux = posAux[2]
  }

  // Named overrides (index, in, cut, q)
  for (let i = 0; i < namedCount; i++) {
    const k = nameSyms[i]
    if (k === VmSym.Index) {
      const v = i32(Math.floor(nameNums[i]))
      sbsIndex = v < 0 ? 0 : v > 63 ? 63 : v
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
    else if (k === VmSym.Q) {
      qTag = nameTags[i] as VmTag
      qNum = nameNums[i]
      qAux = nameAux[i]
    }
  }

  const in$ = audio.toAudioPtr(inTag, inNum, inAux, length, program)
  const cut$ = audio.toAudioPtr(cutTag, cutNum, cutAux, length, program)
  const q$ = audio.toAudioPtr(qTag, qNum, qAux, length, program)

  const outIndex = audio.allocOut(program)
  const out$ = program.getOutBuffer(outIndex)

  const sbs = program.gensPool.get(Op.Sbs) as Sbs
  sbs.in$ = in$
  sbs.cut$ = cut$
  sbs.q$ = q$
  sbs.process(out$, length)

  // Best-effort history for UI widgets (no atomics needed).
  {
    const hist = program.filterHistory
    const writePos = i32(hist[FILTER_WRITE_POS_OFFSET])
    const slot = writePos % FILTER_HISTORY_SIZE
    const base = FILTER_DATA_OFFSET + slot * FILTER_ENTRY_SIZE
    hist[base] = f32(sbsIndex)
    hist[base + 1] = load<f32>(cut$)
    hist[base + 2] = load<f32>(q$)
    hist[base + 3] = f32(12) // gate enabled for SBS filter
    hist[base + 4] = f32((globalSampleCount + length) & 0xfffff)
    hist[FILTER_WRITE_POS_OFFSET] = f32((writePos + 1) & 0xfffff)
  }

  stack.push(VmTag.Audio, 0.0, outIndex)
}

export function callSpeak(
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
  // speak(in, cut=1000, q=1)
  if (posCount < 1) {
    stack.push(VmTag.Undef)
    return
  }

  let speakIndex: i32 = 0

  let inTag: VmTag = VmTag.Num
  let inNum: f64 = 0.0
  let inAux: i32 = 0

  let cutTag: VmTag = VmTag.Num
  let cutNum: f64 = 1000.0
  let cutAux: i32 = 0

  let qTag: VmTag = VmTag.Num
  let qNum: f64 = 0.333
  let qAux: i32 = 0

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

  if (posCount >= 3 && posTags[2] !== VmTag.Undef && posTags[2] !== VmTag.Null) {
    qTag = posTags[2] as VmTag
    qNum = posNums[2]
    qAux = posAux[2]
  }

  // Named overrides (index, in, cut, q)
  for (let i = 0; i < namedCount; i++) {
    const k = nameSyms[i]
    if (k === VmSym.Index) {
      const v = i32(Math.floor(nameNums[i]))
      speakIndex = v < 0 ? 0 : v > 63 ? 63 : v
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
    else if (k === VmSym.Q) {
      qTag = nameTags[i] as VmTag
      qNum = nameNums[i]
      qAux = nameAux[i]
    }
  }

  const in$ = audio.toAudioPtr(inTag, inNum, inAux, length, program)
  const cut$ = audio.toAudioPtr(cutTag, cutNum, cutAux, length, program)
  const q$ = audio.toAudioPtr(qTag, qNum, qAux, length, program)

  const outIndex = audio.allocOut(program)
  const out$ = program.getOutBuffer(outIndex)

  const speak = program.gensPool.get(Op.Speak) as Speak
  speak.in$ = in$
  speak.cut$ = cut$
  speak.q$ = q$
  speak.process(out$, length)

  // Best-effort history for UI widgets (no atomics needed).
  {
    const hist = program.filterHistory
    const writePos = i32(hist[FILTER_WRITE_POS_OFFSET])
    const slot = writePos % FILTER_HISTORY_SIZE
    const base = FILTER_DATA_OFFSET + slot * FILTER_ENTRY_SIZE
    hist[base] = f32(speakIndex)
    hist[base + 1] = load<f32>(cut$)
    hist[base + 2] = load<f32>(q$)
    hist[base + 3] = f32(13) // gate enabled for SPEAK filter
    hist[base + 4] = f32((globalSampleCount + length) & 0xfffff)
    hist[FILTER_WRITE_POS_OFFSET] = f32((writePos + 1) & 0xfffff)
  }

  stack.push(VmTag.Audio, 0.0, outIndex)
}

export function callSap(
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
  // sap(in, cut=1000, q=1)
  if (posCount < 1) {
    stack.push(VmTag.Undef)
    return
  }

  let sapIndex: i32 = 0

  let inTag: VmTag = VmTag.Num
  let inNum: f64 = 0.0
  let inAux: i32 = 0

  let cutTag: VmTag = VmTag.Num
  let cutNum: f64 = 1000.0
  let cutAux: i32 = 0

  let qTag: VmTag = VmTag.Num
  let qNum: f64 = 0.333
  let qAux: i32 = 0

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

  if (posCount >= 3 && posTags[2] !== VmTag.Undef && posTags[2] !== VmTag.Null) {
    qTag = posTags[2] as VmTag
    qNum = posNums[2]
    qAux = posAux[2]
  }

  // Named overrides (index, in, cut, q)
  for (let i = 0; i < namedCount; i++) {
    const k = nameSyms[i]
    if (k === VmSym.Index) {
      const v = i32(Math.floor(nameNums[i]))
      sapIndex = v < 0 ? 0 : v > 63 ? 63 : v
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
    else if (k === VmSym.Q) {
      qTag = nameTags[i] as VmTag
      qNum = nameNums[i]
      qAux = nameAux[i]
    }
  }

  const in$ = audio.toAudioPtr(inTag, inNum, inAux, length, program)
  const cut$ = audio.toAudioPtr(cutTag, cutNum, cutAux, length, program)
  const q$ = audio.toAudioPtr(qTag, qNum, qAux, length, program)

  const outIndex = audio.allocOut(program)
  const out$ = program.getOutBuffer(outIndex)

  const sap = program.gensPool.get(Op.Sap) as Sap
  sap.in$ = in$
  sap.cut$ = cut$
  sap.q$ = q$
  sap.process(out$, length)

  // Best-effort history for UI widgets (no atomics needed).
  {
    const hist = program.filterHistory
    const writePos = i32(hist[FILTER_WRITE_POS_OFFSET])
    const slot = writePos % FILTER_HISTORY_SIZE
    const base = FILTER_DATA_OFFSET + slot * FILTER_ENTRY_SIZE
    hist[base] = f32(sapIndex)
    hist[base + 1] = load<f32>(cut$)
    hist[base + 2] = load<f32>(q$)
    hist[base + 3] = f32(14) // gate enabled for SAP filter
    hist[base + 4] = f32((globalSampleCount + length) & 0xfffff)
    hist[FILTER_WRITE_POS_OFFSET] = f32((writePos + 1) & 0xfffff)
  }

  stack.push(VmTag.Audio, 0.0, outIndex)
}
