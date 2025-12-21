export type LoadedSample = {
  url: string
  sampleRate: number
  length: number
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
    return {
      url,
      sampleRate: audioBuffer.sampleRate,
      length: copy.length,
      ch0Buffer: copy.buffer,
    }
  }
}


