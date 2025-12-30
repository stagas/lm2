// dprint-ignore-file
import { Peak } from '../../gen/biquad'
import { DEFAULT_Q, FILTER_DATA_OFFSET, FILTER_ENTRY_SIZE, FILTER_HISTORY_SIZE, FILTER_WRITE_POS_OFFSET } from '../../constants'
import { globalSampleCount } from '../../globals'
import { Program } from '../../program'
import { Op } from '../../shared'
import { VmSym } from '../vm-sym'
import { VmTag } from '../types'
import { VmAudio } from '../vm-audio'
import { VmStack } from '../vm-stack'

// @ts-ignore
// @inline
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

  let cutTag: VmTag = VmTag.Num
  let cutNum: f64 = 1000.0
  let cutAux: i32 = 0

  let qTag: VmTag = VmTag.Num
  let qNum: f64 = DEFAULT_Q
  let qAux: i32 = 0

  let gainTag: VmTag = VmTag.Num
  let gainNum: f64 = 0.0
  let gainAux: i32 = 0

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

  if (posCount >= 4 && posTags[3] !== VmTag.Undef && posTags[3] !== VmTag.Null) {
    gainTag = posTags[3] as VmTag
    gainNum = posNums[3]
    gainAux = posAux[3]
  }

  // Named overrides (cut/q/gain)
  for (let i = 0; i < namedCount; i++) {
    const k = nameSyms[i]
    if (k === VmSym.Index) {
      const v = i32(Math.floor(nameNums[i]))
      peakIndex = v < 0 ? 0 : v > 63 ? 63 : v
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
  {
    const hist = program.filterHistory
    const writePos = i32(hist[FILTER_WRITE_POS_OFFSET])
    const slot = writePos % FILTER_HISTORY_SIZE
    const base = FILTER_DATA_OFFSET + slot * FILTER_ENTRY_SIZE
    hist[base] = f32(peakIndex)
    hist[base + 1] = load<f32>(cut$)
    hist[base + 2] = load<f32>(q$)
    hist[base + 3] = f32(7) // gate enabled for Peak filter
    hist[base + 4] = f32((globalSampleCount + length) & 0xfffff)
    hist[FILTER_WRITE_POS_OFFSET] = f32((writePos + 1) & 0xfffff)
  }

  stack.push(VmTag.Audio, 0.0, outIndex)
}
