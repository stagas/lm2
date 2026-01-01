// dprint-ignore-file
import { Velvet } from '../../gen/velvet'
import { Program } from '../../program'
import { Op } from '../../shared'
import { Dsp } from '../dsp'
import { VmSym } from '../vm-sym'
import { VmTag } from '../types'
import { VmAudio } from '../vm-audio'
import { VmStack } from '../vm-stack'
import { publishReverbRoomSize } from '../reverb-history'

// @ts-ignore
@inline
function clampIndex(v: i32): i32 {
  return v < 0 ? 0 : v > 63 ? 63 : v
}

// @ts-ignore
@inline
export function callVelvet(
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
  // velvet(in, roomSize=0.5, damping=0.5, decay=0.5)
  if (posCount < 1) {
    stack.push(VmTag.Undef)
    return
  }

  let velvetIndex: i32 = 0

  let inTag: VmTag = VmTag.Num
  let inNum: f64 = 0.0
  let inAux: i32 = 0

  let roomSizeTag: VmTag = VmTag.Num
  let roomSizeNum: f64 = 0.5
  let roomSizeAux: i32 = 0

  let dampingTag: VmTag = VmTag.Num
  let dampingNum: f64 = 0.5
  let dampingAux: i32 = 0

  let decayTag: VmTag = VmTag.Num
  let decayNum: f64 = 0.5
  let decayAux: i32 = 0

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
    decayTag = posTags[3] as VmTag
    decayNum = posNums[3]
    decayAux = posAux[3]
  }

  for (let i = 0; i < namedCount; i++) {
    const k = nameSyms[i]
    if (k === VmSym.Index) {
      velvetIndex = clampIndex(i32(Math.floor(nameNums[i])))
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
    else if (k === VmSym.Damping) {
      dampingTag = nameTags[i] as VmTag
      dampingNum = nameNums[i]
      dampingAux = nameAux[i]
    }
    else if (k === VmSym.Decay) {
      decayTag = nameTags[i] as VmTag
      decayNum = nameNums[i]
      decayAux = nameAux[i]
    }
  }

  let inL$: usize = 0
  let inR$: usize = 0

  if (inTag === VmTag.Arr) {
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
  const decay$ = audio.toAudioPtr(decayTag, decayNum, decayAux, length, program)

  const outLIndex = audio.allocOut(program)
  const outRIndex = audio.allocOut(program)
  const outL$ = program.getOutBuffer(outLIndex)
  const outR$ = program.getOutBuffer(outRIndex)

  const gen = program.gensPool.get(Op.Velvet) as Velvet
  gen.inL$ = inL$
  gen.inR$ = inR$
  gen.roomSize$ = roomSize$
  gen.damping$ = damping$
  gen.decay$ = decay$
  gen.processStereo(outL$, outR$, length)

  publishReverbRoomSize(program.reverbHistory, velvetIndex, load<f32>(roomSize$))

  stack.push(VmTag.Audio, 0.0, outLIndex)
  stack.push(VmTag.Audio, 0.0, outRIndex)
  dsp.arrays.create(2, stack, 0, audio, program, length)
}
