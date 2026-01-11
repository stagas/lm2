// dprint-ignore-file
import { Pwm } from '../../gen/osc'
import { Program } from '../../program'
import { Op } from '../../shared'
import { VmSym } from '../vm-sym'
import { VmTag } from '../types'
import { VmAudio } from '../vm-audio'
import { VmStack } from '../vm-stack'

// @ts-ignore
@inline
export function callPwm(
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
  // Positional fallback: (hz, width, offset, trig)
  let hzTag: VmTag = VmTag.Num
  let hzNum: f64 = 0.0
  let hzAux: i32 = 0

  let widthTag: VmTag = VmTag.Num
  let widthNum: f64 = 0.5
  let widthAux: i32 = 0

  let offsetTag: VmTag = VmTag.Num
  let offsetNum: f64 = 0.0
  let offsetAux: i32 = 0

  let trigTag: VmTag = VmTag.Num
  let trigNum: f64 = 0.0
  let trigAux: i32 = 0

  if (posCount >= 1 && posTags[0] !== VmTag.Undef && posTags[0] !== VmTag.Null) {
    hzTag = posTags[0] as VmTag
    hzNum = posNums[0]
    hzAux = posAux[0]
  }

  if (posCount >= 2 && posTags[1] !== VmTag.Undef && posTags[1] !== VmTag.Null) {
    widthTag = posTags[1] as VmTag
    widthNum = posNums[1]
    widthAux = posAux[1]
  }

  if (posCount >= 3 && posTags[2] !== VmTag.Undef && posTags[2] !== VmTag.Null) {
    offsetTag = posTags[2] as VmTag
    offsetNum = posNums[2]
    offsetAux = posAux[2]
  }

  if (posCount >= 4 && posTags[3] !== VmTag.Undef && posTags[3] !== VmTag.Null) {
    trigTag = posTags[3] as VmTag
    trigNum = posNums[3]
    trigAux = posAux[3]
  }

  // Named overrides (hz/width/offset/trig)
  for (let i = 0; i < namedCount; i++) {
    const k = nameSyms[i]
    if (k === VmSym.Hz) {
      hzTag = nameTags[i] as VmTag
      hzNum = nameNums[i]
      hzAux = nameAux[i]
    }
    else if (k === VmSym.Width) {
      widthTag = nameTags[i] as VmTag
      widthNum = nameNums[i]
      widthAux = nameAux[i]
    }
    else if (k === VmSym.Offset) {
      offsetTag = nameTags[i] as VmTag
      offsetNum = nameNums[i]
      offsetAux = nameAux[i]
    }
    else if (k === VmSym.Trig) {
      trigTag = nameTags[i] as VmTag
      trigNum = nameNums[i]
      trigAux = nameAux[i]
    }
  }

  const hz$ = audio.toAudioPtr(hzTag, hzNum, hzAux, length, program)
  const width$ = audio.toAudioPtr(widthTag, widthNum, widthAux, length, program)
  const offset$ = audio.toAudioPtr(offsetTag, offsetNum, offsetAux, length, program)
  const trig$ = audio.toAudioPtr(trigTag, trigNum, trigAux, length, program)

  const outIndex = audio.allocOut(program)
  const out$ = program.getOutBuffer(outIndex)

  const pwm = program.gensPool.get(Op.Pwm) as Pwm
  pwm.hz$ = hz$
  pwm.width$ = width$
  pwm.offset$ = offset$
  pwm.trig$ = trig$
  pwm.process(out$, length)

  stack.push(VmTag.Audio, 0.0, outIndex)
}


