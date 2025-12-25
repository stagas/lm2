// dprint-ignore-file
import { Lp } from '../../gen/biquad'
import { LP_CUT_DATA_OFFSET, LP_CUT_ENTRY_SIZE, LP_CUT_HISTORY_SIZE, LP_CUT_WRITE_POS_OFFSET } from '../../constants'
import { globalSampleCount } from '../../globals'
import { Program } from '../../program'
import { Op } from '../../shared'
import { VmSym } from '../vm-sym'
import { VmTag } from '../types'
import { VmAudio } from '../vm-audio'
import { VmStack } from '../vm-stack'

// @ts-ignore

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

  let inTag = posTags[0] as VmTag
  let inNum = posNums[0]
  let inAux = posAux[0]

  let cutTag = posCount >= 2 ? (posTags[1] as VmTag) : VmTag.Num
  let cutNum = posCount >= 2 ? posNums[1] : 1000.0
  let cutAux = posCount >= 2 ? posAux[1] : 0

  let qTag = posCount >= 3 ? (posTags[2] as VmTag) : VmTag.Num
  let qNum = posCount >= 3 ? posNums[2] : 1.0
  let qAux = posCount >= 3 ? posAux[2] : 0

  // Named overrides (cut/q)
  for (let i = 0; i < namedCount; i++) {
    const k = nameSyms[i]
    if (k === VmSym.Index) {
      const v = i32(Math.floor(nameNums[i]))
      lpIndex = v < 0 ? 0 : v > 63 ? 63 : v
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
  {
    const hist = program.lpCutHistory
    const writePos = i32(hist[LP_CUT_WRITE_POS_OFFSET])
    const slot = writePos % LP_CUT_HISTORY_SIZE
    const base = LP_CUT_DATA_OFFSET + slot * LP_CUT_ENTRY_SIZE
    hist[base] = f32(lpIndex)
    hist[base + 1] = load<f32>(cut$)
    hist[base + 2] = load<f32>(q$)
    hist[base + 3] = f32((globalSampleCount + length) & 0xfffff)
    hist[LP_CUT_WRITE_POS_OFFSET] = f32((writePos + 1) & 0xfffff)
  }

  stack.push(VmTag.Audio, 0.0, outIndex)
}
