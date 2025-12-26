We define the spec for `lfo<x>` gens.
Those will be: `lfosine` `lfotri` `lfosaw` `lforamp` `lfosqr` `lfosah`(sample and hold).

They all have the API `(bar, offset?, trig?)` e.g `lfosine(bar:1/16, offset:0, trig:0)` or `lfosaw(4/1, 0, trig)` that determines a global sample count beat-locked period where they oscillate.

`trig` resets the phase when it crosses from `<= 0` to `> 0` (phase restarts at the `offset` position).

They should be in sync regardless of when they were inserted, they all sync to the global sample count(they are stateless).

`lfosah(bar, seed, offset?, trig?)` receives an optional seed for its rng.

All `lfo*` outputs are in the range `0..1` (not `-1..1`).

We also create UI widgets in the same appearance as the `useLpWidget.ts`, where they draw their main curve (a single full period sine wave, a single full period sawtooth wave, or a diagonal line in the case of SAH.) We then publish history depending where that value is in time we show a straight vertical "playhead" similar to the `useLpWidget.ts`'s cutoff vertical line. For SAH we show again where in the diagonal line the value is now, all with latency compensation (without any extra alpha smoothing).
We do not need to draw any text or axis markers.

It should be based roughly on this code:

```
export enum LfoType {
  SIN,
  TRI,
  SAW,
  RAMP,
  SQR,
  SAH,
}

export class LfoBlock {
  phase: f32 = 0
  lastTrig: f32 = 0
  lastBeat: f32 = -1.0
  lastWidth: f32 = 0.0
  seed: u32
  initialSeed: u32
  lastBeatCycle: i32 = -1
  heldValue: f32 = 0.0
  triggerSampleOffset: f32 = 0.0

  constructor(seed: u32 = 1234) {
    this.initialSeed = seed
    this.seed = seed
  }

  getInitialSeed(): u32 {
    return this.initialSeed
  }

  setSeed(seed: u32): void {
    if (this.initialSeed !== seed) {
      this.initialSeed = seed
      this.seed = seed
    }
  }

  private calculatePhase(beat: f32, offset: f32, trig: f32): f32 {
    const safeBpm = Mathf.max(1.0, bpm * oversamplingFactor)
    const samplesPerQuarterBeat: f32 = (60.0 / safeBpm) * sampleRate * 4.0
    const samplesPerCycle: f32 = samplesPerQuarterBeat * Mathf.max(0.001, beat)

    // Convert offset (in beats) to samples
    const offsetSamples: f32 = samplesPerQuarterBeat * offset

    const globalSample = globalSampleCounter as f32

    // Handle trigger: set reference point so phase resets to 0
    if (trig > 0 && this.lastTrig <= 0) {
      // Set trigger reference to current time
      this.triggerSampleOffset = globalSample
    }
    this.lastTrig = trig

    // Calculate phase from trigger reference (or 0 if never triggered)
    const adjustedSample: f32 = globalSample - this.triggerSampleOffset + offsetSamples

    // Calculate cycle position
    let cyclePosition: f32 = adjustedSample % samplesPerCycle

    // Wrap negative phases to positive (for negative offsets)
    if (cyclePosition < 0) {
      cyclePosition = cyclePosition + samplesPerCycle
    }

    const normalizedPhase: f32 = cyclePosition / samplesPerCycle

    return normalizedPhase
  }

  sin(output: Float32Array, beat: Float32Array, offset: Float32Array, trig: Float32Array): void {
    for (let i = 0; i < BLOCK_SIZE; i++) {
      const beatValue: f32 = Mathf.max(0.001, unchecked(beat[i]))
      const offsetValue: f32 = unchecked(offset[i])
      const trigValue: f32 = unchecked(trig[i])
      const currentPhase = this.calculatePhase(beatValue, offsetValue, trigValue)
      const outputValue: f32 = Mathf.sin(currentPhase * TWO_PI)

      unchecked(output[i] = outputValue)

      this.lastBeat = beatValue
      this.phase = currentPhase
    }
  }

  tri(output: Float32Array, beat: Float32Array, offset: Float32Array, trig: Float32Array): void {
    for (let i = 0; i < BLOCK_SIZE; i++) {
      const beatValue: f32 = Mathf.max(0.001, unchecked(beat[i]))
      const offsetValue: f32 = unchecked(offset[i])
      const trigValue: f32 = unchecked(trig[i])

      const currentPhase = this.calculatePhase(beatValue, offsetValue, trigValue)
      let outputValue: f32 = 0.0

      if (currentPhase < 0.5) {
        outputValue = 4.0 * currentPhase - 1.0
      }
      else {
        outputValue = 3.0 - 4.0 * currentPhase
      }

      unchecked(output[i] = outputValue)

      this.lastBeat = beatValue
      this.phase = currentPhase
    }
  }

  saw(output: Float32Array, beat: Float32Array, offset: Float32Array, trig: Float32Array): void {
    for (let i = 0; i < BLOCK_SIZE; i++) {
      const beatValue: f32 = Mathf.max(0.001, unchecked(beat[i]))
      const offsetValue: f32 = unchecked(offset[i])
      const trigValue: f32 = unchecked(trig[i])

      const currentPhase = this.calculatePhase(beatValue, offsetValue, trigValue)
      const outputValue: f32 = 2.0 * currentPhase - 1.0

      unchecked(output[i] = outputValue)

      this.lastBeat = beatValue
      this.phase = currentPhase
    }
  }

  ramp(output: Float32Array, beat: Float32Array, offset: Float32Array, trig: Float32Array): void {
    for (let i = 0; i < BLOCK_SIZE; i++) {
      const beatValue: f32 = Mathf.max(0.001, unchecked(beat[i]))
      const offsetValue: f32 = unchecked(offset[i])
      const trigValue: f32 = unchecked(trig[i])

      const currentPhase = this.calculatePhase(beatValue, offsetValue, trigValue)
      const outputValue: f32 = 1.0 - 2.0 * currentPhase

      unchecked(output[i] = outputValue)

      this.lastBeat = beatValue
      this.phase = currentPhase
    }
  }

  sqr(output: Float32Array, beat: Float32Array, offset: Float32Array, trig: Float32Array): void {
    for (let i = 0; i < BLOCK_SIZE; i++) {
      const beatValue: f32 = Mathf.max(0.001, unchecked(beat[i]))
      const offsetValue: f32 = unchecked(offset[i])
      const trigValue: f32 = unchecked(trig[i])

      const currentPhase = this.calculatePhase(beatValue, offsetValue, trigValue)
      const outputValue: f32 = currentPhase < 0.5 ? 1.0 : -1.0

      unchecked(output[i] = outputValue)

      this.lastBeat = beatValue
      this.phase = currentPhase
    }
  }

  sah(output: Float32Array, beat: Float32Array, offset: Float32Array, trig: Float32Array): void {
    for (let i = 0; i < BLOCK_SIZE; i++) {
      const beatValue: f32 = Mathf.max(0.001, unchecked(beat[i]))
      const offsetValue: f32 = unchecked(offset[i])
      const trigValue: f32 = unchecked(trig[i])

      const safeBpm = Mathf.max(1.0, bpm * oversamplingFactor)
      const samplesPerQuarterBeat: f32 = (60.0 / safeBpm) * sampleRate * 4.0
      const samplesPerCycle: f32 = samplesPerQuarterBeat * beatValue
      const intervalSamples: i32 = i32(Mathf.max(1.0, samplesPerCycle))

      // Calculate offset in samples
      const offsetSamplesPerQuarterBeat: f32 = (60.0 / safeBpm) * sampleRate * 4.0
      const offsetSamples: i32 = i32(offsetSamplesPerQuarterBeat * offsetValue)

      // Check if beat parameter changed - reset tracking if so
      const beatChanged: bool = this.lastBeat >= 0 && this.lastBeat !== beatValue
      if (beatChanged) {
        this.lastBeatCycle = -1 // Force recalculation on next call
      }

      // Get current global sample (control-rate: check once per block)
      const globalSample = i32(globalSampleCounter)

      // Apply offset to global sample
      const offsetGlobalSample = globalSample - offsetSamples

      // Calculate current beat cycle with offset applied
      let currentBeatCycle: i32 = 0
      if (offsetGlobalSample >= 0) {
        currentBeatCycle = offsetGlobalSample / intervalSamples
      }
      else {
        // For negative values, use floor division behavior
        currentBeatCycle = (offsetGlobalSample - intervalSamples + 1) / intervalSamples
      }

      // Detect trigger rising edge
      if (trigValue > 0 && this.lastTrig <= 0) {
        // Reset seed on trigger
        this.seed = this.initialSeed
        // Generate new random value on trigger
        this.seed = u32((this.seed * 1664525 + 1013904223) % 4294967296)
        const random: f32 = (this.seed as f32) / 2147483648.0 // 0..1
        this.heldValue = random * 2.0 - 1.0 // -1..1
        // Update cycle tracking
        this.lastBeatCycle = currentBeatCycle
      }
      this.lastTrig = trigValue

      // Generate new random value only when crossing beat boundary
      if (this.lastBeatCycle < 0) {
        // First time or after beat change: generate initial value
        this.seed = this.initialSeed
        this.seed = u32((this.seed * 1664525 + 1013904223) % 4294967296)
        const random: f32 = (this.seed as f32) / 2147483648.0 // 0..1
        this.heldValue = random * 2.0 - 1.0 // -1..1
        // Update cycle tracking
        this.lastBeatCycle = currentBeatCycle
      }
      else if (currentBeatCycle > this.lastBeatCycle) {
        // Crossed beat boundary: generate new random value
        this.seed = u32((this.seed * 1664525 + 1013904223) % 4294967296)
        const random: f32 = (this.seed as f32) / 2147483648.0 // 0..1
        this.heldValue = random * 2.0 - 1.0 // -1..1
        // Update cycle tracking
        this.lastBeatCycle = currentBeatCycle
      }
      // Otherwise, keep the held value (don't generate new one)

      // Output sharp value (no smoothing)
      const outputValue: f32 = this.heldValue

      unchecked(output[i] = outputValue)

      this.lastBeat = beatValue
    }
  }
}
```
