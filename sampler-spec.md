We want to implement sampler functionality.
It will work partly compile time and partly runtime.
It will fetch a sample and decode it with AudioContext, and upload it to the worklet.
The worklet needs to implement a host Wasm function that will be called by AssemblyScript with @external
and will request a portion of the data to be written to an internal buffer using a pointer.
This way we can have arbitrary length samples without allocating/growing the memory in Wasm,
instead they are stored in JS memory and we request the slice we need in Wasm at runtime.
The following is the desired API:

```
s=freesound(id:123456)
sampler(sample:s,speed:.9,offset:.2,trig) |> out($)
slicer(sample:s,speed:-1,offset:.2,slice:-.2,threshold:.5,trig) |> out($)
```

`freesound` will be used as meta information at compile time and converted to a specific operation
and `s` will then be a special value that can only be passed to `sampler` or `slicer`.
This can all be resolved at compile time. The sampler and slicer will then run with that
data at runtime to request slices of the sample data and play them back.
Negative speed will play the sample backwards.
`sampler` plays the sample once until the end when it receives a `trig` and waits until the next trigger `trig`.
`slicer` picks a slice based on 'slice' -1..1 normalized range of all slices (rounded to nearest slice)
'offset' -1..1 is normalized range of the entire sample (rounded to nearest sample).
'threshold' 0..1 is the threshold for detecting slices.
'trig' is a trigger signal that will start the sampler or slicer.

Example implementations to be based (roughly) on:

SampleBuffer
------------
```
import { MAX_SAMPLE_LENGTH } from '../constants'

/**
 * Fixed sample buffer with start/end pointers
 * Manages a fixed-size buffer that can hold sample data
 */
export class SampleBuffer {
  private buffer: Float32Array
  private start: i32 = 0
  private end: i32 = 0
  private length: i32 = 0
  private contentHash: i32 = -1

  constructor() {
    this.buffer = new Float32Array(MAX_SAMPLE_LENGTH)
  }

  /**
   * Load sample data from pointer
   * @param samplePtr Pointer to sample data
   * @param sampleLength Length of sample data
   * @param contentHash Content hash of the sample
   * @returns true if loaded successfully
   */
  loadSample(samplePtr: usize, sampleLength: i32, contentHash: i32): bool {
    if (sampleLength <= 0 || sampleLength > MAX_SAMPLE_LENGTH) {
      return false
    }

    // Normalize sample data
    let peak: f32 = 0
    for (let i = 0; i < sampleLength; i++) {
      const absVal = Mathf.abs(load<f32>(samplePtr + i * 4))
      if (absVal > peak) {
        peak = absVal
      }
    }

    const normFactor: f32 = peak > 0.0001 ? 1.0 / peak : 1.0

    // Copy and normalize sample data
    for (let i = 0; i < sampleLength; i++) {
      unchecked(this.buffer[i] = f32(load<f32>(samplePtr + i * 4) * normFactor))
    }

    this.start = 0
    this.end = sampleLength
    this.length = sampleLength
    this.contentHash = contentHash

    return true
  }

  /**
   * Clear the buffer
   */
  clear(): void {
    this.start = 0
    this.end = 0
    this.length = 0
    this.contentHash = -1
  }

  /**
   * Get the buffer data
   */
  getBuffer(): Float32Array {
    return this.buffer
  }

  /**
   * Get start pointer (index)
   */
  getStart(): i32 {
    return this.start
  }

  /**
   * Get end pointer (index)
   */
  getEnd(): i32 {
    return this.end
  }

  /**
   * Get length
   */
  getLength(): i32 {
    return this.length
  }

  /**
   * Get content hash
   */
  getContentHash(): i32 {
    return this.contentHash
  }

  /**
   * Check if buffer is loaded
   */
  isLoaded(): bool {
    return this.length > 0 && this.contentHash >= 0
  }
}
```
------------
SamplePlayer
------------
```
import { SampleBuffer } from '../dsp-block'

export class SamplePlayerBlock {
  private sampleBuffer: SampleBuffer | null = null
  private playbackPosition: f32 = 0
  private lastTrig: f32 = 0

  private startedFromNegativeOffset: bool = false
  private hasWrappedOnce: bool = false
  private isPlaying: bool = false

  constructor() {
  }

  /**
   * Set the sample buffer to use
   * Only reset playback position if the buffer is actually changing
   */
  setSampleBuffer(buffer: SampleBuffer | null): void {
    // Only reset playback position if buffer is actually changing
    if (this.sampleBuffer !== buffer) {
      this.playbackPosition = 0
    }
    this.sampleBuffer = buffer
  }

  /**
   * Get the current sample buffer
   */
  getSampleBuffer(): SampleBuffer | null {
    return this.sampleBuffer
  }

  destroy(): void {
    this.sampleBuffer = null
    this.playbackPosition = 0
    this.startedFromNegativeOffset = false
    this.hasWrappedOnce = false
    this.isPlaying = false
  }

  play(output: Float32Array, trig: Float32Array, speed: Float32Array, offset: Float32Array): void {
    if (this.sampleBuffer === null) {
      for (let i = 0; i < BLOCK_SIZE; i++) {
        unchecked(output[i] = 0)
      }
      return
    }

    if (!this.sampleBuffer!.isLoaded()) {
      for (let i = 0; i < BLOCK_SIZE; i++) {
        unchecked(output[i] = 0)
      }
      return
    }

    const sampleBuf = this.sampleBuffer!
    const buffer = sampleBuf.getBuffer()
    const start = sampleBuf.getStart()
    const end = sampleBuf.getEnd()
    const bufLen = sampleBuf.getLength()

    if (bufLen <= 0) {
      for (let i = 0; i < BLOCK_SIZE; i++) {
        unchecked(output[i] = 0)
      }
      return
    }

    for (let i = 0; i < BLOCK_SIZE; i++) {
      if (unchecked(trig[i]) > 0 && this.lastTrig <= 0) {
        let normalizedOffset = unchecked(offset[i])
        this.startedFromNegativeOffset = normalizedOffset < 0
        this.hasWrappedOnce = false
        if (normalizedOffset < 0) {
          normalizedOffset = 1.0 + normalizedOffset
        }
        normalizedOffset = Mathf.max(0.0, Mathf.min(normalizedOffset, 1.0))
        this.playbackPosition = normalizedOffset * f32(bufLen)
        this.isPlaying = true
      }
      this.lastTrig = unchecked(trig[i])

      if (!this.isPlaying) {
        unchecked(output[i] = 0)
        continue
      }

      const playbackSpeed = Mathf.max(0.01, Mathf.min(unchecked(speed[i]), 10.0)) / oversamplingFactor

      // Handle wrapping when started from negative offset: wrap once then continue to end
      if (this.startedFromNegativeOffset && !this.hasWrappedOnce && this.playbackPosition >= f32(bufLen)) {
        this.playbackPosition = this.playbackPosition - f32(bufLen)
        this.hasWrappedOnce = true
      }

      const pos = this.playbackPosition + f32(start)
      if (pos >= f32(start) && pos < f32(end)) {
        const idx = i32(Mathf.floor(pos))
        const frac = pos - f32(idx)

        const s0 = idx > start ? unchecked(buffer[idx - 1]) : unchecked(buffer[start])
        const s1 = unchecked(buffer[idx])
        const s2 = idx + 1 < end ? unchecked(buffer[idx + 1]) : unchecked(buffer[end - 1])
        const s3 = idx + 2 < end ? unchecked(buffer[idx + 2]) : unchecked(buffer[end - 1])

        const t = frac
        const t2 = t * t
        const t3 = t2 * t

        const w0: f32 = (-t3 + 3.0 * t2 - 3.0 * t + 1.0) / 6.0
        const w1: f32 = (3.0 * t3 - 6.0 * t2 + 4.0) / 6.0
        const w2: f32 = (-3.0 * t3 + 3.0 * t2 + 3.0 * t + 1.0) / 6.0
        const w3: f32 = t3 / 6.0

        unchecked(output[i] = s0 * w0 + s1 * w1 + s2 * w2 + s3 * w3)

        this.playbackPosition += playbackSpeed
      }
      else {
        unchecked(output[i] = 0)
        this.isPlaying = false
      }
    }
  }
}
```
------
Slicer
------
```
import { SampleBuffer } from '../dsp-block'

export class SlicerBlock {
  private sampleBuffer: SampleBuffer | null = null
  private playbackPosition: f32 = 0
  private lastTrig: f32 = 0

  private slicePoints: StaticArray<i32>
  private sliceEnds: StaticArray<i32>
  private numSlices: i32 = 0
  private lastThreshold: f32 = 0.5

  constructor() {
    this.slicePoints = new StaticArray<i32>(512)
    this.sliceEnds = new StaticArray<i32>(512)
  }

  /**
   * Set the sample buffer to use
   * Only reset playback position if the buffer is actually changing
   */
  setSampleBuffer(buffer: SampleBuffer | null): void {
    // Only reset playback position if buffer is actually changing
    if (this.sampleBuffer !== buffer) {
      this.playbackPosition = 0
    }
    this.sampleBuffer = buffer
    if (buffer !== null && buffer.isLoaded()) {
      this.detectPeaks(this.lastThreshold)
    }
  }

  /**
   * Get the current sample buffer
   */
  getSampleBuffer(): SampleBuffer | null {
    return this.sampleBuffer
  }

  private detectPeaks(thresholdMultiplier: f32): void {
    this.numSlices = 0

    if (this.sampleBuffer === null) {
      return
    }

    if (!this.sampleBuffer!.isLoaded()) {
      return
    }

    const sampleBuf = this.sampleBuffer!
    const buffer = sampleBuf.getBuffer()
    const start = sampleBuf.getStart()
    const end = sampleBuf.getEnd()
    const bufferLength = sampleBuf.getLength()

    unchecked(this.slicePoints[this.numSlices] = start)
    this.numSlices++

    const hopSize: i32 = 512
    const minDistance: i32 = 1024

    let prevEnergy: f32 = 0
    let lastPeakPos: i32 = start

    for (let i = start + hopSize; i < end - hopSize; i += hopSize) {
      let energy: f32 = 0
      for (let j = 0; j < hopSize && i + j < end; j++) {
        const val = unchecked(buffer[i + j])
        energy += val * val
      }
      energy = Mathf.sqrt(energy / f32(hopSize))

      const energyDiff = energy - prevEnergy
      const onsetThreshold = prevEnergy * thresholdMultiplier * 0.3

      if (energyDiff > onsetThreshold && energyDiff > 0.01 && i - lastPeakPos >= minDistance) {
        let onsetPoint = i
        let maxVal: f32 = 0

        let searchStart = i - hopSize / 2
        if (searchStart < start) searchStart = start
        let searchEnd = i + hopSize / 2
        if (searchEnd > end) searchEnd = end

        for (let j = searchStart; j < searchEnd; j++) {
          const absVal = Mathf.abs(unchecked(buffer[j]))
          if (absVal > maxVal) {
            maxVal = absVal
            onsetPoint = j
          }
        }

        if (this.numSlices < 512) {
          unchecked(this.slicePoints[this.numSlices] = onsetPoint)
          this.numSlices++
          lastPeakPos = onsetPoint
        }
      }

      prevEnergy = energy
    }

    for (let i = 0; i < this.numSlices; i++) {
      if (i < this.numSlices - 1) {
        unchecked(this.sliceEnds[i] = unchecked(this.slicePoints[i + 1]))
      }
      else {
        unchecked(this.sliceEnds[i] = end)
      }
    }

    if (this.numSlices == 0) {
      unchecked(this.slicePoints[0] = start)
      unchecked(this.sliceEnds[0] = end)
      this.numSlices = 1
    }
  }

  destroy(): void {
    this.sampleBuffer = null
    this.playbackPosition = 0
  }

  play(
    output: Float32Array,
    trig: Float32Array,
    speed: Float32Array,
    offset: Float32Array,
    threshold: Float32Array,
  ): void {
    if (this.sampleBuffer === null) {
      for (let i = 0; i < BLOCK_SIZE; i++) {
        unchecked(output[i] = 0)
      }
      return
    }

    if (!this.sampleBuffer!.isLoaded()) {
      for (let i = 0; i < BLOCK_SIZE; i++) {
        unchecked(output[i] = 0)
      }
      return
    }

    const sampleBuf = this.sampleBuffer!
    const buffer = sampleBuf.getBuffer()
    const start = sampleBuf.getStart()
    const end = sampleBuf.getEnd()
    const bufLen = sampleBuf.getLength()

    if (bufLen <= 0) {
      for (let i = 0; i < BLOCK_SIZE; i++) {
        unchecked(output[i] = 0)
      }
      return
    }

    for (let i = 0; i < BLOCK_SIZE; i++) {
      const thresholdValue = Mathf.max(0.00001, Mathf.min(unchecked(threshold[i]), 2.0))

      if (
        bufLen > 0
        && Mathf.abs(thresholdValue - this.lastThreshold) > 0.1 * this.lastThreshold
      ) {
        this.lastThreshold = thresholdValue
        this.detectPeaks(this.lastThreshold)
      }

      if (unchecked(trig[i]) > 0 && this.lastTrig <= 0) {
        if (this.numSlices > 0) {
          let normalizedOffset = Mathf.max(-1.0, Mathf.min(unchecked(offset[i]), 1.0))
          normalizedOffset = (normalizedOffset + 1.0) * 0.5
          const sliceIndex = i32(Mathf.floor(normalizedOffset * f32(this.numSlices - 1) + 0.5))
          let clampedIndex = sliceIndex
          if (clampedIndex < 0) clampedIndex = 0
          if (clampedIndex >= this.numSlices) clampedIndex = this.numSlices - 1
          this.playbackPosition = f32(unchecked(this.slicePoints[clampedIndex]))
        }
        else {
          this.playbackPosition = 0
        }
      }
      this.lastTrig = unchecked(trig[i])

      const playbackSpeed = Mathf.max(0.01, Mathf.min(unchecked(speed[i]), 10.0)) / oversamplingFactor

      const pos = this.playbackPosition + f32(start)
      if (pos >= f32(start) && pos < f32(end)) {
        const idx = i32(Mathf.floor(pos))
        const frac = pos - f32(idx)

        const s0 = idx > start ? unchecked(buffer[idx - 1]) : unchecked(buffer[start])
        const s1 = unchecked(buffer[idx])
        const s2 = idx + 1 < end ? unchecked(buffer[idx + 1]) : unchecked(buffer[end - 1])
        const s3 = idx + 2 < end ? unchecked(buffer[idx + 2]) : unchecked(buffer[end - 1])

        const t = frac
        const t2 = t * t
        const t3 = t2 * t

        const w0: f32 = (-t3 + 3.0 * t2 - 3.0 * t + 1.0) / 6.0
        const w1: f32 = (3.0 * t3 - 6.0 * t2 + 4.0) / 6.0
        const w2: f32 = (-3.0 * t3 + 3.0 * t2 + 3.0 * t + 1.0) / 6.0
        const w3: f32 = t3 / 6.0

        unchecked(output[i] = s0 * w0 + s1 * w1 + s2 * w2 + s3 * w3)

        this.playbackPosition += playbackSpeed
      }
      else {
        unchecked(output[i] = 0)
      }
    }
  }
}
```
-------------
Sample Loader
-------------
```
/**
 * Sample Loader
 * Fetches and decodes audio files for sample playback
 */

import { hashString, hashAudioBuffer } from './bytecode.ts'

export interface SampleData {
  id: number
  path: string
  audioBuffer: AudioBuffer
}

export class SampleLoader {
  private audioContext: AudioContext
  private loadedSamples = new Map<number, SampleData>()
  private loadingPromises = new Map<string, Promise<SampleData>>()
  private pathToContentHash = new Map<string, number>()

  constructor(audioContext: AudioContext) {
    this.audioContext = audioContext
  }

  async loadSample(path: string): Promise<SampleData> {
    // Check if we already have a loading promise for this path
    if (this.loadingPromises.has(path)) {
      return this.loadingPromises.get(path)!
    }

    // Start loading
    const promise = this.fetchAndDecodeSample(path)
    this.loadingPromises.set(path, promise)

    try {
      const sampleData = await promise
      // Cache by content hash, not path hash
      this.loadedSamples.set(sampleData.id, sampleData)
      this.pathToContentHash.set(path, sampleData.id)
      this.loadingPromises.delete(path)
      return sampleData
    } catch (error) {
      this.loadingPromises.delete(path)
      throw error
    }
  }

  private async fetchAndDecodeSample(path: string): Promise<SampleData> {
    // Resolve espeak URLs - replace __MESPEAK__ with actual env var URL
    let resolvedPath = path
    if (path.startsWith('__MESPEAK__')) {
      const baseUrl = import.meta.env.VITE_MESPEAK_URL || '/mespeak'
      resolvedPath = path.replace('__MESPEAK__', baseUrl)
    }

    try {
      // Fetch the audio file
      const response = await fetch(resolvedPath)
      if (!response.ok) {
        // Check if this is a freesound sample and extract the ID
        if (resolvedPath.includes('freesound')) {
          const idMatch = resolvedPath.match(/[?&]id=(\d+)/)
          const sampleId = idMatch ? idMatch[1] : 'unknown'
          const statusText = response.status === 404 ? 'Not found: 404' : `${response.status}`
          throw new Error(`Failed to fetch freesound sample "${sampleId}" (${statusText})`)
        }
        const statusText = response.status === 404 ? 'Not found: 404' : `${response.status}`
        throw new Error(`Failed to fetch sample: ${resolvedPath} (${statusText})`)
      }

      const arrayBuffer = await response.arrayBuffer()

      // Decode audio data
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer)

      // Compute content hash from audio data
      const contentHash = hashAudioBuffer(audioBuffer)

      return {
        id: contentHash,
        path: resolvedPath,
        audioBuffer,
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      // Check if this is a freesound sample and format the error message accordingly
      if (resolvedPath.includes('freesound')) {
        const idMatch = resolvedPath.match(/[?&]id=(\d+)/)
        const sampleId = idMatch ? idMatch[1] : 'unknown'
        // If the error message already mentions freesound, use it as-is
        if (errorMessage.toLowerCase().includes('freesound')) {
          throw error
        }
        throw new Error(`Failed to fetch freesound sample "${sampleId}": ${errorMessage}`)
      }
      throw new Error(`Failed to load sample "${resolvedPath}": ${errorMessage}`)
    }
  }

  getLoadedSample(path: string): SampleData | undefined {
    const contentHash = this.pathToContentHash.get(path)
    if (contentHash !== undefined) {
      return this.loadedSamples.get(contentHash)
    }
    return undefined
  }

  clear(): void {
    this.loadedSamples.clear()
    this.loadingPromises.clear()
    this.pathToContentHash.clear()
  }
}
```
