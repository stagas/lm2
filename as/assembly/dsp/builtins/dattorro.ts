// dprint-ignore-file
import { Dattorro } from '../../gen/dattorro'
import { Program } from '../../program'
import { Op } from '../../shared'
import { Dsp } from '../dsp'
import { publishReverbRoomSize } from '../reverb-history'
import { VmSym } from '../vm-sym'
import { VmTag } from '../types'
import { VmAudio } from '../vm-audio'
import { VmStack } from '../vm-stack'

// @ts-ignore
@inline
export function callDattorro(
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
  dsp: Dsp,
): void {
  // dattorro(in, roomSize=0.5, damping=0.005, bandwidth=0.9999, inputDiffusion1=0.75, inputDiffusion2=0.625, decayDiffusion1=0.7, decayDiffusion2=0.5, excursionRate=0.5, excursionDepth=0.7, preDelay=0)
  if (posCount < 1) {
    stack.push(VmTag.Undef)
    return
  }

  let reverbIndex: i32 = 0

  let inTag: VmTag = VmTag.Num
  let inNum: f64 = 0.0
  let inAux: i32 = 0

  let roomSizeTag: VmTag = VmTag.Num
  let roomSizeNum: f64 = 0.5
  let roomSizeAux: i32 = 0

  let dampingTag: VmTag = VmTag.Num
  let dampingNum: f64 = 0.005
  let dampingAux: i32 = 0

  let bandwidthTag: VmTag = VmTag.Num
  let bandwidthNum: f64 = 0.9999
  let bandwidthAux: i32 = 0

  let inputDiffusion1Tag: VmTag = VmTag.Num
  let inputDiffusion1Num: f64 = 0.75
  let inputDiffusion1Aux: i32 = 0

  let inputDiffusion2Tag: VmTag = VmTag.Num
  let inputDiffusion2Num: f64 = 0.625
  let inputDiffusion2Aux: i32 = 0

  let decayDiffusion1Tag: VmTag = VmTag.Num
  let decayDiffusion1Num: f64 = 0.7
  let decayDiffusion1Aux: i32 = 0

  let decayDiffusion2Tag: VmTag = VmTag.Num
  let decayDiffusion2Num: f64 = 0.5
  let decayDiffusion2Aux: i32 = 0

  let excursionRateTag: VmTag = VmTag.Num
  let excursionRateNum: f64 = 0.5
  let excursionRateAux: i32 = 0

  let excursionDepthTag: VmTag = VmTag.Num
  let excursionDepthNum: f64 = 0.7
  let excursionDepthAux: i32 = 0

  let preDelayTag: VmTag = VmTag.Num
  let preDelayNum: f64 = 0.0
  let preDelayAux: i32 = 0

  if (posCount >= 1 && posTags[0] !== VmTag.Undef && posTags[0] !== VmTag.Null) {
    inTag = posTags[0] as VmTag
    inNum = posNums[0]
    inAux = posAux[0]
  }

  if (posCount >= 2 && posTags[1] !== VmTag.Undef && posTags[1] !== VmTag.Null) {
    roomSizeTag = posTags[1] as VmTag
    roomSizeNum = posNums[1]
    roomSizeAux = posAux[1]
  }

  if (posCount >= 3 && posTags[2] !== VmTag.Undef && posTags[2] !== VmTag.Null) {
    dampingTag = posTags[2] as VmTag
    dampingNum = posNums[2]
    dampingAux = posAux[2]
  }

  if (posCount >= 4 && posTags[3] !== VmTag.Undef && posTags[3] !== VmTag.Null) {
    bandwidthTag = posTags[3] as VmTag
    bandwidthNum = posNums[3]
    bandwidthAux = posAux[3]
  }

  if (posCount >= 5 && posTags[4] !== VmTag.Undef && posTags[4] !== VmTag.Null) {
    inputDiffusion1Tag = posTags[4] as VmTag
    inputDiffusion1Num = posNums[4]
    inputDiffusion1Aux = posAux[4]
  }

  if (posCount >= 6 && posTags[5] !== VmTag.Undef && posTags[5] !== VmTag.Null) {
    inputDiffusion2Tag = posTags[5] as VmTag
    inputDiffusion2Num = posNums[5]
    inputDiffusion2Aux = posAux[5]
  }

  if (posCount >= 7 && posTags[6] !== VmTag.Undef && posTags[6] !== VmTag.Null) {
    decayDiffusion1Tag = posTags[6] as VmTag
    decayDiffusion1Num = posNums[6]
    decayDiffusion1Aux = posAux[6]
  }

  if (posCount >= 8 && posTags[7] !== VmTag.Undef && posTags[7] !== VmTag.Null) {
    decayDiffusion2Tag = posTags[7] as VmTag
    decayDiffusion2Num = posNums[7]
    decayDiffusion2Aux = posAux[7]
  }

  if (posCount >= 9 && posTags[8] !== VmTag.Undef && posTags[8] !== VmTag.Null) {
    excursionRateTag = posTags[8] as VmTag
    excursionRateNum = posNums[8]
    excursionRateAux = posAux[8]
  }

  if (posCount >= 10 && posTags[9] !== VmTag.Undef && posTags[9] !== VmTag.Null) {
    excursionDepthTag = posTags[9] as VmTag
    excursionDepthNum = posNums[9]
    excursionDepthAux = posAux[9]
  }

  if (posCount >= 11 && posTags[10] !== VmTag.Undef && posTags[10] !== VmTag.Null) {
    preDelayTag = posTags[10] as VmTag
    preDelayNum = posNums[10]
    preDelayAux = posAux[10]
  }

  for (let i = 0; i < namedCount; i++) {
    const k = nameSyms[i]
    if (k === VmSym.Index) {
      reverbIndex = i32(Math.floor(nameNums[i]))
    }
    else if (k === VmSym.In) {
      inTag = nameTags[i] as VmTag
      inNum = nameNums[i]
      inAux = nameAux[i]
    }
    else if (k === VmSym.Roomsize || k === VmSym.Size) {
      roomSizeTag = nameTags[i] as VmTag
      roomSizeNum = nameNums[i]
      roomSizeAux = nameAux[i]
    }
    else if (k === VmSym.PreDelay) {
      preDelayTag = nameTags[i] as VmTag
      preDelayNum = nameNums[i]
      preDelayAux = nameAux[i]
    }
    else if (k === VmSym.Bandwidth) {
      bandwidthTag = nameTags[i] as VmTag
      bandwidthNum = nameNums[i]
      bandwidthAux = nameAux[i]
    }
    else if (k === VmSym.InputDiffusion1) {
      inputDiffusion1Tag = nameTags[i] as VmTag
      inputDiffusion1Num = nameNums[i]
      inputDiffusion1Aux = nameAux[i]
    }
    else if (k === VmSym.InputDiffusion2) {
      inputDiffusion2Tag = nameTags[i] as VmTag
      inputDiffusion2Num = nameNums[i]
      inputDiffusion2Aux = nameAux[i]
    }
    else if (k === VmSym.DecayDiffusion1) {
      decayDiffusion1Tag = nameTags[i] as VmTag
      decayDiffusion1Num = nameNums[i]
      decayDiffusion1Aux = nameAux[i]
    }
    else if (k === VmSym.DecayDiffusion2) {
      decayDiffusion2Tag = nameTags[i] as VmTag
      decayDiffusion2Num = nameNums[i]
      decayDiffusion2Aux = nameAux[i]
    }
    else if (k === VmSym.Damping) {
      dampingTag = nameTags[i] as VmTag
      dampingNum = nameNums[i]
      dampingAux = nameAux[i]
    }
    else if (k === VmSym.ExcursionRate) {
      excursionRateTag = nameTags[i] as VmTag
      excursionRateNum = nameNums[i]
      excursionRateAux = nameAux[i]
    }
    else if (k === VmSym.ExcursionDepth) {
      excursionDepthTag = nameTags[i] as VmTag
      excursionDepthNum = nameNums[i]
      excursionDepthAux = nameAux[i]
    }
  }

  let inL$: usize = 0
  let inR$: usize = 0

  if (inTag === VmTag.Arr) {
    console.log('is array')
    const arrId: i32 = inAux
    if (arrId < 0 || arrId >= dsp.arrays.count) {
      inL$ = audio.toAudioPtr(VmTag.Num, 0.0, 0, length, program)
      inR$ = inL$
    }
    else {
      const arrLen: i32 = dsp.arrays.len[arrId]
      const start: i32 = dsp.arrays.start[arrId]

      if (arrLen >= 2) {
        const lTag = dsp.arrays.elemTag[start] as VmTag
        const lNum = dsp.arrays.elemNum[start]
        const lAux = dsp.arrays.elemAux[start]
        inL$ = audio.toAudioPtr(lTag, lNum, lAux, length, program)

        const rTag = dsp.arrays.elemTag[start + 1] as VmTag
        const rNum = dsp.arrays.elemNum[start + 1]
        const rAux = dsp.arrays.elemAux[start + 1]
        inR$ = audio.toAudioPtr(rTag, rNum, rAux, length, program)
      }
      else if (arrLen >= 1) {
        const mTag = dsp.arrays.elemTag[start] as VmTag
        const mNum = dsp.arrays.elemNum[start]
        const mAux = dsp.arrays.elemAux[start]
        inL$ = audio.toAudioPtr(mTag, mNum, mAux, length, program)
        inR$ = inL$
      }
      else {
        inL$ = audio.toAudioPtr(VmTag.Num, 0.0, 0, length, program)
        inR$ = inL$
      }
    }
  }
  else {
    inL$ = audio.toAudioPtr(inTag, inNum, inAux, length, program)
    inR$ = inL$
  }

  const roomSize$ = audio.toAudioPtr(roomSizeTag, roomSizeNum, roomSizeAux, length, program)
  const damping$ = audio.toAudioPtr(dampingTag, dampingNum, dampingAux, length, program)
  const bandwidth$ = audio.toAudioPtr(bandwidthTag, bandwidthNum, bandwidthAux, length, program)
  const inputDiffusion1$ = audio.toAudioPtr(inputDiffusion1Tag, inputDiffusion1Num, inputDiffusion1Aux, length, program)
  const inputDiffusion2$ = audio.toAudioPtr(inputDiffusion2Tag, inputDiffusion2Num, inputDiffusion2Aux, length, program)
  const decayDiffusion1$ = audio.toAudioPtr(decayDiffusion1Tag, decayDiffusion1Num, decayDiffusion1Aux, length, program)
  const decayDiffusion2$ = audio.toAudioPtr(decayDiffusion2Tag, decayDiffusion2Num, decayDiffusion2Aux, length, program)
  const excursionRate$ = audio.toAudioPtr(excursionRateTag, excursionRateNum, excursionRateAux, length, program)
  const excursionDepth$ = audio.toAudioPtr(excursionDepthTag, excursionDepthNum, excursionDepthAux, length, program)
  const preDelay$ = audio.toAudioPtr(preDelayTag, preDelayNum, preDelayAux, length, program)

  const outLIndex = audio.allocOut(program)
  const outRIndex = audio.allocOut(program)
  const outL$ = program.getOutBuffer(outLIndex)
  const outR$ = program.getOutBuffer(outRIndex)

  const gen = program.gensPool.get(Op.Dattorro) as Dattorro
  gen.inL$ = inL$
  gen.inR$ = inR$
  gen.roomSize$ = roomSize$
  gen.damping$ = damping$
  gen.bandwidth$ = bandwidth$
  gen.inputDiffusion1$ = inputDiffusion1$
  gen.inputDiffusion2$ = inputDiffusion2$
  gen.decayDiffusion1$ = decayDiffusion1$
  gen.decayDiffusion2$ = decayDiffusion2$
  gen.excursionRate$ = excursionRate$
  gen.excursionDepth$ = excursionDepth$
  gen.preDelay$ = preDelay$
  gen.processStereo(outL$, outR$, length)

  if (program.historyWriteEnabled !== 0) {
    publishReverbRoomSize(program.reverbHistory, reverbIndex, load<f32>(roomSize$))
  }

  stack.push(VmTag.Audio, 0.0, outLIndex)
  stack.push(VmTag.Audio, 0.0, outRIndex)
  dsp.arrays.create(2, stack, 0, audio, program, length)
}


