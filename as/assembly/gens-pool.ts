import { Ad } from './gen/ad'
import { Adsr } from './gen/adsr'
import { Analyser } from './gen/analyser'
import { At } from './gen/at'
import { Ap, Bp, Bs, Hp, Hs, Lp, Ls, Peak } from './gen/biquad'
import { Compressor } from './gen/compressor'
import { Dattorro } from './gen/dattorro'
import { DC } from './gen/dc'
import { Delay } from './gen/delay'
import { DiodeLadder } from './gen/diodeladder'
import { Envfollow } from './gen/envfollow'
import { Euclid } from './gen/euclid'
import { Every } from './gen/every'
import { Fdn } from './gen/fdn'
import { Freeverb } from './gen/freeverb'
import { Gate } from './gen/gate'
import { Gen } from './gen/gen'
import { LfoRamp, LfoSah, LfoSaw, LfoSine, LfoSqr, LfoTri } from './gen/lfo'
import { Limiter } from './gen/limiter'
import { Mini } from './gen/mini'
import { Mhp, Mlp } from './gen/moog'
import { BrownNoise, FractalNoise, GaussNoise, PinkNoise, SmoothNoise, WhiteNoise } from './gen/noise'
import { Ohp, Olp } from './gen/onepole'
import { Phasor, Pwm, Ramp, Saw, Sqr, Tri } from './gen/osc'
import { Sampler } from './gen/sampler'
import { Sine } from './gen/sine'
import { Slew } from './gen/slew'
import { Slicer } from './gen/slicer'
import { Sap, Sbp, Sbs, Shp, Slp, Speak } from './gen/svf'
import { Timeline } from './gen/timeline'
import { Velvet } from './gen/velvet'
import { Op } from './shared'

export class GenPool<T extends Gen> {
  private index: i32 = 0
  gens: T[] = []
  constructor(private ctor: () => T) {}
  resetIndex(): void {
    this.index = 0
  }
  @inline
  getIndex(): i32 {
    return this.index
  }
  @inline
  setIndex(index: i32): void {
    this.index = index
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
  private envfollows: GenPool<Envfollow> = new GenPool<Envfollow>(() => new Envfollow())
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
  private expanders: GenPool<Gate> = new GenPool<Gate>(() => new Gate())
  private gates: GenPool<Gate> = new GenPool<Gate>(() => new Gate())
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
  private delays: GenPool<Delay> = new GenPool<Delay>(() => new Delay())
  private limiters: GenPool<Limiter> = new GenPool<Limiter>(() => new Limiter())
  private freeverbs: GenPool<Freeverb> = new GenPool<Freeverb>(() => new Freeverb())
  private dattorros: GenPool<Dattorro> = new GenPool<Dattorro>(() => new Dattorro())
  private fdns: GenPool<Fdn> = new GenPool<Fdn>(() => new Fdn())
  private velvets: GenPool<Velvet> = new GenPool<Velvet>(() => new Velvet())
  private dcs: GenPool<DC> = new GenPool<DC>(() => new DC())
  private slps: GenPool<Slp> = new GenPool<Slp>(() => new Slp())
  private shps: GenPool<Shp> = new GenPool<Shp>(() => new Shp())
  private sbps: GenPool<Sbp> = new GenPool<Sbp>(() => new Sbp())
  private sbss: GenPool<Sbs> = new GenPool<Sbs>(() => new Sbs())
  private speaks: GenPool<Speak> = new GenPool<Speak>(() => new Speak())
  private saps: GenPool<Sap> = new GenPool<Sap>(() => new Sap())
  private mlps: GenPool<Mlp> = new GenPool<Mlp>(() => new Mlp())
  private mhps: GenPool<Mhp> = new GenPool<Mhp>(() => new Mhp())
  private diodeLadders: GenPool<DiodeLadder> = new GenPool<DiodeLadder>(() => new DiodeLadder())
  private olps: GenPool<Olp> = new GenPool<Olp>(() => new Olp())
  private ohps: GenPool<Ohp> = new GenPool<Ohp>(() => new Ohp())

  // Keep in sync with `saveIndices()`/`restoreIndices()`.
  static readonly INDICES_COUNT: i32 = 58

  @inline
  saveIndices(out: StaticArray<i32>): void {
    let i: i32 = 0
    out[i++] = this.sines.getIndex()
    out[i++] = this.tris.getIndex()
    out[i++] = this.saws.getIndex()
    out[i++] = this.ramps.getIndex()
    out[i++] = this.sqrs.getIndex()
    out[i++] = this.pwms.getIndex()
    out[i++] = this.phasors.getIndex()
    out[i++] = this.ads.getIndex()
    out[i++] = this.adsrs.getIndex()
    out[i++] = this.envfollows.getIndex()
    out[i++] = this.minis.getIndex()
    out[i++] = this.timelines.getIndex()
    out[i++] = this.analysers.getIndex()
    out[i++] = this.samplers.getIndex()
    out[i++] = this.slicers.getIndex()
    out[i++] = this.slews.getIndex()
    out[i++] = this.every.getIndex()
    out[i++] = this.ats.getIndex()
    out[i++] = this.euclids.getIndex()
    out[i++] = this.lps.getIndex()
    out[i++] = this.hps.getIndex()
    out[i++] = this.bps.getIndex()
    out[i++] = this.bss.getIndex()
    out[i++] = this.lss.getIndex()
    out[i++] = this.hss.getIndex()
    out[i++] = this.peaks.getIndex()
    out[i++] = this.aps.getIndex()
    out[i++] = this.compressors.getIndex()
    out[i++] = this.lfoSines.getIndex()
    out[i++] = this.lfoTris.getIndex()
    out[i++] = this.lfoSaws.getIndex()
    out[i++] = this.lfoRamps.getIndex()
    out[i++] = this.lfoSqrs.getIndex()
    out[i++] = this.lfoSahs.getIndex()
    out[i++] = this.whites.getIndex()
    out[i++] = this.gausses.getIndex()
    out[i++] = this.pinks.getIndex()
    out[i++] = this.browns.getIndex()
    out[i++] = this.smooths.getIndex()
    out[i++] = this.fractals.getIndex()
    out[i++] = this.delays.getIndex()
    out[i++] = this.limiters.getIndex()
    out[i++] = this.freeverbs.getIndex()
    out[i++] = this.dattorros.getIndex()
    out[i++] = this.fdns.getIndex()
    out[i++] = this.velvets.getIndex()
    out[i++] = this.dcs.getIndex()
    out[i++] = this.slps.getIndex()
    out[i++] = this.shps.getIndex()
    out[i++] = this.sbps.getIndex()
    out[i++] = this.sbss.getIndex()
    out[i++] = this.speaks.getIndex()
    out[i++] = this.saps.getIndex()
    out[i++] = this.mlps.getIndex()
    out[i++] = this.mhps.getIndex()
    out[i++] = this.diodeLadders.getIndex()
    out[i++] = this.olps.getIndex()
    out[i++] = this.ohps.getIndex()
  }

  @inline
  restoreIndices(src: StaticArray<i32>): void {
    let i: i32 = 0
    this.sines.setIndex(src[i++])
    this.tris.setIndex(src[i++])
    this.saws.setIndex(src[i++])
    this.ramps.setIndex(src[i++])
    this.sqrs.setIndex(src[i++])
    this.pwms.setIndex(src[i++])
    this.phasors.setIndex(src[i++])
    this.ads.setIndex(src[i++])
    this.adsrs.setIndex(src[i++])
    this.envfollows.setIndex(src[i++])
    this.minis.setIndex(src[i++])
    this.timelines.setIndex(src[i++])
    this.analysers.setIndex(src[i++])
    this.samplers.setIndex(src[i++])
    this.slicers.setIndex(src[i++])
    this.slews.setIndex(src[i++])
    this.every.setIndex(src[i++])
    this.ats.setIndex(src[i++])
    this.euclids.setIndex(src[i++])
    this.lps.setIndex(src[i++])
    this.hps.setIndex(src[i++])
    this.bps.setIndex(src[i++])
    this.bss.setIndex(src[i++])
    this.lss.setIndex(src[i++])
    this.hss.setIndex(src[i++])
    this.peaks.setIndex(src[i++])
    this.aps.setIndex(src[i++])
    this.compressors.setIndex(src[i++])
    this.lfoSines.setIndex(src[i++])
    this.lfoTris.setIndex(src[i++])
    this.lfoSaws.setIndex(src[i++])
    this.lfoRamps.setIndex(src[i++])
    this.lfoSqrs.setIndex(src[i++])
    this.lfoSahs.setIndex(src[i++])
    this.whites.setIndex(src[i++])
    this.gausses.setIndex(src[i++])
    this.pinks.setIndex(src[i++])
    this.browns.setIndex(src[i++])
    this.smooths.setIndex(src[i++])
    this.fractals.setIndex(src[i++])
    this.delays.setIndex(src[i++])
    this.limiters.setIndex(src[i++])
    this.freeverbs.setIndex(src[i++])
    this.dattorros.setIndex(src[i++])
    this.fdns.setIndex(src[i++])
    this.velvets.setIndex(src[i++])
    this.dcs.setIndex(src[i++])
    this.slps.setIndex(src[i++])
    this.shps.setIndex(src[i++])
    this.sbps.setIndex(src[i++])
    this.sbss.setIndex(src[i++])
    this.speaks.setIndex(src[i++])
    this.saps.setIndex(src[i++])
    this.mlps.setIndex(src[i++])
    this.mhps.setIndex(src[i++])
    this.diodeLadders.setIndex(src[i++])
    this.olps.setIndex(src[i++])
    this.ohps.setIndex(src[i++])
  }
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
    this.envfollows.resetIndex()
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
    this.delays.resetIndex()
    this.limiters.resetIndex()
    this.freeverbs.resetIndex()
    this.dattorros.resetIndex()
    this.fdns.resetIndex()
    this.velvets.resetIndex()
    this.dcs.resetIndex()
    this.slps.resetIndex()
    this.shps.resetIndex()
    this.sbps.resetIndex()
    this.sbss.resetIndex()
    this.speaks.resetIndex()
    this.saps.resetIndex()
    this.mlps.resetIndex()
    this.mhps.resetIndex()
    this.diodeLadders.resetIndex()
    this.olps.resetIndex()
    this.ohps.resetIndex()
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
    this.envfollows.reset()
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
    this.delays.reset()
    this.limiters.reset()
    this.freeverbs.reset()
    this.dattorros.reset()
    this.fdns.reset()
    this.velvets.reset()
    this.dcs.reset()
    this.slps.reset()
    this.shps.reset()
    this.sbps.reset()
    this.sbss.reset()
    this.speaks.reset()
    this.saps.reset()
    this.mlps.reset()
    this.mhps.reset()
    this.diodeLadders.reset()
    this.olps.reset()
    this.ohps.reset()
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
      case Op.Envfollow:
        return this.envfollows.get()
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
      case Op.Expander:
        return this.expanders.get()
      case Op.Gate:
        return this.gates.get()
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
      case Op.Delay:
        return this.delays.get()
      case Op.Limiter:
        return this.limiters.get()
      case Op.Freeverb:
        return this.freeverbs.get()
      case Op.Dattorro:
        return this.dattorros.get()
      case Op.Fdn:
        return this.fdns.get()
      case Op.Velvet:
        return this.velvets.get()
      case Op.Dc:
        return this.dcs.get()
      case Op.Slp:
        return this.slps.get()
      case Op.Shp:
        return this.shps.get()
      case Op.Sbp:
        return this.sbps.get()
      case Op.Sbs:
        return this.sbss.get()
      case Op.Speak:
        return this.speaks.get()
      case Op.Sap:
        return this.saps.get()
      case Op.Mlp:
        return this.mlps.get()
      case Op.Mhp:
        return this.mhps.get()
      case Op.DiodeLadder:
        return this.diodeLadders.get()
      case Op.Olp:
        return this.olps.get()
      case Op.Ohp:
        return this.ohps.get()
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
    this.envfollows.copyFrom(source.envfollows)
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
    this.limiters.copyFrom(source.limiters)
    this.freeverbs.copyFrom(source.freeverbs)
    this.dattorros.copyFrom(source.dattorros)
    this.fdns.copyFrom(source.fdns)
    this.velvets.copyFrom(source.velvets)
    this.dcs.copyFrom(source.dcs)
    this.slps.copyFrom(source.slps)
    this.shps.copyFrom(source.shps)
    this.sbps.copyFrom(source.sbps)
    this.sbss.copyFrom(source.sbss)
    this.speaks.copyFrom(source.speaks)
    this.saps.copyFrom(source.saps)
    this.mlps.copyFrom(source.mlps)
    this.mhps.copyFrom(source.mhps)
    this.diodeLadders.copyFrom(source.diodeLadders)
    this.olps.copyFrom(source.olps)
    this.ohps.copyFrom(source.ohps)
  }
}
