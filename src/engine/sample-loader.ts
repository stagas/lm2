export type LoadedSample = {
  url: string
  sampleRate: number
  length: number
  ch0: Float32Array<ArrayBuffer>
  ch0Buffer: ArrayBuffer
}

export class SampleLoader {
  private cache = new Map<string, Promise<LoadedSample>>()

  constructor(private readonly audioContext: AudioContext) {}

  load(url: string): Promise<LoadedSample> {
    const prev = this.cache.get(url)
    if (prev) return prev

    const p = this.fetchAndDecode(url)
    this.cache.set(url, p)
    return p
  }

  private async fetchAndDecode(url: string): Promise<LoadedSample> {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Failed to fetch sample: ${url} (${res.status})`)
    const ab = await res.arrayBuffer()
    const audioBuffer = await this.audioContext.decodeAudioData(ab)
    const ch0 = audioBuffer.getChannelData(0)
    const copy = ch0.slice()

    // Normalize audio so the peak sample amplitude becomes 1.0 (unless peak is extremely small)
    let peak = 0
    for (let i = 0; i < copy.length; i++) {
      const v = Math.abs(copy[i])
      if (v > peak) peak = v
    }

    const normFactor = peak > 0.0001 ? 1.0 / peak : 1.0
    if (normFactor !== 1.0) {
      for (let i = 0; i < copy.length; i++) {
        copy[i] = copy[i] * normFactor
      }
    }

    return {
      url,
      sampleRate: audioBuffer.sampleRate,
      length: copy.length,
      ch0: copy,
      ch0Buffer: copy.buffer,
    }
  }
}
