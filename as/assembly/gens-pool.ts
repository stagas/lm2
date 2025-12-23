import { Ad } from './gen/ad'
import { Adsr } from './gen/adsr'
import { Analyser } from './gen/analyser'
import { At } from './gen/at'
import { Every } from './gen/every'
import { Gen } from './gen/gen'
import { Mini } from './gen/mini'
import { Sampler } from './gen/sampler'
import { Sine } from './gen/sine'
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
  private ads: GenPool<Ad> = new GenPool<Ad>(() => new Ad())
  private adsrs: GenPool<Adsr> = new GenPool<Adsr>(() => new Adsr())
  private minis: GenPool<Mini> = new GenPool<Mini>(() => new Mini())
  private timelines: GenPool<Timeline> = new GenPool<Timeline>(() => new Timeline())
  private analysers: GenPool<Analyser> = new GenPool<Analyser>(() => new Analyser())
  private samplers: GenPool<Sampler> = new GenPool<Sampler>(() => new Sampler())
  private slicers: GenPool<Slicer> = new GenPool<Slicer>(() => new Slicer())
  private every: GenPool<Every> = new GenPool<Every>(() => new Every())
  private ats: GenPool<At> = new GenPool<At>(() => new At())
  resetIndices(): void {
    this.sines.resetIndex()
    this.ads.resetIndex()
    this.adsrs.resetIndex()
    this.minis.resetIndex()
    this.timelines.resetIndex()
    this.analysers.resetIndex()
    this.samplers.resetIndex()
    this.slicers.resetIndex()
    this.every.resetIndex()
    this.ats.resetIndex()
  }
  reset(): void {
    this.sines.reset()
    this.ads.reset()
    this.adsrs.reset()
    this.minis.reset()
    this.timelines.reset()
    this.analysers.reset()
    this.samplers.reset()
    this.slicers.reset()
    this.every.reset()
    this.ats.reset()
  }
  get(op: Op): Gen {
    switch (op) {
      case Op.Sine:
        return this.sines.get()
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
      case Op.Every:
        return this.every.get()
      case Op.At:
        return this.ats.get()
    }
    throw new Error(`Invalid gen op: ${op}`)
  }

  copyFrom(source: GensPool): void {
    this.sines.copyFrom(source.sines)
    this.ads.copyFrom(source.ads)
    this.adsrs.copyFrom(source.adsrs)
    this.minis.copyFrom(source.minis)
    this.timelines.copyFrom(source.timelines)
    this.analysers.copyFrom(source.analysers)
    this.samplers.copyFrom(source.samplers)
    this.slicers.copyFrom(source.slicers)
    this.every.copyFrom(source.every)
    this.ats.copyFrom(source.ats)
  }
}
