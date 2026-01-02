// dprint-ignore-file
import { Lp, Bp, Hp, Ls, Hs, Ap, Bs, Peak } from '../../gen/biquad'
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
export function callLp(
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
  // lp(in, cut=1000, q=1)
  if (posCount < 1) {
    stack.push(VmTag.Undef)
    return
  }

  let lpIndex: i32 = 0

  let inTag: VmTag = VmTag.Num
  let inNum: f64 = 0.0
  let inAux: i32 = 0

  let cutTag: VmTag = VmTag.Num
  let cutNum: f64 = 1000.0
  let cutAux: i32 = 0

  let qTag: VmTag = VmTag.Num
  let qNum: f64 = DEFAULT_Q
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

  // Named overrides (cut/q)
  for (let i = 0; i < namedCount; i++) {
    const k = nameSyms[i]
    if (k === VmSym.Index) {
      const v = i32(Math.floor(nameNums[i]))
      lpIndex = v < 0 ? 0 : v > 255 ? 255 : v
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

  const lp = program.gensPool.get(Op.Lp) as Lp
  lp.in$ = in$
  lp.cut$ = cut$
  lp.q$ = q$
  lp.process(out$, length)

  // Best-effort history for UI widgets (no atomics needed).
  if (program.historyWriteEnabled !== 0) {
    const hist = program.filterHistory
    const writePos = i32(hist[FILTER_WRITE_POS_OFFSET])
    const slot = writePos % FILTER_HISTORY_SIZE
    const base = FILTER_DATA_OFFSET + slot * FILTER_ENTRY_SIZE
    hist[base] = f32(lpIndex)
    hist[base + 1] = load<f32>(cut$)
    hist[base + 2] = load<f32>(q$)
    hist[base + 3] = f32(1) // gate enabled for LP filter
    hist[base + 4] = f32((globalSampleCount + length) & 0xfffff)
    hist[base + 5] = f32(0) // hpf cutoff (unused for biquad)
    hist[FILTER_WRITE_POS_OFFSET] = f32((writePos + 1) & 0xfffff)
  }

  stack.push(VmTag.Audio, 0.0, outIndex)
}

export function callBp(
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
  // bp(in, cut=1000, q=1)
  if (posCount < 1) {
    stack.push(VmTag.Undef)
    return
  }

  let bpIndex: i32 = 0

  let inTag: VmTag = VmTag.Num
  let inNum: f64 = 0.0
  let inAux: i32 = 0

  if (posCount >= 1 && posTags[0] !== VmTag.Undef && posTags[0] !== VmTag.Null) {
    inTag = posTags[0] as VmTag
    inNum = posNums[0]
    inAux = posAux[0]
  }

  let cutTag = posCount >= 2 ? (posTags[1] as VmTag) : VmTag.Num
  let cutNum = posCount >= 2 ? posNums[1] : 1000.0
  let cutAux = posCount >= 2 ? posAux[1] : 0

  let qTag = posCount >= 3 ? (posTags[2] as VmTag) : VmTag.Num
  let qNum = posCount >= 3 ? posNums[2] : DEFAULT_Q
  let qAux = posCount >= 3 ? posAux[2] : 0

  // Named overrides (cut/q)
  for (let i = 0; i < namedCount; i++) {
    const k = nameSyms[i]
    if (k === VmSym.Index) {
      const v = i32(Math.floor(nameNums[i]))
      bpIndex = v < 0 ? 0 : v > 255 ? 255 : v
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

  const bp = program.gensPool.get(Op.Bp) as Bp
  bp.in$ = in$
  bp.cut$ = cut$
  bp.q$ = q$
  bp.process(out$, length)

  // Best-effort history for UI widgets (no atomics needed).
  if (program.historyWriteEnabled !== 0) {
    const hist = program.filterHistory
    const writePos = i32(hist[FILTER_WRITE_POS_OFFSET])
    const slot = writePos % FILTER_HISTORY_SIZE
    const base = FILTER_DATA_OFFSET + slot * FILTER_ENTRY_SIZE
    hist[base] = f32(bpIndex)
    hist[base + 1] = load<f32>(cut$)
    hist[base + 2] = load<f32>(q$)
    hist[base + 3] = f32(3) // gate enabled for BP filter
    hist[base + 4] = f32((globalSampleCount + length) & 0xfffff)
    hist[base + 5] = f32(0) // hpf cutoff (unused for biquad)
    hist[FILTER_WRITE_POS_OFFSET] = f32((writePos + 1) & 0xfffff)
  }

  stack.push(VmTag.Audio, 0.0, outIndex)
}

export function callHp(
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
  // hp(in, cut=1000, q=1)
  if (posCount < 1) {
    stack.push(VmTag.Undef)
    return
  }

  let hpIndex: i32 = 0

  let inTag: VmTag = VmTag.Num
  let inNum: f64 = 0.0
  let inAux: i32 = 0

  let cutTag: VmTag = VmTag.Num
  let cutNum: f64 = 1000.0
  let cutAux: i32 = 0

  let qTag: VmTag = VmTag.Num
  let qNum: f64 = DEFAULT_Q
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

  // Named overrides (cut/q)
  for (let i = 0; i < namedCount; i++) {
    const k = nameSyms[i]
    if (k === VmSym.Index) {
      const v = i32(Math.floor(nameNums[i]))
      hpIndex = v < 0 ? 0 : v > 255 ? 255 : v
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

  const hp = program.gensPool.get(Op.Hp) as Hp
  hp.in$ = in$
  hp.cut$ = cut$
  hp.q$ = q$
  hp.process(out$, length)

  // Best-effort history for UI widgets (no atomics needed).
  if (program.historyWriteEnabled !== 0) {
    const hist = program.filterHistory
    const writePos = i32(hist[FILTER_WRITE_POS_OFFSET])
    const slot = writePos % FILTER_HISTORY_SIZE
    const base = FILTER_DATA_OFFSET + slot * FILTER_ENTRY_SIZE
    hist[base] = f32(hpIndex)
    hist[base + 1] = load<f32>(cut$)
    hist[base + 2] = load<f32>(q$)
    hist[base + 3] = f32(2) // gate enabled for HP filter
    hist[base + 4] = f32((globalSampleCount + length) & 0xfffff)
    hist[base + 5] = f32(0) // hpf cutoff (unused for biquad)
    hist[FILTER_WRITE_POS_OFFSET] = f32((writePos + 1) & 0xfffff)
  }

  stack.push(VmTag.Audio, 0.0, outIndex)
}

export function callLs(
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
  // ls(in, cut=1000, gain=0)
  if (posCount < 1) {
    stack.push(VmTag.Undef)
    return
  }

  let lsIndex: i32 = 0

  let inTag: VmTag = VmTag.Num
  let inNum: f64 = 0.0
  let inAux: i32 = 0

  if (posCount >= 1 && posTags[0] !== VmTag.Undef && posTags[0] !== VmTag.Null) {
    inTag = posTags[0] as VmTag
    inNum = posNums[0]
    inAux = posAux[0]
  }

  let cutTag = posCount >= 2 ? (posTags[1] as VmTag) : VmTag.Num
  let cutNum = posCount >= 2 ? posNums[1] : 1000.0
  let cutAux = posCount >= 2 ? posAux[1] : 0

  let gainTag = posCount >= 3 ? (posTags[2] as VmTag) : VmTag.Num
  let gainNum = posCount >= 3 ? posNums[2] : 0.0
  let gainAux = posCount >= 3 ? posAux[2] : 0

  // Named overrides (cut/gain)
  for (let i = 0; i < namedCount; i++) {
    const k = nameSyms[i]
    if (k === VmSym.Index) {
      const v = i32(Math.floor(nameNums[i]))
      lsIndex = v < 0 ? 0 : v > 255 ? 255 : v
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
    else if (k === VmSym.Gain) {
      gainTag = nameTags[i] as VmTag
      gainNum = nameNums[i]
      gainAux = nameAux[i]
    }
  }

  const in$ = audio.toAudioPtr(inTag, inNum, inAux, length, program)
  const cut$ = audio.toAudioPtr(cutTag, cutNum, cutAux, length, program)
  const gain$ = audio.toAudioPtr(gainTag, gainNum, gainAux, length, program)

  const outIndex = audio.allocOut(program)
  const out$ = program.getOutBuffer(outIndex)

  const ls = program.gensPool.get(Op.Ls) as Ls
  ls.in$ = in$
  ls.cut$ = cut$
  ls.gain$ = gain$
  ls.process(out$, length)

  // Best-effort history for UI widgets (no atomics needed).
  if (program.historyWriteEnabled !== 0) {
    const hist = program.filterHistory
    const writePos = i32(hist[FILTER_WRITE_POS_OFFSET])
    const slot = writePos % FILTER_HISTORY_SIZE
    const base = FILTER_DATA_OFFSET + slot * FILTER_ENTRY_SIZE
    hist[base] = f32(lsIndex)
    hist[base + 1] = load<f32>(cut$)
    hist[base + 2] = load<f32>(gain$)
    hist[base + 3] = f32(5) // gate enabled for LS filter
    hist[base + 4] = f32((globalSampleCount + length) & 0xfffff)
    hist[base + 5] = f32(0) // hpf cutoff (unused for biquad)
    hist[FILTER_WRITE_POS_OFFSET] = f32((writePos + 1) & 0xfffff)
  }

  stack.push(VmTag.Audio, 0.0, outIndex)
}

export function callHs(
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
  // hs(in, cut=1000, gain=0)
  if (posCount < 1) {
    stack.push(VmTag.Undef)
    return
  }

  let hsIndex: i32 = 0

  let inTag: VmTag = VmTag.Num
  let inNum: f64 = 0.0
  let inAux: i32 = 0

  if (posCount >= 1 && posTags[0] !== VmTag.Undef && posTags[0] !== VmTag.Null) {
    inTag = posTags[0] as VmTag
    inNum = posNums[0]
    inAux = posAux[0]
  }

  let cutTag = posCount >= 2 ? (posTags[1] as VmTag) : VmTag.Num
  let cutNum = posCount >= 2 ? posNums[1] : 1000.0
  let cutAux = posCount >= 2 ? posAux[1] : 0

  let gainTag = posCount >= 3 ? (posTags[2] as VmTag) : VmTag.Num
  let gainNum = posCount >= 3 ? posNums[2] : 0.0
  let gainAux = posCount >= 3 ? posAux[2] : 0

  // Named overrides (cut/gain)
  for (let i = 0; i < namedCount; i++) {
    const k = nameSyms[i]
    if (k === VmSym.Index) {
      const v = i32(Math.floor(nameNums[i]))
      hsIndex = v < 0 ? 0 : v > 255 ? 255 : v
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
    else if (k === VmSym.Gain) {
      gainTag = nameTags[i] as VmTag
      gainNum = nameNums[i]
      gainAux = nameAux[i]
    }
  }

  const in$ = audio.toAudioPtr(inTag, inNum, inAux, length, program)
  const cut$ = audio.toAudioPtr(cutTag, cutNum, cutAux, length, program)
  const gain$ = audio.toAudioPtr(gainTag, gainNum, gainAux, length, program)

  const outIndex = audio.allocOut(program)
  const out$ = program.getOutBuffer(outIndex)

  const hs = program.gensPool.get(Op.Hs) as Hs
  hs.in$ = in$
  hs.cut$ = cut$
  hs.gain$ = gain$
  hs.process(out$, length)

  // Best-effort history for UI widgets (no atomics needed).
  if (program.historyWriteEnabled !== 0) {
    const hist = program.filterHistory
    const writePos = i32(hist[FILTER_WRITE_POS_OFFSET])
    const slot = writePos % FILTER_HISTORY_SIZE
    const base = FILTER_DATA_OFFSET + slot * FILTER_ENTRY_SIZE
    hist[base] = f32(hsIndex)
    hist[base + 1] = load<f32>(cut$)
    hist[base + 2] = load<f32>(gain$)
    hist[base + 3] = f32(6) // gate enabled for HS filter
    hist[base + 4] = f32((globalSampleCount + length) & 0xfffff)
    hist[base + 5] = f32(0) // hpf cutoff (unused for biquad)
    hist[FILTER_WRITE_POS_OFFSET] = f32((writePos + 1) & 0xfffff)
  }

  stack.push(VmTag.Audio, 0.0, outIndex)
}

export function callAp(
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
  // ap(in, cut=1000, q=1)
  if (posCount < 1) {
    stack.push(VmTag.Undef)
    return
  }

  let apIndex: i32 = 0

  let inTag: VmTag = VmTag.Num
  let inNum: f64 = 0.0
  let inAux: i32 = 0

  if (posCount >= 1 && posTags[0] !== VmTag.Undef && posTags[0] !== VmTag.Null) {
    inTag = posTags[0] as VmTag
    inNum = posNums[0]
    inAux = posAux[0]
  }

  let cutTag = posCount >= 2 ? (posTags[1] as VmTag) : VmTag.Num
  let cutNum = posCount >= 2 ? posNums[1] : 1000.0
  let cutAux = posCount >= 2 ? posAux[1] : 0

  let qTag = posCount >= 3 ? (posTags[2] as VmTag) : VmTag.Num
  let qNum = posCount >= 3 ? posNums[2] : DEFAULT_Q
  let qAux = posCount >= 3 ? posAux[2] : 0

  // Named overrides (cut/q)
  for (let i = 0; i < namedCount; i++) {
    const k = nameSyms[i]
    if (k === VmSym.Index) {
      const v = i32(Math.floor(nameNums[i]))
      apIndex = v < 0 ? 0 : v > 255 ? 255 : v
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

  const ap = program.gensPool.get(Op.Ap) as Ap
  ap.in$ = in$
  ap.cut$ = cut$
  ap.q$ = q$
  ap.process(out$, length)

  // Best-effort history for UI widgets (no atomics needed).
  if (program.historyWriteEnabled !== 0) {
    const hist = program.filterHistory
    const writePos = i32(hist[FILTER_WRITE_POS_OFFSET])
    const slot = writePos % FILTER_HISTORY_SIZE
    const base = FILTER_DATA_OFFSET + slot * FILTER_ENTRY_SIZE
    hist[base] = f32(apIndex)
    hist[base + 1] = load<f32>(cut$)
    hist[base + 2] = load<f32>(q$)
    hist[base + 3] = f32(8) // gate enabled for AP filter
    hist[base + 4] = f32((globalSampleCount + length) & 0xfffff)
    hist[base + 5] = f32(0) // hpf cutoff (unused for biquad)
    hist[FILTER_WRITE_POS_OFFSET] = f32((writePos + 1) & 0xfffff)
  }

  stack.push(VmTag.Audio, 0.0, outIndex)
}

export function callBs(
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
  // bs(in, cut=1000, q=1)
  if (posCount < 1) {
    stack.push(VmTag.Undef)
    return
  }

  let bsIndex: i32 = 0

  let inTag: VmTag = VmTag.Num
  let inNum: f64 = 0.0
  let inAux: i32 = 0

  if (posCount >= 1 && posTags[0] !== VmTag.Undef && posTags[0] !== VmTag.Null) {
    inTag = posTags[0] as VmTag
    inNum = posNums[0]
    inAux = posAux[0]
  }

  let cutTag = posCount >= 2 ? (posTags[1] as VmTag) : VmTag.Num
  let cutNum = posCount >= 2 ? posNums[1] : 1000.0
  let cutAux = posCount >= 2 ? posAux[1] : 0

  let qTag = posCount >= 3 ? (posTags[2] as VmTag) : VmTag.Num
  let qNum = posCount >= 3 ? posNums[2] : DEFAULT_Q
  let qAux = posCount >= 3 ? posAux[2] : 0

  // Named overrides (cut/q)
  for (let i = 0; i < namedCount; i++) {
    const k = nameSyms[i]
    if (k === VmSym.Index) {
      const v = i32(Math.floor(nameNums[i]))
      bsIndex = v < 0 ? 0 : v > 255 ? 255 : v
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

  const bs = program.gensPool.get(Op.Bs) as Bs
  bs.in$ = in$
  bs.cut$ = cut$
  bs.q$ = q$
  bs.process(out$, length)

  // Best-effort history for UI widgets (no atomics needed).
  if (program.historyWriteEnabled !== 0) {
    const hist = program.filterHistory
    const writePos = i32(hist[FILTER_WRITE_POS_OFFSET])
    const slot = writePos % FILTER_HISTORY_SIZE
    const base = FILTER_DATA_OFFSET + slot * FILTER_ENTRY_SIZE
    hist[base] = f32(bsIndex)
    hist[base + 1] = load<f32>(cut$)
    hist[base + 2] = load<f32>(q$)
    hist[base + 3] = f32(4) // gate enabled for BS filter
    hist[base + 4] = f32((globalSampleCount + length) & 0xfffff)
    hist[base + 5] = f32(0) // hpf cutoff (unused for biquad)
    hist[FILTER_WRITE_POS_OFFSET] = f32((writePos + 1) & 0xfffff)
  }

  stack.push(VmTag.Audio, 0.0, outIndex)
}

export function callPeak(
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
  // peak(in, cut=1000, q=1, gain=0)
  if (posCount < 1) {
    stack.push(VmTag.Undef)
    return
  }

  let peakIndex: i32 = 0

  let inTag: VmTag = VmTag.Num
  let inNum: f64 = 0.0
  let inAux: i32 = 0

  if (posCount >= 1 && posTags[0] !== VmTag.Undef && posTags[0] !== VmTag.Null) {
    inTag = posTags[0] as VmTag
    inNum = posNums[0]
    inAux = posAux[0]
  }

  let cutTag = posCount >= 2 ? (posTags[1] as VmTag) : VmTag.Num
  let cutNum = posCount >= 2 ? posNums[1] : 1000.0
  let cutAux = posCount >= 2 ? posAux[1] : 0

  let qTag = posCount >= 3 ? (posTags[2] as VmTag) : VmTag.Num
  let qNum = posCount >= 3 ? posNums[2] : DEFAULT_Q
  let qAux = posCount >= 3 ? posAux[2] : 0

  let gainTag = posCount >= 4 ? (posTags[3] as VmTag) : VmTag.Num
  let gainNum = posCount >= 4 ? posNums[3] : 0.0
  let gainAux = posCount >= 4 ? posAux[3] : 0

  // Named overrides (cut/q/gain)
  for (let i = 0; i < namedCount; i++) {
    const k = nameSyms[i]
    if (k === VmSym.Index) {
      const v = i32(Math.floor(nameNums[i]))
      peakIndex = v < 0 ? 0 : v > 255 ? 255 : v
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
    else if (k === VmSym.Gain) {
      gainTag = nameTags[i] as VmTag
      gainNum = nameNums[i]
      gainAux = nameAux[i]
    }
  }

  const in$ = audio.toAudioPtr(inTag, inNum, inAux, length, program)
  const cut$ = audio.toAudioPtr(cutTag, cutNum, cutAux, length, program)
  const q$ = audio.toAudioPtr(qTag, qNum, qAux, length, program)
  const gain$ = audio.toAudioPtr(gainTag, gainNum, gainAux, length, program)

  const outIndex = audio.allocOut(program)
  const out$ = program.getOutBuffer(outIndex)

  const peak = program.gensPool.get(Op.Peak) as Peak
  peak.in$ = in$
  peak.cut$ = cut$
  peak.q$ = q$
  peak.gain$ = gain$
  peak.process(out$, length)

  // Best-effort history for UI widgets (no atomics needed).
  if (program.historyWriteEnabled !== 0) {
    const hist = program.filterHistory
    const writePos = i32(hist[FILTER_WRITE_POS_OFFSET])
    const slot = writePos % FILTER_HISTORY_SIZE
    const base = FILTER_DATA_OFFSET + slot * FILTER_ENTRY_SIZE
    hist[base] = f32(peakIndex)
    hist[base + 1] = load<f32>(cut$)
    hist[base + 2] = load<f32>(q$)
    hist[base + 3] = f32(7) // gate enabled for Peak filter
    hist[base + 4] = f32((globalSampleCount + length) & 0xfffff)
    hist[base + 5] = f32(0) // hpf cutoff (unused for biquad)
    hist[FILTER_WRITE_POS_OFFSET] = f32((writePos + 1) & 0xfffff)
  }

  stack.push(VmTag.Audio, 0.0, outIndex)
}
