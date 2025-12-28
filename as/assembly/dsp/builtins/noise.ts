import { BrownNoise, FractalNoise, GaussNoise, PinkNoise, SmoothNoise, WhiteNoise } from '../../gen/noise'
import { Program } from '../../program'
import { Op } from '../../shared'
import { VmTag } from '../types'
import { VmAudio } from '../vm-audio'
import { VmStack } from '../vm-stack'
import { VmSym } from '../vm-sym'

export function callWhite(
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
  // white(seed=1234, trig=0)
  let seedTag: VmTag = VmTag.Num
  let seedNum: f64 = 1234.0
  let seedAux: i32 = 0

  let trigTag: VmTag = VmTag.Num
  let trigNum: f64 = 0.0
  let trigAux: i32 = 0

  if (posCount >= 1) {
    const t = posTags[0] as VmTag
    if (t !== VmTag.Undef && t !== VmTag.Null) {
      seedTag = t
      seedNum = posNums[0]
      seedAux = posAux[0]
    }
  }

  if (posCount >= 2) {
    const t = posTags[1] as VmTag
    if (t !== VmTag.Undef && t !== VmTag.Null) {
      trigTag = t
      trigNum = posNums[1]
      trigAux = posAux[1]
    }
  }

  // Named overrides (seed, trig)
  for (let i = 0; i < namedCount; i++) {
    const k = nameSyms[i]
    if (k === VmSym.Seed) {
      seedTag = nameTags[i] as VmTag
      seedNum = nameNums[i]
      seedAux = nameAux[i]
    }
    else if (k === VmSym.Trig) {
      trigTag = nameTags[i] as VmTag
      trigNum = nameNums[i]
      trigAux = nameAux[i]
    }
  }

  const seed$ = audio.toAudioPtr(seedTag, seedNum, seedAux, length, program)
  const trig$ = audio.toAudioPtr(trigTag, trigNum, trigAux, length, program)
  const outIndex = audio.allocOut(program)
  const out$ = program.getOutBuffer(outIndex)

  const gen = program.gensPool.get(Op.White) as WhiteNoise
  gen.seed$ = seed$
  gen.trig$ = trig$
  gen.process(out$, length)

  stack.push(VmTag.Audio, 0.0, outIndex)
}

export function callGauss(
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
  // gauss(seed=1234, trig=0)
  let seedTag: VmTag = VmTag.Num
  let seedNum: f64 = 1234.0
  let seedAux: i32 = 0

  let trigTag: VmTag = VmTag.Num
  let trigNum: f64 = 0.0
  let trigAux: i32 = 0

  if (posCount >= 1) {
    const t = posTags[0] as VmTag
    if (t !== VmTag.Undef && t !== VmTag.Null) {
      seedTag = t
      seedNum = posNums[0]
      seedAux = posAux[0]
    }
  }

  if (posCount >= 2) {
    const t = posTags[1] as VmTag
    if (t !== VmTag.Undef && t !== VmTag.Null) {
      trigTag = t
      trigNum = posNums[1]
      trigAux = posAux[1]
    }
  }

  // Named overrides (seed, trig)
  for (let i = 0; i < namedCount; i++) {
    const k = nameSyms[i]
    if (k === VmSym.Seed) {
      seedTag = nameTags[i] as VmTag
      seedNum = nameNums[i]
      seedAux = nameAux[i]
    }
    else if (k === VmSym.Trig) {
      trigTag = nameTags[i] as VmTag
      trigNum = nameNums[i]
      trigAux = nameAux[i]
    }
  }

  const seed$ = audio.toAudioPtr(seedTag, seedNum, seedAux, length, program)
  const trig$ = audio.toAudioPtr(trigTag, trigNum, trigAux, length, program)
  const outIndex = audio.allocOut(program)
  const out$ = program.getOutBuffer(outIndex)

  const gen = program.gensPool.get(Op.Gauss) as GaussNoise
  gen.seed$ = seed$
  gen.trig$ = trig$
  gen.process(out$, length)

  stack.push(VmTag.Audio, 0.0, outIndex)
}

export function callPink(
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
  // pink(seed=1234, trig=0)
  let seedTag: VmTag = VmTag.Num
  let seedNum: f64 = 1234.0
  let seedAux: i32 = 0

  let trigTag: VmTag = VmTag.Num
  let trigNum: f64 = 0.0
  let trigAux: i32 = 0

  if (posCount >= 1) {
    const t = posTags[0] as VmTag
    if (t !== VmTag.Undef && t !== VmTag.Null) {
      seedTag = t
      seedNum = posNums[0]
      seedAux = posAux[0]
    }
  }

  if (posCount >= 2) {
    const t = posTags[1] as VmTag
    if (t !== VmTag.Undef && t !== VmTag.Null) {
      trigTag = t
      trigNum = posNums[1]
      trigAux = posAux[1]
    }
  }

  // Named overrides (seed, trig)
  for (let i = 0; i < namedCount; i++) {
    const k = nameSyms[i]
    if (k === VmSym.Seed) {
      seedTag = nameTags[i] as VmTag
      seedNum = nameNums[i]
      seedAux = nameAux[i]
    }
    else if (k === VmSym.Trig) {
      trigTag = nameTags[i] as VmTag
      trigNum = nameNums[i]
      trigAux = nameAux[i]
    }
  }

  const seed$ = audio.toAudioPtr(seedTag, seedNum, seedAux, length, program)
  const trig$ = audio.toAudioPtr(trigTag, trigNum, trigAux, length, program)
  const outIndex = audio.allocOut(program)
  const out$ = program.getOutBuffer(outIndex)

  const gen = program.gensPool.get(Op.Pink) as PinkNoise
  gen.seed$ = seed$
  gen.trig$ = trig$
  gen.process(out$, length)

  stack.push(VmTag.Audio, 0.0, outIndex)
}

export function callBrown(
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
  // brown(seed=1234, trig=0)
  let seedTag: VmTag = VmTag.Num
  let seedNum: f64 = 1234.0
  let seedAux: i32 = 0

  let trigTag: VmTag = VmTag.Num
  let trigNum: f64 = 0.0
  let trigAux: i32 = 0

  if (posCount >= 1) {
    const t = posTags[0] as VmTag
    if (t !== VmTag.Undef && t !== VmTag.Null) {
      seedTag = t
      seedNum = posNums[0]
      seedAux = posAux[0]
    }
  }

  if (posCount >= 2) {
    const t = posTags[1] as VmTag
    if (t !== VmTag.Undef && t !== VmTag.Null) {
      trigTag = t
      trigNum = posNums[1]
      trigAux = posAux[1]
    }
  }

  // Named overrides (seed, trig)
  for (let i = 0; i < namedCount; i++) {
    const k = nameSyms[i]
    if (k === VmSym.Seed) {
      seedTag = nameTags[i] as VmTag
      seedNum = nameNums[i]
      seedAux = nameAux[i]
    }
    else if (k === VmSym.Trig) {
      trigTag = nameTags[i] as VmTag
      trigNum = nameNums[i]
      trigAux = nameAux[i]
    }
  }

  const seed$ = audio.toAudioPtr(seedTag, seedNum, seedAux, length, program)
  const trig$ = audio.toAudioPtr(trigTag, trigNum, trigAux, length, program)
  const outIndex = audio.allocOut(program)
  const out$ = program.getOutBuffer(outIndex)

  const gen = program.gensPool.get(Op.Brown) as BrownNoise
  gen.seed$ = seed$
  gen.trig$ = trig$
  gen.process(out$, length)

  stack.push(VmTag.Audio, 0.0, outIndex)
}

export function callSmooth(
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
  // smooth(seed=1234, rate=1.0, curve=0.5, trig=0)
  let seedTag: VmTag = VmTag.Num
  let seedNum: f64 = 1234.0
  let seedAux: i32 = 0

  let rateTag: VmTag = VmTag.Num
  let rateNum: f64 = 1.0
  let rateAux: i32 = 0

  let curveTag: VmTag = VmTag.Num
  let curveNum: f64 = 0.5
  let curveAux: i32 = 0

  let trigTag: VmTag = VmTag.Num
  let trigNum: f64 = 0.0
  let trigAux: i32 = 0

  if (posCount >= 1) {
    const t = posTags[0] as VmTag
    if (t !== VmTag.Undef && t !== VmTag.Null) {
      seedTag = t
      seedNum = posNums[0]
      seedAux = posAux[0]
    }
  }

  // Allow omitting middle args while still passing trig:
  // - smooth(seed, trig)
  // - smooth(seed, rate, trig)
  // - smooth(seed, rate, curve, trig)
  if (posCount === 2) {
    const t = posTags[1] as VmTag
    if (t !== VmTag.Undef && t !== VmTag.Null) {
      trigTag = t
      trigNum = posNums[1]
      trigAux = posAux[1]
    }
  }
  else if (posCount === 3) {
    {
      const t = posTags[1] as VmTag
      if (t !== VmTag.Undef && t !== VmTag.Null) {
        rateTag = t
        rateNum = posNums[1]
        rateAux = posAux[1]
      }
    }

    {
      const t = posTags[2] as VmTag
      if (t !== VmTag.Undef && t !== VmTag.Null) {
        trigTag = t
        trigNum = posNums[2]
        trigAux = posAux[2]
      }
    }
  }
  else if (posCount >= 4) {
    {
      const t = posTags[1] as VmTag
      if (t !== VmTag.Undef && t !== VmTag.Null) {
        rateTag = t
        rateNum = posNums[1]
        rateAux = posAux[1]
      }
    }

    {
      const t = posTags[2] as VmTag
      if (t !== VmTag.Undef && t !== VmTag.Null) {
        curveTag = t
        curveNum = posNums[2]
        curveAux = posAux[2]
      }
    }

    {
      const t = posTags[3] as VmTag
      if (t !== VmTag.Undef && t !== VmTag.Null) {
        trigTag = t
        trigNum = posNums[3]
        trigAux = posAux[3]
      }
    }
  }

  for (let i = 0; i < namedCount; i++) {
    const k = nameSyms[i]
    if (k === VmSym.Seed) {
      seedTag = nameTags[i] as VmTag
      seedNum = nameNums[i]
      seedAux = nameAux[i]
    }
    else if (k === VmSym.Rate) {
      rateTag = nameTags[i] as VmTag
      rateNum = nameNums[i]
      rateAux = nameAux[i]
    }
    else if (k === VmSym.Curve) {
      curveTag = nameTags[i] as VmTag
      curveNum = nameNums[i]
      curveAux = nameAux[i]
    }
    else if (k === VmSym.Trig) {
      trigTag = nameTags[i] as VmTag
      trigNum = nameNums[i]
      trigAux = nameAux[i]
    }
  }

  const seed$ = audio.toAudioPtr(seedTag, seedNum, seedAux, length, program)
  const rate$ = audio.toAudioPtr(rateTag, rateNum, rateAux, length, program)
  const curve$ = audio.toAudioPtr(curveTag, curveNum, curveAux, length, program)
  const trig$ = audio.toAudioPtr(trigTag, trigNum, trigAux, length, program)

  const outIndex = audio.allocOut(program)
  const out$ = program.getOutBuffer(outIndex)

  const gen = program.gensPool.get(Op.Smooth) as SmoothNoise
  gen.seed$ = seed$
  gen.rate$ = rate$
  gen.curve$ = curve$
  gen.trig$ = trig$
  gen.process(out$, length)

  stack.push(VmTag.Audio, 0.0, outIndex)
}

export function callFractal(
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
  // fractal(seed=1234, rate=1.0, octaves=4, gain=0.5, trig=0)
  let seedTag: VmTag = VmTag.Num
  let seedNum: f64 = 1234.0
  let seedAux: i32 = 0

  let rateTag: VmTag = VmTag.Num
  let rateNum: f64 = 1.0
  let rateAux: i32 = 0

  let octavesTag: VmTag = VmTag.Num
  let octavesNum: f64 = 4.0
  let octavesAux: i32 = 0

  let gainTag: VmTag = VmTag.Num
  let gainNum: f64 = 0.5
  let gainAux: i32 = 0

  let trigTag: VmTag = VmTag.Num
  let trigNum: f64 = 0.0
  let trigAux: i32 = 0

  if (posCount >= 1) {
    const t = posTags[0] as VmTag
    if (t !== VmTag.Undef && t !== VmTag.Null) {
      seedTag = t
      seedNum = posNums[0]
      seedAux = posAux[0]
    }
  }

  // Allow omitting middle args while still passing trig:
  // - fractal(seed, trig)
  // - fractal(seed, rate, trig)
  // - fractal(seed, rate, octaves, trig)
  // - fractal(seed, rate, octaves, gain, trig)
  if (posCount === 2) {
    const t = posTags[1] as VmTag
    if (t !== VmTag.Undef && t !== VmTag.Null) {
      trigTag = t
      trigNum = posNums[1]
      trigAux = posAux[1]
    }
  }
  else if (posCount === 3) {
    {
      const t = posTags[1] as VmTag
      if (t !== VmTag.Undef && t !== VmTag.Null) {
        rateTag = t
        rateNum = posNums[1]
        rateAux = posAux[1]
      }
    }

    {
      const t = posTags[2] as VmTag
      if (t !== VmTag.Undef && t !== VmTag.Null) {
        trigTag = t
        trigNum = posNums[2]
        trigAux = posAux[2]
      }
    }
  }
  else if (posCount === 4) {
    {
      const t = posTags[1] as VmTag
      if (t !== VmTag.Undef && t !== VmTag.Null) {
        rateTag = t
        rateNum = posNums[1]
        rateAux = posAux[1]
      }
    }

    {
      const t = posTags[2] as VmTag
      if (t !== VmTag.Undef && t !== VmTag.Null) {
        octavesTag = t
        octavesNum = posNums[2]
        octavesAux = posAux[2]
      }
    }

    {
      const t = posTags[3] as VmTag
      if (t !== VmTag.Undef && t !== VmTag.Null) {
        trigTag = t
        trigNum = posNums[3]
        trigAux = posAux[3]
      }
    }
  }
  else if (posCount >= 5) {
    {
      const t = posTags[1] as VmTag
      if (t !== VmTag.Undef && t !== VmTag.Null) {
        rateTag = t
        rateNum = posNums[1]
        rateAux = posAux[1]
      }
    }

    {
      const t = posTags[2] as VmTag
      if (t !== VmTag.Undef && t !== VmTag.Null) {
        octavesTag = t
        octavesNum = posNums[2]
        octavesAux = posAux[2]
      }
    }

    {
      const t = posTags[3] as VmTag
      if (t !== VmTag.Undef && t !== VmTag.Null) {
        gainTag = t
        gainNum = posNums[3]
        gainAux = posAux[3]
      }
    }

    {
      const t = posTags[4] as VmTag
      if (t !== VmTag.Undef && t !== VmTag.Null) {
        trigTag = t
        trigNum = posNums[4]
        trigAux = posAux[4]
      }
    }
  }

  for (let i = 0; i < namedCount; i++) {
    const k = nameSyms[i]
    if (k === VmSym.Seed) {
      seedTag = nameTags[i] as VmTag
      seedNum = nameNums[i]
      seedAux = nameAux[i]
    }
    else if (k === VmSym.Rate) {
      rateTag = nameTags[i] as VmTag
      rateNum = nameNums[i]
      rateAux = nameAux[i]
    }
    else if (k === VmSym.Octaves) {
      octavesTag = nameTags[i] as VmTag
      octavesNum = nameNums[i]
      octavesAux = nameAux[i]
    }
    else if (k === VmSym.Gain) {
      gainTag = nameTags[i] as VmTag
      gainNum = nameNums[i]
      gainAux = nameAux[i]
    }
    else if (k === VmSym.Trig) {
      trigTag = nameTags[i] as VmTag
      trigNum = nameNums[i]
      trigAux = nameAux[i]
    }
  }

  const seed$ = audio.toAudioPtr(seedTag, seedNum, seedAux, length, program)
  const rate$ = audio.toAudioPtr(rateTag, rateNum, rateAux, length, program)
  const oct$ = audio.toAudioPtr(octavesTag, octavesNum, octavesAux, length, program)
  const gain$ = audio.toAudioPtr(gainTag, gainNum, gainAux, length, program)
  const trig$ = audio.toAudioPtr(trigTag, trigNum, trigAux, length, program)

  const outIndex = audio.allocOut(program)
  const out$ = program.getOutBuffer(outIndex)

  const gen = program.gensPool.get(Op.Fractal) as FractalNoise
  gen.seed$ = seed$
  gen.rate$ = rate$
  gen.octaves$ = oct$
  gen.gain$ = gain$
  gen.trig$ = trig$
  gen.process(out$, length)

  stack.push(VmTag.Audio, 0.0, outIndex)
}
