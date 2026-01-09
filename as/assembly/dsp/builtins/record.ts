// dprint-ignore-file
import { hostSampleLen, hostSampleSet } from '../../sample-host'
import { globalSampleCount, sampleRate, vmErrorCode } from '../../globals'
import { Program } from '../../program'
import { VmTag } from '../types'
import { VmSym } from '../vm-sym'
import { VmStack } from '../vm-stack'
import { Dsp } from '../dsp'
import { VmAudio } from '../vm-audio'

// @ts-ignore
@inline
export function callRecord(
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
  left$: usize,
  right$: usize,
  dsp: Dsp,
  cbArgTags: StaticArray<i32>,
  cbArgNums: StaticArray<f64>,
  cbArgAux: StaticArray<i32>,
): void {

  // seconds (pos0 or named seconds)
  let secondsTag: VmTag = VmTag.Num
  let secondsNum: f64 = 0.0
  let secondsAux: i32 = 0
  if (posCount >= 1 && posTags[0] !== VmTag.Undef && posTags[0] !== VmTag.Null) {
    secondsTag = posTags[0] as VmTag
    secondsNum = posNums[0]
    secondsAux = posAux[0]
  }

  // callback (pos1 or named cb/callback)
  let cbTag: VmTag = VmTag.Undef
  let cbAux: i32 = 0
  if (posCount >= 2 && posTags[1] !== VmTag.Undef && posTags[1] !== VmTag.Null) {
    cbTag = posTags[1] as VmTag
    cbAux = posAux[1]
  }

  // injected sample index + key
  let hasIndex: bool = false
  let sampleIndex: i32 = -1
  let hasKey: bool = false
  let keyU32: u32 = 0

  for (let i = 0; i < namedCount; i++) {
    const k = nameSyms[i]
    if (k === VmSym.Seconds) {
      secondsTag = nameTags[i] as VmTag
      secondsNum = nameNums[i]
      secondsAux = nameAux[i]
    }
    else if (k === VmSym.Cb) {
      cbTag = nameTags[i] as VmTag
      cbAux = nameAux[i]
    }
    else if (k === VmSym.Index) {
      const t = nameTags[i] as VmTag
      if (t === VmTag.Num) {
        sampleIndex = i32(nameNums[i])
        hasIndex = true
      }
    }
    else if (k === VmSym.Key) {
      const t = nameTags[i] as VmTag
      if (t === VmTag.Num) {
        const v = nameNums[i]
        keyU32 = u32(i64(v))
        hasKey = true
      }
    }
  }

  // For debugging: if no index provided, use a default
  if (!hasIndex) {
    sampleIndex = 0
    hasIndex = true
  }
  if (!hasKey) {
    keyU32 = 12345
    hasKey = true
  }

  if (sampleIndex < 0 || sampleIndex >= program.recordKey.length) {
    stack.push(VmTag.Num, f64(sampleIndex))
    return
  }

  if (cbTag !== VmTag.Func) {
    stack.push(VmTag.Num, f64(sampleIndex))
    return
  }
  if (!hasKey) {
    stack.push(VmTag.Num, f64(sampleIndex))
    return
  }

  // Resolve seconds to a scalar
  let sec: f32 = 0.0
  if (secondsTag === VmTag.Num) {
    sec = f32(secondsNum)
  }
  else if (secondsTag === VmTag.Audio) {
    const in$ = audio.toAudioPtr(secondsTag, secondsNum, secondsAux, length, program)
    sec = load<f32>(in$)
  }
  else if (secondsTag === VmTag.Bool) {
    sec = secondsNum !== 0.0 ? 1.0 : 0.0
  }

  if (sec < 0.0) sec = 0.0
  if (sec > 1.0) sec = 1.0

  const framesF: f64 = (sec as f64) * (sampleRate as f64)
  let frames: i32 = i32(framesF)
  if (frames < 0) frames = 0
  if (frames > i32(sampleRate)) frames = i32(sampleRate)

  const existingLen: i32 = hostSampleLen(sampleIndex)
  const storedKey: u32 = program.recordKey[sampleIndex]
  const storedSec: f32 = program.recordSeconds[sampleIndex]
  const storedLen: i32 = program.recordLen[sampleIndex]

  let buf$: usize = program.recordBuf$[sampleIndex]
  let pos: i32 = program.recordPos[sampleIndex]
  let curLen: i32 = storedLen
  const recording: bool = buf$ !== 0 || pos > 0

  const paramsChanged: bool = storedKey !== keyU32 || storedLen !== frames || storedSec !== sec
  if (paramsChanged) {
    program.recordKey[sampleIndex] = keyU32
    program.recordSeconds[sampleIndex] = sec
    program.recordLen[sampleIndex] = frames
    program.recordPos[sampleIndex] = 0
    program.recordBuf$[sampleIndex] = 0
    buf$ = 0
    pos = 0
    curLen = frames
  }

  if (frames <= 0) {
    stack.push(VmTag.Num, f64(sampleIndex))
    return
  }
  // If we already have a published sample, params didn't change, and we're not mid-recording, keep it.
  if (existingLen > 0 && !paramsChanged && !recording) {
    stack.push(VmTag.Num, f64(sampleIndex))
    return
  }

  if (buf$ === 0) {
    buf$ = changetype<usize>(new StaticArray<f32>(frames))
    program.recordBuf$[sampleIndex] = buf$
    pos = 0
    program.recordPos[sampleIndex] = 0
    curLen = frames
    program.recordLen[sampleIndex] = frames
  }

  // Serialize recordings so callback DSP state cannot interleave across different record() calls.
  const lock = program.recordLockSample
  if (lock !== -1 && lock !== sampleIndex) {
    stack.push(VmTag.Num, f64(sampleIndex))
    return
  }
  program.recordLockSample = sampleIndex

  // Record progressively across blocks (never blocks the audio thread).
  program.recordActive = 1

  const remaining: i32 = curLen - pos
  if (remaining <= 0) {
    stack.push(VmTag.Num, f64(sampleIndex))
    return
  }
  const take: i32 = remaining < length ? remaining : length

  program.pushHistoryWriteEnabled(0)
  const savedSampleCount: i32 = globalSampleCount
  const savedTHas: i32 = audio.tHas
  const savedTOutIndex: i32 = audio.tOutIndex
  const savedPool = program.gensPool

  if (paramsChanged || pos === 0) {
    program.recordGensPool.reset()
  }
  else {
    // Deterministic get() order per block, while keeping generator internal state for continuity.
    program.recordGensPool.resetIndices()
  }
  program.gensPool = program.recordGensPool

  audio.tHas = 0
  globalSampleCount = pos
  dsp.vmInvokeFunc(cbAux, 0, cbArgTags, cbArgNums, cbArgAux, take, left$, right$)

  globalSampleCount = savedSampleCount
  audio.tHas = savedTHas
  audio.tOutIndex = savedTOutIndex
  program.gensPool = savedPool
  program.popHistoryWriteEnabled()

  if (vmErrorCode !== 0) {
    stack.push(VmTag.Num, f64(sampleIndex))
    return
  }

  const resIdx = stack.pop()
  const rTag = stack.tag[resIdx] as VmTag

  if (rTag === VmTag.Audio) {
    const outIndex: i32 = stack.aux[resIdx]
    const src$ = program.getOutBuffer(outIndex)
    for (let i = 0; i < take; i++) {
      const v = load<f32>(src$ + (i << 2) as usize)
      store<f32>(buf$ + ((pos + i) << 2) as usize, v)
    }
  }
  else if (rTag === VmTag.Num || rTag === VmTag.Bool) {
    const v = rTag === VmTag.Bool ? (stack.num[resIdx] !== 0.0 ? 1.0 : 0.0) : stack.num[resIdx]
    const f = f32(v)
    for (let i = 0; i < take; i++) {
      store<f32>(buf$ + ((pos + i) << 2) as usize, f)
    }
  }
  else {
    for (let i = 0; i < take; i++) {
      store<f32>(buf$ + ((pos + i) << 2) as usize, 0.0)
    }
  }

  pos += take
  program.recordPos[sampleIndex] = pos

  if (pos >= curLen) {
    hostSampleSet(sampleIndex, curLen, buf$)
    program.recordBuf$[sampleIndex] = 0
    program.recordPos[sampleIndex] = 0
    program.recordLockSample = -1
  }

  stack.push(VmTag.Num, f64(sampleIndex))
}

