import { Ad } from './gen/ad'
import { Adsr } from './gen/adsr'
import { Analyser } from './gen/analyser'
import { At } from './gen/at'
import { Ap, Bs, Bp, Hp, Lp, Hs, Ls, Peak } from './gen/biquad'
import { Compressor } from './gen/compressor'
import { Euclid } from './gen/euclid'
import { Every } from './gen/every'
import { Gen } from './gen/gen'
import { LfoRamp, LfoSah, LfoSaw, LfoSine, LfoSqr, LfoTri } from './gen/lfo'
import { Mini } from './gen/mini'
import { BrownNoise, FractalNoise, GaussNoise, PinkNoise, SmoothNoise, WhiteNoise } from './gen/noise'
import { Phasor, Pwm, Ramp, Saw, Sqr, Tri } from './gen/osc'
import { Sampler } from './gen/sampler'
import { Sine } from './gen/sine'
import { Slew } from './gen/slew'
import { Slicer } from './gen/slicer'
import { Timeline } from './gen/timeline'
import { Op } from './shared'

export class GenPool<T extends Gen> {
  private index: i32 = 0
  gens: T[] = []
  constructor(private ctor: () => T) {}
  resetIndex(): void {
    this.index = 0
  }
  reset(): void {
    this.index = 0
    for (let i = 0; i < this.gens.length; i++) {
      this.gens[i].reset()
    }
  }
  get(): T {
    if (this.index >= this.gens.length) {
      const gen = this.ctor()
      this.gens.push(gen)
    }
    const gen = this.gens[this.index++]
    return gen
  }

  copyFrom(source: GenPool<T>): void {
    this.index = source.index
    const needed = source.gens.length
    while (this.gens.length < needed) {
      this.gens.push(this.ctor())
    }
    for (let i = 0; i < needed; i++) {
      this.gens[i].copyFrom(source.gens[i])
    }
  }
}

export class GensPool {
  private sines: GenPool<Sine> = new GenPool<Sine>(() => new Sine())
  private tris: GenPool<Tri> = new GenPool<Tri>(() => new Tri())
  private saws: GenPool<Saw> = new GenPool<Saw>(() => new Saw())
  private ramps: GenPool<Ramp> = new GenPool<Ramp>(() => new Ramp())
  private sqrs: GenPool<Sqr> = new GenPool<Sqr>(() => new Sqr())
  private pwms: GenPool<Pwm> = new GenPool<Pwm>(() => new Pwm())
  private phasors: GenPool<Phasor> = new GenPool<Phasor>(() => new Phasor())
  private ads: GenPool<Ad> = new GenPool<Ad>(() => new Ad())
  private adsrs: GenPool<Adsr> = new GenPool<Adsr>(() => new Adsr())
  private minis: GenPool<Mini> = new GenPool<Mini>(() => new Mini())
  private timelines: GenPool<Timeline> = new GenPool<Timeline>(() => new Timeline())
  private analysers: GenPool<Analyser> = new GenPool<Analyser>(() => new Analyser())
  private samplers: GenPool<Sampler> = new GenPool<Sampler>(() => new Sampler())
  private slicers: GenPool<Slicer> = new GenPool<Slicer>(() => new Slicer())
  private slews: GenPool<Slew> = new GenPool<Slew>(() => new Slew())
  private every: GenPool<Every> = new GenPool<Every>(() => new Every())
  private ats: GenPool<At> = new GenPool<At>(() => new At())
  private euclids: GenPool<Euclid> = new GenPool<Euclid>(() => new Euclid())
  private lps: GenPool<Lp> = new GenPool<Lp>(() => new Lp())
  private hps: GenPool<Hp> = new GenPool<Hp>(() => new Hp())
  private bps: GenPool<Bp> = new GenPool<Bp>(() => new Bp())
  private bss: GenPool<Bs> = new GenPool<Bs>(() => new Bs())
  private lss: GenPool<Ls> = new GenPool<Ls>(() => new Ls())
  private hss: GenPool<Hs> = new GenPool<Hs>(() => new Hs())
  private peaks: GenPool<Peak> = new GenPool<Peak>(() => new Peak())
  private aps: GenPool<Ap> = new GenPool<Ap>(() => new Ap())
  private compressors: GenPool<Compressor> = new GenPool<Compressor>(() => new Compressor())
  private lfoSines: GenPool<LfoSine> = new GenPool<LfoSine>(() => new LfoSine())
  private lfoTris: GenPool<LfoTri> = new GenPool<LfoTri>(() => new LfoTri())
  private lfoSaws: GenPool<LfoSaw> = new GenPool<LfoSaw>(() => new LfoSaw())
  private lfoRamps: GenPool<LfoRamp> = new GenPool<LfoRamp>(() => new LfoRamp())
  private lfoSqrs: GenPool<LfoSqr> = new GenPool<LfoSqr>(() => new LfoSqr())
  private lfoSahs: GenPool<LfoSah> = new GenPool<LfoSah>(() => new LfoSah())
  private whites: GenPool<WhiteNoise> = new GenPool<WhiteNoise>(() => new WhiteNoise())
  private gausses: GenPool<GaussNoise> = new GenPool<GaussNoise>(() => new GaussNoise())
  private pinks: GenPool<PinkNoise> = new GenPool<PinkNoise>(() => new PinkNoise())
  private browns: GenPool<BrownNoise> = new GenPool<BrownNoise>(() => new BrownNoise())
  private smooths: GenPool<SmoothNoise> = new GenPool<SmoothNoise>(() => new SmoothNoise())
  private fractals: GenPool<FractalNoise> = new GenPool<FractalNoise>(() => new FractalNoise())
  resetIndices(): void {
    this.sines.resetIndex()
    this.tris.resetIndex()
    this.saws.resetIndex()
    this.ramps.resetIndex()
    this.sqrs.resetIndex()
    this.pwms.resetIndex()
    this.phasors.resetIndex()
    this.ads.resetIndex()
    this.adsrs.resetIndex()
    this.minis.resetIndex()
    this.timelines.resetIndex()
    this.analysers.resetIndex()
    this.samplers.resetIndex()
    this.slicers.resetIndex()
    this.slews.resetIndex()
    this.every.resetIndex()
    this.ats.resetIndex()
    this.euclids.resetIndex()
    this.lps.resetIndex()
    this.hps.resetIndex()
    this.bps.resetIndex()
    this.bss.resetIndex()
    this.lss.resetIndex()
    this.hss.resetIndex()
    this.peaks.resetIndex()
    this.aps.resetIndex()
    this.compressors.resetIndex()
    this.lfoSines.resetIndex()
    this.lfoTris.resetIndex()
    this.lfoSaws.resetIndex()
    this.lfoRamps.resetIndex()
    this.lfoSqrs.resetIndex()
    this.lfoSahs.resetIndex()
    this.whites.resetIndex()
    this.gausses.resetIndex()
    this.pinks.resetIndex()
    this.browns.resetIndex()
    this.smooths.resetIndex()
    this.fractals.resetIndex()
  }
  reset(): void {
    this.sines.reset()
    this.tris.reset()
    this.saws.reset()
    this.ramps.reset()
    this.sqrs.reset()
    this.pwms.reset()
    this.phasors.reset()
    this.ads.reset()
    this.adsrs.reset()
    this.minis.reset()
    this.timelines.reset()
    this.analysers.reset()
    this.samplers.reset()
    this.slicers.reset()
    this.slews.reset()
    this.every.reset()
    this.ats.reset()
    this.euclids.reset()
    this.lps.reset()
    this.hps.reset()
    this.bps.reset()
    this.bss.reset()
    this.lss.reset()
    this.hss.reset()
    this.peaks.reset()
    this.aps.reset()
    this.compressors.reset()
    this.lfoSines.reset()
    this.lfoTris.reset()
    this.lfoSaws.reset()
    this.lfoRamps.reset()
    this.lfoSqrs.reset()
    this.lfoSahs.reset()
    this.whites.reset()
    this.gausses.reset()
    this.pinks.reset()
    this.browns.reset()
    this.smooths.reset()
    this.fractals.reset()
  }

  get(op: Op): Gen {
    switch (op) {
      case Op.Sine:
        return this.sines.get()
      case Op.Tri:
        return this.tris.get()
      case Op.Saw:
        return this.saws.get()
      case Op.Ramp:
        return this.ramps.get()
      case Op.Sqr:
        return this.sqrs.get()
      case Op.Pwm:
        return this.pwms.get()
      case Op.Phasor:
        return this.phasors.get()
      case Op.Ad:
        return this.ads.get()
      case Op.Adsr:
        return this.adsrs.get()
      case Op.Mini:
        return this.minis.get()
      case Op.Timeline:
        return this.timelines.get()
      case Op.Analyser:
        return this.analysers.get()
      case Op.Sampler:
        return this.samplers.get()
      case Op.Slicer:
        return this.slicers.get()
      case Op.Slew:
        return this.slews.get()
      case Op.Every:
        return this.every.get()
      case Op.At:
        return this.ats.get()
      case Op.Euclid:
        return this.euclids.get()
      case Op.Lp:
        return this.lps.get()
      case Op.Hp:
        return this.hps.get()
      case Op.Bp:
        return this.bps.get()
      case Op.Bs:
        return this.bss.get()
      case Op.Ls:
        return this.lss.get()
      case Op.Hs:
        return this.hss.get()
      case Op.Peak:
        return this.peaks.get()
      case Op.Ap:
        return this.aps.get()
      case Op.Compressor:
        return this.compressors.get()
      case Op.LfoSine:
        return this.lfoSines.get()
      case Op.LfoTri:
        return this.lfoTris.get()
      case Op.LfoSaw:
        return this.lfoSaws.get()
      case Op.LfoRamp:
        return this.lfoRamps.get()
      case Op.LfoSqr:
        return this.lfoSqrs.get()
      case Op.LfoSah:
        return this.lfoSahs.get()
      case Op.White:
        return this.whites.get()
      case Op.Gauss:
        return this.gausses.get()
      case Op.Pink:
        return this.pinks.get()
      case Op.Brown:
        return this.browns.get()
      case Op.Smooth:
        return this.smooths.get()
      case Op.Fractal:
        return this.fractals.get()
    }
    throw new Error(`Invalid gen op: ${op}`)
  }

  copyFrom(source: GensPool): void {
    this.sines.copyFrom(source.sines)
    this.tris.copyFrom(source.tris)
    this.saws.copyFrom(source.saws)
    this.ramps.copyFrom(source.ramps)
    this.sqrs.copyFrom(source.sqrs)
    this.pwms.copyFrom(source.pwms)
    this.phasors.copyFrom(source.phasors)
    this.ads.copyFrom(source.ads)
    this.adsrs.copyFrom(source.adsrs)
    this.minis.copyFrom(source.minis)
    this.timelines.copyFrom(source.timelines)
    this.analysers.copyFrom(source.analysers)
    this.samplers.copyFrom(source.samplers)
    this.slicers.copyFrom(source.slicers)
    this.slews.copyFrom(source.slews)
    this.every.copyFrom(source.every)
    this.ats.copyFrom(source.ats)
    this.lps.copyFrom(source.lps)
    this.hps.copyFrom(source.hps)
    this.bps.copyFrom(source.bps)
    this.bss.copyFrom(source.bss)
    this.lss.copyFrom(source.lss)
    this.hss.copyFrom(source.hss)
    this.peaks.copyFrom(source.peaks)
    this.aps.copyFrom(source.aps)
    this.compressors.copyFrom(source.compressors)
    this.lfoSines.copyFrom(source.lfoSines)
    this.lfoTris.copyFrom(source.lfoTris)
    this.lfoSaws.copyFrom(source.lfoSaws)
    this.lfoRamps.copyFrom(source.lfoRamps)
    this.lfoSqrs.copyFrom(source.lfoSqrs)
    this.lfoSahs.copyFrom(source.lfoSahs)
    this.whites.copyFrom(source.whites)
    this.gausses.copyFrom(source.gausses)
    this.pinks.copyFrom(source.pinks)
    this.browns.copyFrom(source.browns)
    this.smooths.copyFrom(source.smooths)
    this.fractals.copyFrom(source.fractals)
  }
}
